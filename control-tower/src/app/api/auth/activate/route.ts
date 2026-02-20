import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { consumeActivationToken } from "@/lib/staffInvite";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type ActivateBody = {
  token?: string;
  password?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ActivateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const token = s(body.token);
  const password = s(body.password);
  if (!token || !password) {
    return NextResponse.json({ ok: false, error: "token and password are required." }, { status: 400 });
  }

  const weakReason = validatePasswordStrength(password);
  if (weakReason) {
    return NextResponse.json({ ok: false, error: weakReason }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userId = await consumeActivationToken(client, token);
    if (!userId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Invalid or expired activation token." }, { status: 400 });
    }

    const nextHash = await hashPassword(password);
    const q = await client.query<{ id: string; email: string }>(
      `
        update app.users
        set
          password_hash = $2,
          password_updated_at = now(),
          failed_login_attempts = 0,
          locked_until = null,
          is_active = true
        where id = $1
        returning id, email
      `,
      [userId, nextHash],
    );
    if (!q.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    }

    const userEmail = s(q.rows[0].email).toLowerCase();
    if (userEmail) {
      // Promote pending tenant staff invites for this email after activation.
      await client.query(
        `
          update app.organization_staff
          set
            status = 'active',
            joined_at = coalesce(joined_at, now()),
            last_active_at = coalesce(last_active_at, now())
          where lower(email) = lower($1)
            and status = 'invited'
        `,
        [userEmail],
      );
    }

    // Promote pending memberships tied directly to this user id.
    await client.query(
      `
        update app.organization_memberships
        set
          status = 'active',
          updated_at = now()
        where user_id = $1
          and status = 'invited'
      `,
      [userId],
    );

    // Promote pending project memberships as well (if RBAC projects exists).
    try {
      await client.query(
        `
          update app.project_memberships
          set
            status = 'active',
            updated_at = now()
          where user_id = $1
            and status = 'invited'
        `,
        [userId],
      );
    } catch (error: unknown) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code || "")
          : "";
      if (code !== "42P01") throw error;
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, activated: true });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

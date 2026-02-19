import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  buildSessionCookie,
  createSessionToken,
  DEFAULT_SESSION_TTL_SECONDS,
  getSessionSecret,
} from "@/lib/session";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Body = {
  token?: string;
  email?: string;
  fullName?: string;
  password?: string;
};

export async function POST(req: Request) {
  const bootstrapToken = s(process.env.AUTH_BOOTSTRAP_TOKEN);
  if (!bootstrapToken) {
    return NextResponse.json({ ok: false, error: "Missing AUTH_BOOTSTRAP_TOKEN." }, { status: 500 });
  }

  const secret = getSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Missing AUTH_SESSION_SECRET (or DEV_AUTH_SESSION_SECRET)." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const providedToken = s(body.token);
  if (!providedToken || providedToken !== bootstrapToken) {
    return NextResponse.json({ ok: false, error: "Invalid bootstrap token." }, { status: 401 });
  }

  const email = s(body.email).toLowerCase();
  const fullName = s(body.fullName);
  const password = s(body.password);
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }
  const weakReason = validatePasswordStrength(password);
  if (weakReason) return NextResponse.json({ ok: false, error: weakReason }, { status: 400 });

  const hash = await hashPassword(password);
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string; email: string; full_name: string | null }>(
      `
        select id, email, full_name
        from app.users
        where lower(email) = lower($1)
        limit 1
      `,
      [email],
    );

    let user = existing.rows[0] || null;
    if (!user) {
      const inserted = await client.query<{ id: string; email: string; full_name: string | null }>(
        `
          insert into app.users (
            email,
            full_name,
            is_active,
            password_hash,
            password_updated_at,
            failed_login_attempts,
            locked_until
          )
          values ($1, nullif($2, ''), true, $3, now(), 0, null)
          returning id, email, full_name
        `,
        [email, fullName, hash],
      );
      user = inserted.rows[0] || null;
    } else {
      const updated = await client.query<{ id: string; email: string; full_name: string | null }>(
        `
          update app.users
          set
            full_name = coalesce(nullif($2, ''), full_name),
            is_active = true,
            password_hash = $3,
            password_updated_at = now(),
            failed_login_attempts = 0,
            locked_until = null
          where id = $1
          returning id, email, full_name
        `,
        [user.id, fullName, hash],
      );
      user = updated.rows[0] || null;
    }
    if (!user) throw new Error("Failed to create or update bootstrap admin user.");

    // Try to grant global admin role if table exists (migration 012+).
    try {
      await client.query(
        `
          insert into app.user_global_roles (user_id, role)
          values ($1, 'agency_admin')
          on conflict (user_id, role) do nothing
        `,
        [user.id],
      );
    } catch (error: unknown) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
      if (code !== "42P01") throw error;
    }

    await client.query("COMMIT");

    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.full_name || undefined,
      ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
      secret,
    });
    const cookie = buildSessionCookie({ token, maxAgeSeconds: DEFAULT_SESSION_TTL_SECONDS });

    return new NextResponse(
      JSON.stringify({
        ok: true,
        user: { id: user.id, email: user.email, fullName: user.full_name || null },
        role: "agency_admin",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": cookie,
        },
      },
    );
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to bootstrap admin";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    client.release();
  }
}

import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireAuthUser } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function canManageAgency(globalRoles: string[]) {
  return globalRoles.some((role) => ["platform_admin", "owner", "agency_admin", "admin"].includes(s(role).toLowerCase()));
}

function normalizeGlobalRole(role: unknown) {
  const r = s(role).toLowerCase();
  if (r === "platform_admin" || r === "agency_admin" || r === "analytics") return r;
  return "";
}

type Ctx = { params: Promise<{ userId: string }> };

type PatchAgencyUserBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  status?: "active" | "invited" | "disabled";
  isActive?: boolean;
  globalRoles?: string[];
};

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;

  const { userId } = await ctx.params;
  const targetUserId = s(userId);
  if (!targetUserId) return NextResponse.json({ ok: false, error: "Missing user id" }, { status: 400 });

  const isSelf = targetUserId === auth.user.id;
  const isAgencyManager = canManageAgency(auth.user.globalRoles);
  if (!isSelf && !isAgencyManager) {
    return NextResponse.json({ ok: false, error: "Missing agency permission." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as PatchAgencyUserBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const fullName = s(body.fullName);
  const email = s(body.email).toLowerCase();
  const phone = s(body.phone);
  const avatarUrl = s(body.avatarUrl);
  const rawStatus = s(body.status).toLowerCase();
  const set: string[] = [];
  const vals: unknown[] = [targetUserId];

  if (fullName || body.fullName === "") {
    vals.push(fullName || null);
    set.push(`full_name = nullif($${vals.length}::text, '')`);
  }
  if (email) {
    vals.push(email);
    set.push(`email = $${vals.length}`);
  }
  if (phone || body.phone === "") {
    vals.push(phone || null);
    set.push(`phone = nullif($${vals.length}::text, '')`);
  }
  if (avatarUrl || body.avatarUrl === "") {
    vals.push(avatarUrl || null);
    set.push(`avatar_url = nullif($${vals.length}::text, '')`);
  }
  if (isAgencyManager && (rawStatus === "active" || rawStatus === "invited" || rawStatus === "disabled")) {
    const isActive = rawStatus === "active";
    vals.push(isActive);
    set.push(`is_active = $${vals.length}`);
    vals.push(rawStatus);
    set.push(`account_status = $${vals.length}`);
  } else if (isAgencyManager && typeof body.isActive === "boolean") {
    vals.push(body.isActive);
    set.push(`is_active = $${vals.length}`);
    vals.push(body.isActive ? "active" : "disabled");
    set.push(`account_status = $${vals.length}`);
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (set.length > 0) {
      const q = await client.query(
        `
          update app.users
          set ${set.join(", ")}
          where id = $1
          returning id
        `,
        vals,
      );
      if (!q.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
      }
    }

    if (isAgencyManager && Array.isArray(body.globalRoles)) {
      const roleSet = Array.from(new Set(body.globalRoles.map(normalizeGlobalRole).filter(Boolean)));
      try {
        await client.query(`delete from app.user_global_roles where user_id = $1`, [targetUserId]);
        for (const role of roleSet) {
          await client.query(
            `insert into app.user_global_roles (user_id, role) values ($1, $2) on conflict (user_id, role) do nothing`,
            [targetUserId, role],
          );
        }
      } catch (error: unknown) {
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
        if (code !== "42P01") throw error;
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: targetUserId });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to update user";
    const duplicate = message.toLowerCase().includes("users_email_lower_uq");
    return NextResponse.json(
      { ok: false, error: duplicate ? "Email already exists." : message },
      { status: duplicate ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;
  if (!canManageAgency(auth.user.globalRoles)) {
    return NextResponse.json({ ok: false, error: "Missing agency permission." }, { status: 403 });
  }

  const { userId } = await ctx.params;
  const targetUserId = s(userId);
  if (!targetUserId) return NextResponse.json({ ok: false, error: "Missing user id" }, { status: 400 });
  if (targetUserId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "You cannot delete your own account." }, { status: 400 });
  }

  const pool = getDbPool();
  const q = await pool.query(`delete from app.users where id = $1 returning id`, [targetUserId]);
  if (!q.rows[0]) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: true, id: targetUserId });
}

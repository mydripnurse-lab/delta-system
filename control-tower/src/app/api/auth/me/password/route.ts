import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireAuthUser } from "@/lib/authz";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type PatchPasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

export async function PATCH(req: Request) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as PatchPasswordBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const currentPassword = s(body.currentPassword);
  const newPassword = s(body.newPassword);
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ ok: false, error: "Current and new password are required." }, { status: 400 });
  }

  const weakReason = validatePasswordStrength(newPassword);
  if (weakReason) {
    return NextResponse.json({ ok: false, error: weakReason }, { status: 400 });
  }

  const pool = getDbPool();
  const existing = await pool.query<{ id: string; password_hash: string | null }>(
    `select id, password_hash from app.users where id = $1 limit 1`,
    [auth.user.id],
  );
  const row = existing.rows[0];
  if (!row) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  const isValid = row.password_hash ? await verifyPassword(currentPassword, row.password_hash) : false;
  if (!isValid) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 401 });
  }

  const nextHash = await hashPassword(newPassword);
  await pool.query(
    `
      update app.users
      set
        password_hash = $2,
        password_updated_at = now(),
        failed_login_attempts = 0,
        locked_until = null
      where id = $1
    `,
    [auth.user.id, nextHash],
  );

  return NextResponse.json({ ok: true, updated: true });
}

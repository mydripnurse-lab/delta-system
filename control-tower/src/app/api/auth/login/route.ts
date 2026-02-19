import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { createSessionToken, getSessionSecret, SESSION_COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type LoginBody = {
  email?: string;
  fullName?: string;
};

export async function POST(req: Request) {
  const secret = getSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Missing AUTH_SESSION_SECRET (or DEV_AUTH_SESSION_SECRET)." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as LoginBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const email = s(body.email).toLowerCase();
  const fullName = s(body.fullName);
  if (!email) return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });

  const pool = getDbPool();
  const existing = await pool.query<{ id: string; email: string; full_name: string | null; is_active: boolean }>(
    `
      select id, email, full_name, is_active
      from app.users
      where lower(email) = lower($1)
      limit 1
    `,
    [email],
  );

  let user = existing.rows[0] || null;
  if (!user && s(process.env.DEV_AUTH_AUTO_CREATE) === "1") {
    const inserted = await pool.query<{ id: string; email: string; full_name: string | null; is_active: boolean }>(
      `
        insert into app.users (email, full_name, is_active)
        values ($1, nullif($2, ''), true)
        returning id, email, full_name, is_active
      `,
      [email, fullName],
    );
    user = inserted.rows[0] || null;
  }

  if (!user) return NextResponse.json({ ok: false, error: "User not found." }, { status: 401 });
  if (!user.is_active) return NextResponse.json({ ok: false, error: "User is disabled." }, { status: 403 });

  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.full_name || fullName || undefined,
    secret,
  });
  const secure = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=43200",
  ]
    .filter(Boolean)
    .join("; ");

  return new NextResponse(
    JSON.stringify({
      ok: true,
      user: { id: user.id, email: user.email, fullName: user.full_name || null },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": cookie,
      },
    },
  );
}


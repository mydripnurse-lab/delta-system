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

type RegisterBody = {
  email?: string;
  fullName?: string;
  password?: string;
};

export async function POST(req: Request) {
  if (s(process.env.AUTH_ALLOW_SELF_SIGNUP) !== "1") {
    return NextResponse.json({ ok: false, error: "Self-signup disabled." }, { status: 403 });
  }

  const secret = getSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Missing AUTH_SESSION_SECRET (or DEV_AUTH_SESSION_SECRET)." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as RegisterBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const email = s(body.email).toLowerCase();
  const fullName = s(body.fullName);
  const password = s(body.password);
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }
  const weakReason = validatePasswordStrength(password);
  if (weakReason) return NextResponse.json({ ok: false, error: weakReason }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const pool = getDbPool();
  try {
    const created = await pool.query<{
      id: string;
      email: string;
      full_name: string | null;
    }>(
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
      [email, fullName, passwordHash],
    );

    const user = created.rows[0];
    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.full_name || undefined,
      ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
      secret,
    });
    const cookie = buildSessionCookie({
      token,
      maxAgeSeconds: DEFAULT_SESSION_TTL_SECONDS,
    });

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to register user";
    const duplicate = message.toLowerCase().includes("users_email_lower_uq");
    return NextResponse.json(
      { ok: false, error: duplicate ? "Email already exists." : message },
      { status: duplicate ? 409 : 500 },
    );
  }
}


import { NextResponse } from "next/server";

import { issueAccountPasswordResetToken, isTrustedAccountPasswordRequest } from "@/lib/accountPasswordReset";
import { accountSecurityEmailIsConfigured, sendAccountPasswordResetEmail } from "@/lib/accountSecurityEmail";
import { getDbPool } from "@/lib/db";
import { isPartnerAdminEmailAllowed } from "@/lib/partnerAdminAuth";

export const runtime = "nodejs";

const GENERIC_MESSAGE = "If that Admin account exists, a secure reset link will arrive shortly.";

export async function POST(request: Request) {
  if (!isTrustedAccountPasswordRequest(request, "admin")) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (!accountSecurityEmailIsConfigured()) {
    return NextResponse.json({ ok: false, error: "Password email delivery is temporarily unavailable." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  if (isPartnerAdminEmailAllowed(email)) {
    const result = await getDbPool().query<{
      id: string;
      email: string;
      full_name: string | null;
    }>(
      `select id, email, full_name
         from app.users
        where lower(email) = lower($1)
          and is_active = true
          and password_hash is not null
        limit 1`,
      [email],
    );
    const user = result.rows[0] || null;
    if (user) {
      try {
        const token = await issueAccountPasswordResetToken("admin", user.id);
        await sendAccountPasswordResetEmail({
          accountKind: "admin",
          email: user.email,
          fullName: user.full_name || "Administrator",
          token,
        });
      } catch (error) {
        console.error("Admin password reset email failed", error instanceof Error ? error.message : "Unknown error");
      }
    }
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}

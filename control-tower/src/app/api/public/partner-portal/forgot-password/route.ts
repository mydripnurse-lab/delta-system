import { NextResponse } from "next/server";

import { issueAccountPasswordResetToken, isTrustedAccountPasswordRequest } from "@/lib/accountPasswordReset";
import { accountSecurityEmailIsConfigured, sendAccountPasswordResetEmail } from "@/lib/accountSecurityEmail";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

const GENERIC_MESSAGE = "If that Partner account exists, a secure reset link will arrive shortly.";

export async function POST(request: Request) {
  if (!isTrustedAccountPasswordRequest(request, "partner")) {
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

  const result = await getDbPool().query<{
    id: string;
    email: string;
    display_name: string | null;
  }>(
    `select id, email, display_name
       from app.partner_profiles
      where lower(email) = lower($1)
        and portal_password_hash is not null
        and website_status in ('ready', 'published', 'hidden')
      order by updated_at desc
      limit 1`,
    [email],
  );
  const profile = result.rows[0] || null;
  if (profile) {
    try {
      const token = await issueAccountPasswordResetToken("partner", profile.id);
      await sendAccountPasswordResetEmail({
        accountKind: "partner",
        email: profile.email,
        fullName: profile.display_name || "Partner",
        token,
      });
    } catch (error) {
      console.error("Partner password reset email failed", error instanceof Error ? error.message : "Unknown error");
    }
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}

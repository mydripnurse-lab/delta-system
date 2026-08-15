import { NextResponse } from "next/server";

import { getAuthenticatedClientFromRequest, isTrustedClientRequest } from "@/lib/clientPortalAuth";
import { createClientReferralInvite, getClientReferralSummary } from "@/lib/clientReferrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The referral request could not be completed.";
}

export async function GET(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const account = await getAuthenticatedClientFromRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Sign in to view your referral program." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, summary: await getClientReferralSummary(account.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const account = await getAuthenticatedClientFromRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Sign in to invite a friend." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid invitation." }, { status: 400 });
  try {
    const result = await createClientReferralInvite(account.id, {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      email: body.email,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const errorMessage = message(error);
    const conflict = /already|own account/i.test(errorMessage);
    return NextResponse.json({ ok: false, error: errorMessage }, { status: conflict ? 409 : 400 });
  }
}

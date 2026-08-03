import { NextResponse } from "next/server";
import { buildClearPartnerAdminSessionCookie } from "@/lib/partnerAdminSession";

export const runtime = "nodejs";

export async function POST() {
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": buildClearPartnerAdminSessionCookie(),
    },
  });
}

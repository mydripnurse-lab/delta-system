import { NextResponse } from "next/server";
import {
  buildClearPartnerAdminDelegationCookie,
  buildClearPartnerAdminSessionCookie,
} from "@/lib/partnerAdminSession";

export const runtime = "nodejs";

export async function POST() {
  const response = new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
  response.headers.append("set-cookie", buildClearPartnerAdminSessionCookie());
  response.headers.append("set-cookie", buildClearPartnerAdminDelegationCookie());
  return response;
}

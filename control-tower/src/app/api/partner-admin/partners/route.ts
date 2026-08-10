import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { listPartnerAdminDirectory } from "@/lib/partnerServiceAssignments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const partners = await listPartnerAdminDirectory();
    return NextResponse.json({ ok: true, partners }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load Partners." },
      { status: 500 },
    );
  }
}

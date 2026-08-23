import { NextRequest, NextResponse } from "next/server";

import { listAdminCareAccounts } from "@/lib/adminCareAccounts";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "care" });
  if ("response" in auth) return auth.response;
  try {
    const result = await listAdminCareAccounts({
      search: request.nextUrl.searchParams.get("search") || "",
      status: request.nextUrl.searchParams.get("status") || "all",
      provider: request.nextUrl.searchParams.get("provider") || "all",
      limit: Number(request.nextUrl.searchParams.get("limit") || 250),
      stateCodes: auth.access.stateCodes,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[partner-admin care] failed", error);
    return NextResponse.json({ ok: false, error: "Could not load Care accounts." }, { status: 500 });
  }
}

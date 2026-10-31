import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { loadSelectablePricingRegions, syncPricingRegions } from "@/lib/regionalPricingCatalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(req: NextRequest, sync: boolean) {
  const auth = await requirePartnerAdmin(req, { module: "services", ownerOnly: true });
  if ("response" in auth) return auth.response;
  try {
    if (sync) await syncPricingRegions();
    const snapshot = await loadSelectablePricingRegions(req.nextUrl.searchParams.get("state") || "");
    return NextResponse.json({ ok: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load locations." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);

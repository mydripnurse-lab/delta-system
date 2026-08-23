import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { listStaffApplications } from "@/lib/staffAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAdmin(req, { module: "applications" });
  if ("response" in auth) return auth.response;

  try {
    const searchParams = req.nextUrl.searchParams;
    const applications = await listStaffApplications({
      search: searchParams.get("search") || "",
      status: searchParams.get("status") || "all",
      limit: Number(searchParams.get("limit") || 250),
      stateCodes: auth.access.stateCodes,
    });
    return NextResponse.json({ ok: true, applications });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load partner applications." },
      { status: 500 },
    );
  }
}

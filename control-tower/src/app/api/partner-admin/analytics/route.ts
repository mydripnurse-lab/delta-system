import { NextRequest, NextResponse } from "next/server";

import { loadAdminAppointmentAnalytics } from "@/lib/adminAppointmentAnalytics";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getStateMarketManagerCommissionSummary, listStateMarketManagers } from "@/lib/stateMarketManagers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "analytics" });
  if ("response" in auth) return auth.response;
  try {
    const analytics = await loadAdminAppointmentAnalytics({
      period: request.nextUrl.searchParams.get("period") || "90",
      status: request.nextUrl.searchParams.get("status") || "",
      from: request.nextUrl.searchParams.get("from") || "",
      to: request.nextUrl.searchParams.get("to") || "",
      search: request.nextUrl.searchParams.get("search") || "",
      granularity: request.nextUrl.searchParams.get("granularity") || "week",
      stateCodes: auth.access.stateCodes,
    });
    const platformShareRate = 40;
    const managerRateOfPlatformShare = auth.access.managerCommissionRate;
    const ledgerFinancials = auth.access.isOwner
      ? null
      : await getStateMarketManagerCommissionSummary(auth.user.id);
    const managerFinancials = auth.access.isOwner || !ledgerFinancials
      ? null
      : {
          ...ledgerFinancials,
          completedAppointments: analytics.summary.completed,
          grossCompletedValue: analytics.summary.completedValue,
          platformShareRate,
          platformShareValue: analytics.summary.completedValue * (platformShareRate / 100),
          managerRateOfPlatformShare,
          effectiveGrossRate: platformShareRate * (managerRateOfPlatformShare / 100),
          estimatedCommission:
            analytics.summary.completedValue *
            (platformShareRate / 100) *
            (managerRateOfPlatformShare / 100),
        };
    const managerPerformance = auth.access.isOwner ? await listStateMarketManagers() : [];

    return NextResponse.json(
      {
        ok: true,
        analytics: {
          ...analytics,
          viewer: {
            role: auth.access.role,
            isOwner: auth.access.isOwner,
            stateCodes: auth.access.stateCodes,
            stateNames: auth.access.stateNames,
          },
          managerFinancials,
          managerPerformance,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[partner-admin analytics] failed", error);
    return NextResponse.json({ ok: false, error: "Could not load geographic analytics." }, { status: 500 });
  }
}

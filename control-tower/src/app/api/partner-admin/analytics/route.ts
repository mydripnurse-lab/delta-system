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
    let ledgerFinancials: Awaited<ReturnType<typeof getStateMarketManagerCommissionSummary>> | null = null;
    let managerPerformance: Awaited<ReturnType<typeof listStateMarketManagers>> = [];

    // Manager commissions enrich the report, but they must never make the
    // core geographic analytics unavailable while a new schema is rolling out.
    try {
      if (auth.access.isOwner) {
        managerPerformance = await listStateMarketManagers();
      } else {
        ledgerFinancials = await getStateMarketManagerCommissionSummary(auth.user.id);
      }
    } catch (error) {
      console.warn("[partner-admin analytics] market manager enrichment unavailable", error);
    }
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

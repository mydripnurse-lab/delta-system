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
          completedAppointments: analytics.summary.completed,
          grossCompletedValue: analytics.summary.completedValue,
          grossAppointmentValue: ledgerFinancials.grossAppointmentValue,
          earnedCommission: ledgerFinancials.earnedCommission,
          paidCommission: ledgerFinancials.paidCommission,
          pendingCommission: ledgerFinancials.pendingCommission,
        };
    const viewerAnalytics = auth.access.isOwner ? analytics : {
      ...analytics,
      summary: {
        ...analytics.summary,
        intentPlatformRevenue: 0,
        intentPartnerEarnings: 0,
        lostPlatformRevenue: 0,
        lostPartnerEarnings: 0,
        partnerEarnings: 0,
        platformRevenue: 0,
        refundedRevenue: 0,
        failedDepositValue: 0,
        activePartnerValue: 0,
        activePlatformValue: 0,
      },
    };
    return NextResponse.json(
      {
        ok: true,
        analytics: {
          ...viewerAnalytics,
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

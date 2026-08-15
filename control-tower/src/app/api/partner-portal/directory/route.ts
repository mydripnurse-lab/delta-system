import { NextResponse } from "next/server";

import { getPartnerDirectoryMetrics, getPartnerDirectoryRankingSignals } from "@/lib/partnerDirectoryAnalytics";
import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const [metrics, readinessByProfile] = await Promise.all([
      getPartnerDirectoryMetrics(session.profile_id, url.searchParams.get("start") || "", url.searchParams.get("end") || ""),
      getPartnerDirectoryRankingSignals([session.profile_id]),
    ]);
    const readiness = readinessByProfile.get(session.profile_id) || {
      availabilityConfigured: false,
      acceptanceRate: 100,
      completedAppointments: 0,
      organicScore: 50,
    };
    return NextResponse.json({ ok: true, dashboard: { ...metrics, readiness } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load directory performance." }, { status: 500 });
  }
}

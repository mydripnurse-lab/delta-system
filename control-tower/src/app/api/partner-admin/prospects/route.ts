import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getDbPool } from "@/lib/db";
import { findGooglePartnerProspects, isGooglePartnerProspectingConfigured } from "@/lib/googlePartnerProspecting";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  countPartnerAdminProspectRuns,
  countPartnerAdminProspects,
  getLatestPartnerAdminProspectRun,
  listPartnerAdminProspects,
  savePartnerAdminProspectingRun,
} from "@/lib/prospectingStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function market(value: unknown, maxLength: number) {
  return text(value).slice(0, maxLength).replace(/[^\p{L}\p{N} .,'’&()-]/gu, "").trim();
}

async function organizationId(userId: string, email: string) {
  const result = await getDbPool().query<{ id: string }>(
    `
      select organization_id::text as id
        from app.organization_memberships
       where user_id = $1::uuid and status = 'active'
      union
      select organization_id::text as id
        from app.organization_staff
       where lower(email) = lower($2) and status = 'active'
      limit 1
    `,
    [userId, email],
  );
  return text(result.rows[0]?.id);
}

async function context(request: NextRequest, county: string, state: string) {
  const auth = await requirePartnerAdmin(request, { module: "automations", ownerOnly: true });
  if ("response" in auth) return { response: auth.response } as const;
  if (!county || !state) return { response: NextResponse.json({ ok: false, error: "County and state are required." }, { status: 400 }) } as const;
  const organization = await organizationId(auth.user.id, auth.user.email);
  if (!organization) return { response: NextResponse.json({ ok: false, error: "No active administrative organization was found." }, { status: 403 }) } as const;
  return { organization } as const;
}

export async function GET(request: NextRequest) {
  const county = market(request.nextUrl.searchParams.get("county"), 120);
  const state = market(request.nextUrl.searchParams.get("state"), 80);
  const auth = await context(request, county, state);
  if ("response" in auth) return auth.response;
  try {
    const [prospects, savedCount, lastRun] = await Promise.all([
      listPartnerAdminProspects({ organizationId: auth.organization, county, state, limit: 10 }),
      countPartnerAdminProspects({ organizationId: auth.organization, county, state }),
      getLatestPartnerAdminProspectRun({ organizationId: auth.organization, county, state }),
    ]);
    return NextResponse.json({
      ok: true,
      configured: isGooglePartnerProspectingConfigured(),
      county,
      state,
      prospects,
      savedCount,
      lastRun,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[partner-admin prospects] load failed", error);
    return NextResponse.json({ ok: false, error: "Could not load saved Partner prospects." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const county = market(body.county, 120);
  const state = market(body.state, 80);
  const auth = await context(request, county, state);
  if ("response" in auth) return auth.response;
  if (!isGooglePartnerProspectingConfigured()) {
    return NextResponse.json({
      ok: false,
      code: "GOOGLE_PLACES_SETUP_REQUIRED",
      error: "Google Places prospecting is not configured yet.",
    }, { status: 503 });
  }

  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  try {
    const [runCount, before] = await Promise.all([
      countPartnerAdminProspectRuns({ organizationId: auth.organization, county, state }),
      listPartnerAdminProspects({ organizationId: auth.organization, county, state, limit: 100 }),
    ]);
    const existingIds = new Set(before.map((prospect) => prospect.placeId));
    const found = await findGooglePartnerProspects({ county, state, runCount });
    const newProspects = found.prospects.filter((prospect) => !existingIds.has(prospect.placeId)).length;
    await savePartnerAdminProspectingRun({
      organizationId: auth.organization,
      prospects: found.prospects,
      run: {
        id: runId,
        county,
        state,
        queries: found.queries,
        discovered: found.discovered,
        saved: found.prospects.length,
        newProspects,
        status: "ok",
        error: "",
        createdAt: startedAt,
      },
    });
    const [prospects, savedCount, lastRun] = await Promise.all([
      listPartnerAdminProspects({ organizationId: auth.organization, county, state, limit: 10 }),
      countPartnerAdminProspects({ organizationId: auth.organization, county, state }),
      getLatestPartnerAdminProspectRun({ organizationId: auth.organization, county, state }),
    ]);
    return NextResponse.json({ ok: true, configured: true, county, state, prospects, savedCount, lastRun }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Google Places error";
    console.error("[partner-admin prospects] search failed", error);
    try {
      await savePartnerAdminProspectingRun({
        organizationId: auth.organization,
        prospects: [],
        run: { id: runId, county, state, queries: [], discovered: 0, saved: 0, newProspects: 0, status: "error", error: message.slice(0, 500), createdAt: startedAt },
      });
    } catch (recordError) {
      console.error("[partner-admin prospects] could not record failed run", recordError);
    }
    return NextResponse.json({ ok: false, error: "Google could not complete this county search. Try again shortly." }, { status: 502 });
  }
}

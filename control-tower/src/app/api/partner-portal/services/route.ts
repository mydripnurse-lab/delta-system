import { NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { listPartnerPortalServices, setPartnerPortalService } from "@/lib/partnerServiceAssignments";
import { ensureServiceCatalogSchema } from "@/lib/myDripNurseServiceCatalog";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "mydripnurse.com" || hostname.endsWith(".mydripnurse.com");
  } catch { return false; }
}

export async function GET() {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, services: await listPartnerPortalServices(session.application_id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load services." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const serviceKey = String(body?.serviceKey || "").trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceKey) || typeof body?.active !== "boolean") {
      return NextResponse.json({ ok: false, error: "A valid service and active state are required." }, { status: 400 });
    }
    const matrix = await setPartnerPortalService({ applicationId: session.application_id, serviceKey, active: body.active });
    return NextResponse.json({ ok: true, services: await listPartnerPortalServices(session.application_id), matrix });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update service." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const type = String(body?.type || "service").trim().toLowerCase();
    const name = String(body?.name || "").trim();
    const details = String(body?.details || "").trim();
    const ingredients = Array.isArray(body?.ingredients) ? body.ingredients.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 40) : [];
    if (!["service", "recipe", "other"].includes(type) || name.length < 2 || name.length > 160) {
      return NextResponse.json({ ok: false, error: "Choose a suggestion type and provide a service or recipe name." }, { status: 400 });
    }
    if (details.length > 4000) return NextResponse.json({ ok: false, error: "Suggestion details are too long." }, { status: 400 });
    await ensureServiceCatalogSchema();
    await getDbPool().query(
      `insert into app.partner_service_suggestions (organization_id, partner_profile_id, suggestion_type, name, ingredients, details)
       values ($1, $2, $3, $4, $5::text[], $6)`,
      [session.organization_id, session.profile_id, type, name, ingredients, details],
    );
    return NextResponse.json({ ok: true, message: "Suggestion sent to the My Drip Nurse team." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to submit suggestion." }, { status: 400 });
  }
}

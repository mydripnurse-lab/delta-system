import { NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { getPartnerPushPublicConfiguration, removePartnerPushSubscription, savePartnerPushSubscription } from "@/lib/partnerPushNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "mydripnurse.com" || hostname.endsWith(".mydripnurse.com");
  } catch {
    return false;
  }
}

function validEndpoint(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function GET() {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Partner authentication required." }, { status: 401 });
  return NextResponse.json({ ok: true, ...getPartnerPushPublicConfiguration() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Partner authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const endpoint = String(body?.endpoint || "").trim();
    const p256dh = String(body?.keys?.p256dh || "").trim();
    const auth = String(body?.keys?.auth || "").trim();
    if (!validEndpoint(endpoint) || endpoint.length > 4000 || !p256dh || p256dh.length > 1000 || !auth || auth.length > 1000) {
      return NextResponse.json({ ok: false, error: "Invalid push subscription." }, { status: 400 });
    }
    const expirationTime = body?.expirationTime == null
      ? null
      : Number.isFinite(Number(body.expirationTime)) ? Number(body.expirationTime) : null;
    await savePartnerPushSubscription({
      profileId: session.profile_id,
      endpoint,
      p256dh,
      auth,
      expirationTime,
      userAgent: request.headers.get("user-agent") || "",
    });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save push subscription." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Partner authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const endpoint = String(body?.endpoint || "").trim();
    if (!validEndpoint(endpoint)) return NextResponse.json({ ok: false, error: "Invalid push subscription." }, { status: 400 });
    await removePartnerPushSubscription(session.profile_id, endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to remove push subscription." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { addPartnerSupportMessage, createPartnerSupportTicket, listPartnerSupportTickets } from "@/lib/partnerSupport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validOrigin(request: Request) {
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
    return NextResponse.json({ ok: true, tickets: await listPartnerSupportTickets(session.profile_id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load support tickets." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const ticketId = String(body?.ticketId || "").trim();
    const message = String(body?.message || body?.body || "").trim();
    if (message.length < 2 || message.length > 5000) return NextResponse.json({ ok: false, error: "Write a message between 2 and 5,000 characters." }, { status: 400 });
    if (ticketId) {
      await addPartnerSupportMessage({ ticketId, profileId: session.profile_id, body: message });
      return NextResponse.json({ ok: true, tickets: await listPartnerSupportTickets(session.profile_id) });
    }
    const subject = String(body?.subject || "Support request").trim();
    const category = String(body?.category || "general").trim().toLowerCase();
    const priority = String(body?.priority || "normal").trim().toLowerCase();
    if (subject.length < 3 || subject.length > 160) return NextResponse.json({ ok: false, error: "Add a subject between 3 and 160 characters." }, { status: 400 });
    if (!["general", "appointments", "website", "payments", "services"].includes(category)) return NextResponse.json({ ok: false, error: "Choose a valid support category." }, { status: 400 });
    if (!["low", "normal", "high", "urgent"].includes(priority)) return NextResponse.json({ ok: false, error: "Choose a valid priority." }, { status: 400 });
    await createPartnerSupportTicket({ organizationId: session.organization_id, profileId: session.profile_id, subject, category, priority: priority as "low" | "normal" | "high" | "urgent", body: message });
    return NextResponse.json({ ok: true, message: "Support ticket created.", tickets: await listPartnerSupportTickets(session.profile_id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save support message." }, { status: 400 });
  }
}

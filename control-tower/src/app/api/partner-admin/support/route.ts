import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getDbPool } from "@/lib/db";
import { listAdminSupportTickets, listSupportAgents, updateAdminSupportTicket } from "@/lib/partnerSupport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "support" });
  if ("response" in auth) return auth.response;
  try {
    const organization = await getDbPool().query<{ id: string }>(`select organization_id as id from app.organization_memberships where user_id = $1 and status = 'active' union select organization_id as id from app.organization_staff where lower(email) = lower($2) and status = 'active' limit 1`, [auth.user.id, auth.user.email]);
    const organizationId = organization.rows[0]?.id;
    if (!organizationId) return NextResponse.json({ ok: false, error: "Administrator organization not found." }, { status: 404 });
    const agents = auth.access.isOwner
      ? await listSupportAgents()
      : [{ id: auth.user.id, name: auth.user.fullName || auth.user.email, email: auth.user.email }];
    return NextResponse.json({
      ok: true,
      tickets: await listAdminSupportTickets(organizationId, auth.access.stateCodes),
      agents,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load support inbox." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "support" });
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const ticketId = String(body?.ticketId || "").trim();
    const message = String(body?.message || "").trim();
    const status = body?.status ? String(body.status) : undefined;
    const assignedUserId = body?.assignedUserId === undefined ? undefined : (body.assignedUserId ? String(body.assignedUserId) : null);
    if (!ticketId) return NextResponse.json({ ok: false, error: "Ticket id is required." }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ ok: false, error: "Message is too long." }, { status: 400 });
    if (status && !["open", "pending", "closed"].includes(status)) return NextResponse.json({ ok: false, error: "Invalid ticket status." }, { status: 400 });
    const organization = await getDbPool().query<{ id: string }>(`select organization_id as id from app.organization_memberships where user_id = $1 and status = 'active' union select organization_id as id from app.organization_staff where lower(email) = lower($2) and status = 'active' limit 1`, [auth.user.id, auth.user.email]);
    const organizationId = organization.rows[0]?.id;
    if (!organizationId) return NextResponse.json({ ok: false, error: "Administrator organization not found." }, { status: 404 });
    const safeAssignedUserId = auth.access.isOwner ? assignedUserId : auth.user.id;
    await updateAdminSupportTicket({
      ticketId,
      organizationId,
      adminUserId: auth.user.id,
      body: message || undefined,
      status: status as "open" | "pending" | "closed" | undefined,
      assignedUserId: safeAssignedUserId,
      stateCodes: auth.access.stateCodes,
    });
    const agents = auth.access.isOwner
      ? await listSupportAgents()
      : [{ id: auth.user.id, name: auth.user.fullName || auth.user.email, email: auth.user.email }];
    return NextResponse.json({
      ok: true,
      tickets: await listAdminSupportTickets(organizationId, auth.access.stateCodes),
      agents,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update ticket." }, { status: 400 });
  }
}

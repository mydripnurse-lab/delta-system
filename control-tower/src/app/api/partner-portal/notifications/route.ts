import { NextRequest, NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { listPartnerPortalNotifications, markPartnerPortalNotificationsRead } from "@/lib/partnerPortalNotifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Partner authentication required." }, { status: 401 });
  try {
    const notifications = await listPartnerPortalNotifications(session.profile_id);
    return NextResponse.json({ ok: true, notifications, unreadCount: notifications.filter((notification) => !notification.readAt).length }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Partner authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const notificationIds = Array.isArray(body?.notificationIds)
      ? body.notificationIds.map((id: unknown) => String(id || ""))
      : [String(body?.notificationId || "")];
    const unreadCount = await markPartnerPortalNotificationsRead(session.profile_id, notificationIds);
    return NextResponse.json({ ok: true, unreadCount }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not update notifications." }, { status: 500 });
  }
}

import { heartbeatFinish, heartbeatStart } from "@/lib/cronHeartbeat";
import { runPartnerAppointmentPushReminders } from "@/lib/partnerPushNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const expected = String(process.env.CRON_SECRET || "").trim();
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!expected || authorization !== `Bearer ${expected}`) {
    await heartbeatStart({ jobKey: "partner-appointment-push-reminders", endpoint: "/api/cron/partner-appointment-reminders" });
    await heartbeatFinish({ jobKey: "partner-appointment-push-reminders", status: "unauthorized", startedAtMs, error: "Unauthorized cron request." });
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  await heartbeatStart({ jobKey: "partner-appointment-push-reminders", endpoint: "/api/cron/partner-appointment-reminders" });
  try {
    const result = await runPartnerAppointmentPushReminders();
    await heartbeatFinish({ jobKey: "partner-appointment-push-reminders", status: "ok", startedAtMs, result });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Partner reminder cron failed.";
    await heartbeatFinish({ jobKey: "partner-appointment-push-reminders", status: "error", startedAtMs, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

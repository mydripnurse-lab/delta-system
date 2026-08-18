import { processDueBookingLeadWebhooks } from "@/lib/bookingLeadCapture";
import { heartbeatFinish, heartbeatStart } from "@/lib/cronHeartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isAuthorized(request: Request) {
  const expected = text(
    process.env.CRON_SECRET || process.env.DASHBOARD_CRON_SECRET || process.env.PROSPECTING_CRON_SECRET,
  );
  if (!expected) return false;
  const authorization = text(request.headers.get("authorization"));
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return bearer === expected;
}

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const jobKey = "booking-lead-webhooks";
  const endpoint = "/api/cron/booking-lead-webhooks";
  await heartbeatStart({ jobKey, endpoint });
  if (!isAuthorized(request)) {
    await heartbeatFinish({ jobKey, status: "unauthorized", startedAtMs, error: "Unauthorized cron request." });
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processDueBookingLeadWebhooks(25);
    await heartbeatFinish({ jobKey, status: "ok", startedAtMs, result });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking lead delivery failed.";
    console.error("[booking-lead-webhooks] cron failed", { error: message });
    await heartbeatFinish({ jobKey, status: "error", startedAtMs, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

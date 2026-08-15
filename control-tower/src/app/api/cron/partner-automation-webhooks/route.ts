import { heartbeatFinish, heartbeatStart } from "@/lib/cronHeartbeat";
import { retryPartnerAutomationWebhooks } from "@/lib/publicStaffProvisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function s(value: unknown) {
  return String(value ?? "").trim();
}

function isAuthorized(request: Request) {
  const expected = s(
    process.env.CRON_SECRET || process.env.DASHBOARD_CRON_SECRET || process.env.PROSPECTING_CRON_SECRET,
  );
  if (!expected) return false;
  const authorization = s(request.headers.get("authorization"));
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return bearer === expected;
}

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const jobKey = "partner-automation-webhooks";
  const endpoint = "/api/cron/partner-automation-webhooks";
  await heartbeatStart({ jobKey, endpoint });
  if (!isAuthorized(request)) {
    await heartbeatFinish({ jobKey, status: "unauthorized", startedAtMs, error: "Unauthorized cron request." });
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await retryPartnerAutomationWebhooks(10);
    await heartbeatFinish({ jobKey, status: "ok", startedAtMs, result });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Partner Automation retry failed.";
    console.error("[partner-webhook] retry-batch-failed", { error: message });
    await heartbeatFinish({ jobKey, status: "error", startedAtMs, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

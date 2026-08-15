import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL("../src/lib/publicStaffProvisioning.ts", import.meta.url);
const sourcePath = fileURLToPath(sourceUrl);
const source = await readFile(sourceUrl, "utf8");

const checks = [
  {
    ok: /accountReadyWebhookUrl:\s*s\(row\.webhook_url\)/.test(source),
    message: "Account-ready welcome must read its URL from Partner Admin > Automations.",
  },
  {
    ok: /applicantReceivedWebhookUrl:\s*s\(row\.applicant_received_webhook_url\)/.test(source),
    message: "Application received must read its URL from Partner Admin > Automations.",
  },
  {
    ok: /adminNotificationWebhookUrl:\s*s\(row\.admin_notification_webhook_url\)/.test(source),
    message: "Application admin notification must read its URL from Partner Admin > Automations.",
  },
  {
    ok: !/(accountReadyWebhookUrl|applicantReceivedWebhookUrl|adminNotificationWebhookUrl):[^\n]*process\.env/.test(source),
    message: "Partner Automation webhook URLs must not fall back to environment variables.",
  },
  {
    ok: /function sanitizePartnerAutomationPayload/.test(source) && /value\.startsWith\("data:"\)/.test(source),
    message: "Partner Automation payloads must remove embedded data URLs before delivery.",
  },
  {
    ok: /create table if not exists app\.partner_automation_deliveries/.test(source),
    message: "Partner Automation delivery must remain backed by the durable outbox.",
  },
  {
    ok: /unique \(organization_id, target, event_id\)/.test(source),
    message: "Partner Automation delivery must remain idempotent by event ID.",
  },
];

const failures = checks.filter((check) => !check.ok);
if (failures.length) {
  console.error(`Partner webhook regression check failed for ${sourcePath}:`);
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log("Partner webhook regression check passed.");

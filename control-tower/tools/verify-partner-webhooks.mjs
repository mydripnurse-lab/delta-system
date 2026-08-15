import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL("../src/lib/publicStaffProvisioning.ts", import.meta.url);
const sourcePath = fileURLToPath(sourceUrl);
const source = await readFile(sourceUrl, "utf8");
const settingsUrl = new URL("../src/lib/partnerAdminSettings.ts", import.meta.url);
const settingsSource = await readFile(settingsUrl, "utf8");

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
  {
    ok: /id:\s*"application_received"/.test(settingsSource)
      && /id:\s*"account_ready"/.test(settingsSource),
    message: "Application Received and Account-ready Welcome must remain separate Communication cards.",
  },
  {
    ok: /input\.router === "application_received"[\s\S]*?set applicant_received_webhook_url = \$2,[\s\S]*?admin_notification_webhook_url = \$2/.test(settingsSource),
    message: "Application Received must save only its applicant/Admin destination.",
  },
  {
    ok: /input\.router === "account_ready"[\s\S]*?set webhook_url = \$2/.test(settingsSource),
    message: "Account-ready Welcome must save its own destination.",
  },
  {
    ok: !/set webhook_url = \$2,\s*applicant_received_webhook_url = \$2/.test(settingsSource),
    message: "Saving an onboarding workflow must never overwrite the other onboarding webhook URL.",
  },
];

const failures = checks.filter((check) => !check.ok);
if (failures.length) {
  console.error(`Partner webhook regression check failed for ${sourcePath}:`);
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log("Partner webhook regression check passed.");

import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

type PhoneOtpInput = {
  challengeId: string;
  accountId: string;
  fullName: string;
  email: string;
  phone: string;
  code: string;
  expiresInMinutes: number;
};

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Patient", lastName: parts.slice(1).join(" ") };
}

export async function sendClientPhoneOtpThroughGhl(input: PhoneOtpInput) {
  await ensureStaffSchema();
  const query = await getDbPool().query<{ account_security_webhook_url: string | null }>(
    `select c.account_security_webhook_url
       from app.staff_form_configs c
       join app.organizations o on o.id = c.organization_id
      where c.enabled = true
        and nullif(trim(c.account_security_webhook_url), '') is not null
      order by case when lower(o.name) = 'my drip nurse' then 0 else 1 end, c.updated_at desc
      limit 1`,
  );
  const endpoint = String(query.rows[0]?.account_security_webhook_url || "").trim();
  if (!endpoint) throw new Error("Phone verification SMS is not configured in Communications.");

  const occurredAt = new Date().toISOString();
  const { firstName, lastName } = splitName(input.fullName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        event: "account_security_challenge_requested",
        version: 1,
        eventId: input.challengeId,
        idempotencyKey: `account-security:${input.challengeId}`,
        occurredAt,
        workflowRouter: "account_security",
        primaryAudience: "client",
        purpose: "phone_verification",
        deliveryChannel: "sms",
        recipient: {
          accountId: input.accountId,
          firstName,
          lastName,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
        },
        code: input.code,
        expiresInMinutes: input.expiresInMinutes,
      }),
    });
    if (!response.ok) throw new Error(`GHL rejected the phone verification request (${response.status}).`);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Phone verification timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

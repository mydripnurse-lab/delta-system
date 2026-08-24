import { ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";
import { listPartnerAdminNotificationSettings } from "@/lib/partnerAdminSettings";

type ManagerAssignment = { stateCode: string; commissionRate: number };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || fullName, lastName: parts.slice(1).join(" ") };
}

export async function sendMarketManagerAccountReadyWebhook(input: {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  assignments: ManagerAssignment[];
  passwordConfigured: boolean;
  activationLink: string;
  loginUrl: string;
}) {
  const settings = await listPartnerAdminNotificationSettings();
  const configured = settings.filter((item) => item.enabled && item.accountReadyWebhookConfigured && item.accountReadyWebhookUrl);
  const preferredTenantId = text(process.env.MDN_PLATFORM_TENANT_ID || process.env.DEFAULT_TENANT_ID);
  const selected = configured.find((item) => preferredTenantId && item.tenantId === preferredTenantId)
    || configured.find((item) => item.tenantName.toLowerCase().includes("my drip nurse"))
    || configured[0];
  if (!selected) return { sent: false, reason: "The A02 Account-ready webhook is not configured." as const };

  const occurredAt = new Date().toISOString();
  const { firstName, lastName } = splitName(input.fullName);
  const states = input.assignments.map((assignment) => assignment.stateCode);
  const actionUrl = input.passwordConfigured ? input.loginUrl : input.activationLink;
  const payload = {
    event: "market_manager_account_ready",
    eventId: `market_manager_account_ready:${input.userId}`,
    idempotencyKey: `market_manager_account_ready:${input.userId}`,
    version: 1,
    test: false,
    occurredAt,
    accountReady: true,
    passwordConfigured: input.passwordConfigured,
    activationRequired: !input.passwordConfigured,
    activationLinkExpiresInDays: input.passwordConfigured ? 0 : 3,
    loginUrl: input.loginUrl,
    actionUrl,
    welcomeLandingPageUrl: actionUrl,
    marketStates: states,
    marketStateNames: states.join(", "),
    managerUserId: input.userId,
    firstName,
    lastName,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    marketManager: {
      id: input.userId,
      firstName,
      lastName,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      states,
    },
  };
  const routedPayload = { ...payload, ...ghlRoutingFieldsForPayload(payload.event, payload) };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(selected.accountReadyWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(routedPayload),
      signal: controller.signal,
    });
    const responseText = await response.text().catch(() => "");
    if (!response.ok) throw new Error(`A02 webhook failed (${response.status}) ${responseText.slice(0, 180)}`);
    return { sent: true, status: response.status, tenantId: selected.tenantId };
  } finally {
    clearTimeout(timeout);
  }
}

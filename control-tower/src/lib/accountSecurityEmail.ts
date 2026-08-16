import { createHash } from "node:crypto";

type PasswordResetEmailInput = {
  accountKind: "partner" | "admin";
  email: string;
  fullName: string;
  token: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

export function accountSecurityEmailIsConfigured() {
  return Boolean(text(process.env.RESEND_API_KEY) && text(
    process.env.ACCOUNT_SECURITY_EMAIL_FROM || process.env.CLIENT_EMAIL_FROM || process.env.EMAIL_FROM,
  ));
}

export async function sendAccountPasswordResetEmail(input: PasswordResetEmailInput) {
  const apiKey = text(process.env.RESEND_API_KEY);
  const from = text(process.env.ACCOUNT_SECURITY_EMAIL_FROM || process.env.CLIENT_EMAIL_FROM || process.env.EMAIL_FROM);
  if (!apiKey || !from) throw new Error("Password security email is not configured.");

  const portalName = input.accountKind === "partner" ? "Partner Portal" : "Admin Workspace";
  const portalHost = input.accountKind === "partner" ? "partners.mydripnurse.com" : "admin.mydripnurse.com";
  const resetUrl = `https://${portalHost}/reset-password?token=${encodeURIComponent(input.token)}`;
  const safeName = escapeHtml(input.fullName || "there");
  const deliveryKey = createHash("sha256").update(input.token).digest("hex").slice(0, 32);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `mdn-${input.accountKind}-reset-${deliveryKey}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `Reset your My Drip Nurse ${portalName} password`,
      html: `<!doctype html><html><body style="margin:0;background:#f2f7f6;font-family:Arial,sans-serif;color:#17353a"><div style="max-width:560px;margin:0 auto;padding:42px 20px"><div style="background:#fff;border:1px solid #dce7e6;border-radius:28px;padding:38px"><img src="https://${portalHost}/mdn-logo.png" width="178" alt="My Drip Nurse" style="display:block;margin-bottom:32px"><p style="margin:0 0 12px;color:#078596;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Account security · ${portalName}</p><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:36px;font-weight:400;line-height:1.08">Reset your password, ${safeName}.</h1><p style="margin:0 0 28px;color:#526b70;font-size:16px;line-height:1.65">Use this secure link to choose a new password for your My Drip Nurse ${portalName} account.</p><a href="${resetUrl}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#075c68;color:#fff;font-weight:800;text-decoration:none">Choose a new password</a><p style="margin:28px 0 0;color:#78898b;font-size:12px;line-height:1.5">This link expires in one hour and can only be used once. If you did not request it, no changes are needed.</p></div></div></body></html>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

type VerificationEmailInput = {
  email: string;
  fullName: string;
  token: string;
  returnTo?: string;
};

type PasswordResetEmailInput = VerificationEmailInput;

type PasswordChangeCodeEmailInput = {
  email: string;
  fullName: string;
  code: string;
  challengeId: string;
  expiresInMinutes: number;
};

function s(value: unknown) {
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

export function clientEmailIsConfigured() {
  return Boolean(s(process.env.RESEND_API_KEY) && s(process.env.CLIENT_EMAIL_FROM || process.env.EMAIL_FROM));
}

export async function sendClientVerificationEmail(input: VerificationEmailInput) {
  const apiKey = s(process.env.RESEND_API_KEY);
  const from = s(process.env.CLIENT_EMAIL_FROM || process.env.EMAIL_FROM);
  if (!apiKey || !from) throw new Error("Client verification email is not configured.");
  const verifyParams = new URLSearchParams({ token: input.token });
  if (input.returnTo) verifyParams.set("returnTo", input.returnTo);
  const verifyUrl = `https://care.mydripnurse.com/verify-email?${verifyParams.toString()}`;
  const safeName = escapeHtml(input.fullName || "there");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `mdn-client-verify-${input.token.slice(0, 20)}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Verify your My Drip Nurse account",
      html: `<!doctype html><html><body style="margin:0;background:#f2f7f6;font-family:Arial,sans-serif;color:#17353a"><div style="max-width:560px;margin:0 auto;padding:42px 20px"><div style="background:#fff;border:1px solid #dce7e6;border-radius:28px;padding:38px"><img src="https://care.mydripnurse.com/mdn-logo.png" width="178" alt="My Drip Nurse" style="display:block;margin-bottom:32px"><p style="margin:0 0 12px;color:#078596;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Secure patient access</p><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:38px;font-weight:400;line-height:1.05">Welcome, ${safeName}.</h1><p style="margin:0 0 28px;color:#526b70;font-size:16px;line-height:1.65">Verify your email to securely connect your My Drip Nurse appointments and care experience.</p><a href="${verifyUrl}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#075c68;color:#fff;font-weight:800;text-decoration:none">Verify my email</a><p style="margin:28px 0 0;color:#78898b;font-size:12px;line-height:1.5">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p></div></div></body></html>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Verification email failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

export async function sendClientPasswordResetEmail(input: PasswordResetEmailInput) {
  const apiKey = s(process.env.RESEND_API_KEY);
  const from = s(process.env.CLIENT_EMAIL_FROM || process.env.EMAIL_FROM);
  if (!apiKey || !from) throw new Error("Client password reset email is not configured.");
  const resetUrl = `https://care.mydripnurse.com/reset-password?token=${encodeURIComponent(input.token)}`;
  const safeName = escapeHtml(input.fullName || "there");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `mdn-client-reset-${input.token.slice(0, 20)}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Reset your My Drip Nurse password",
      html: `<!doctype html><html><body style="margin:0;background:#f2f7f6;font-family:Arial,sans-serif;color:#17353a"><div style="max-width:560px;margin:0 auto;padding:42px 20px"><div style="background:#fff;border:1px solid #dce7e6;border-radius:28px;padding:38px"><img src="https://care.mydripnurse.com/mdn-logo.png" width="178" alt="My Drip Nurse" style="display:block;margin-bottom:32px"><p style="margin:0 0 12px;color:#078596;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">My Drip Nurse Care</p><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:38px;font-weight:400;line-height:1.05">Reset your password, ${safeName}.</h1><p style="margin:0 0 28px;color:#526b70;font-size:16px;line-height:1.65">Use this secure link to choose a new password for your patient account.</p><a href="${resetUrl}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#075c68;color:#fff;font-weight:800;text-decoration:none">Choose a new password</a><p style="margin:28px 0 0;color:#78898b;font-size:12px;line-height:1.5">This link expires in one hour. If you did not request it, no changes are needed.</p></div></div></body></html>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

export async function sendClientPasswordChangeCodeEmail(input: PasswordChangeCodeEmailInput) {
  const apiKey = s(process.env.RESEND_API_KEY);
  const from = s(process.env.CLIENT_EMAIL_FROM || process.env.EMAIL_FROM);
  if (!apiKey || !from) throw new Error("Client password security email is not configured.");
  const safeName = escapeHtml(input.fullName || "there");
  const safeCode = escapeHtml(input.code);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `mdn-client-password-code-${input.challengeId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Your My Drip Nurse security code",
      html: `<!doctype html><html><body style="margin:0;background:#f2f7f6;font-family:Arial,sans-serif;color:#17353a"><div style="max-width:560px;margin:0 auto;padding:42px 20px"><div style="background:#fff;border:1px solid #dce7e6;border-radius:28px;padding:38px"><img src="https://care.mydripnurse.com/mdn-logo.png" width="178" alt="My Drip Nurse" style="display:block;margin-bottom:32px"><p style="margin:0 0 12px;color:#078596;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Account security</p><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:36px;font-weight:400;line-height:1.08">Confirm your password change, ${safeName}.</h1><p style="margin:0 0 22px;color:#526b70;font-size:16px;line-height:1.65">Enter this one-time code in My Drip Nurse Care:</p><div style="margin:0 0 24px;padding:18px 22px;border-radius:18px;background:#e8f8f5;color:#075c68;font-size:34px;font-weight:800;letter-spacing:.2em;text-align:center">${safeCode}</div><p style="margin:0;color:#78898b;font-size:12px;line-height:1.5">This code expires in ${input.expiresInMinutes} minutes and can only be used once. If you did not request this change, keep your current password and ignore this email.</p></div></div></body></html>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password security email failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

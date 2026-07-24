import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDbPool } from "@/lib/db";

type PartnerOnboardingPayload = {
  applicationId: string;
  ghlUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  countyStateNames: string;
  loginUrl: string;
};

type EncryptedPayload = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

let onboardingSchemaReady: Promise<void> | null = null;

function s(value: unknown) {
  return String(value ?? "").trim();
}

function base64url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function fromBase64url(value: string) {
  return Buffer.from(value, "base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getEncryptionKey() {
  const raw = s(process.env.PARTNER_ONBOARDING_ENCRYPTION_KEY);
  if (!raw) throw new Error("Missing PARTNER_ONBOARDING_ENCRYPTION_KEY env var");
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : fromBase64url(raw);
  if (key.length !== 32) {
    throw new Error("PARTNER_ONBOARDING_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function encryptPayload(payload: PartnerOnboardingPayload): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: base64url(iv),
    tag: base64url(cipher.getAuthTag()),
    ciphertext: base64url(ciphertext),
  };
}

function decryptPayload(encrypted: EncryptedPayload): PartnerOnboardingPayload {
  if (encrypted.version !== 1) throw new Error("Unsupported onboarding payload version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    fromBase64url(encrypted.iv),
  );
  decipher.setAuthTag(fromBase64url(encrypted.tag));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64url(encrypted.ciphertext)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as PartnerOnboardingPayload;
}

async function ensureOnboardingSchema() {
  if (onboardingSchemaReady) return onboardingSchemaReady;
  onboardingSchemaReady = (async () => {
    await getDbPool().query(`
      create table if not exists app.partner_onboarding_tokens (
        id uuid primary key default gen_random_uuid(),
        application_id uuid not null references app.staff_applications(id) on delete cascade,
        token_hash text not null unique,
        encrypted_payload jsonb not null,
        expires_at timestamptz not null,
        revoked_at timestamptz,
        last_viewed_at timestamptz,
        view_count integer not null default 0,
        created_at timestamptz not null default now()
      );
      create index if not exists partner_onboarding_tokens_expiry_idx
        on app.partner_onboarding_tokens (expires_at)
        where revoked_at is null;
    `);
  })().catch((error) => {
    onboardingSchemaReady = null;
    throw error;
  });
  return onboardingSchemaReady;
}

function getAppBaseUrl() {
  const configuredLanding = s(process.env.PARTNER_WELCOME_BASE_URL);
  if (configuredLanding) return configuredLanding.replace(/\/+$/, "");
  const configuredApp = s(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL);
  if (configuredApp) return `${configuredApp.replace(/\/+$/, "")}/partner-welcome`;
  const vercelHost = s(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL);
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/partner-welcome`;
  }
  return "http://localhost:3001/partner-welcome";
}

export async function issuePartnerOnboardingLink(input: PartnerOnboardingPayload) {
  await ensureOnboardingSchema();
  const rawToken = randomBytes(32).toString("base64url");
  const encrypted = encryptPayload(input);
  await getDbPool().query(
    `insert into app.partner_onboarding_tokens (
       application_id, token_hash, encrypted_payload, expires_at
     ) values ($1, $2, $3::jsonb, now() + interval '7 days')`,
    [input.applicationId, tokenHash(rawToken), JSON.stringify(encrypted)],
  );
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(rawToken)}`;
}

export async function readPartnerOnboardingToken(rawToken: string) {
  await ensureOnboardingSchema();
  const normalized = s(rawToken);
  if (!normalized || normalized.length < 32) return null;
  const result = await getDbPool().query<{
    encrypted_payload: EncryptedPayload;
    expires_at: Date;
  }>(
    `update app.partner_onboarding_tokens
        set last_viewed_at = now(), view_count = view_count + 1
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
      returning encrypted_payload, expires_at`,
    [tokenHash(normalized)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...decryptPayload(row.encrypted_payload),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

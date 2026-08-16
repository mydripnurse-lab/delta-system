import { createHash, randomBytes } from "node:crypto";

import { getDbPool } from "@/lib/db";

export type PasswordResetAccountKind = "partner" | "admin";

const ACCOUNT_HOSTS: Record<PasswordResetAccountKind, string> = {
  partner: "partners.mydripnurse.com",
  admin: "admin.mydripnurse.com",
};

export function isTrustedAccountPasswordRequest(request: Request, accountKind: PasswordResetAccountKind) {
  if (process.env.NODE_ENV !== "production") return true;
  const hostname = String(request.headers.get("host") || "").split(":")[0].trim().toLowerCase();
  return hostname === ACCOUNT_HOSTS[accountKind];
}

export function newAccountPasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAccountPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureAccountPasswordResetSchema() {
  await getDbPool().query(`
    create schema if not exists app;
    create table if not exists app.account_password_reset_tokens (
      id uuid primary key default gen_random_uuid(),
      account_kind text not null check (account_kind in ('partner', 'admin')),
      account_id uuid not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists account_password_reset_tokens_lookup_idx
      on app.account_password_reset_tokens (account_kind, account_id, expires_at desc)
      where consumed_at is null;
  `);
}

export async function issueAccountPasswordResetToken(accountKind: PasswordResetAccountKind, accountId: string) {
  await ensureAccountPasswordResetSchema();
  const token = newAccountPasswordResetToken();
  await getDbPool().query(
    `with consumed as (
       update app.account_password_reset_tokens
          set consumed_at = now()
        where account_kind = $1 and account_id = $2 and consumed_at is null
     )
     insert into app.account_password_reset_tokens (account_kind, account_id, token_hash, expires_at)
     values ($1, $2, $3, now() + interval '1 hour')`,
    [accountKind, accountId, hashAccountPasswordResetToken(token)],
  );
  return token;
}

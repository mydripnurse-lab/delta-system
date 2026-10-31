import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getDbPool } from '@/lib/db';
import { getPartnerPortalSession } from '@/lib/partnerPortalAuth';
import { verifyPassword } from '@/lib/password';
export const CLINIC_COOKIE = 'mdn_clinic_session';
import { clinicsEnabled } from '@/lib/clinicFeature';
export { clinicsEnabled, requireClinicsEnabled } from '@/lib/clinicFeature';
export const hashClinicToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const clinicCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 7 });
export function requireClinicOrigin(request: Request) {
    const origin = request.headers.get('origin');
    const target = new URL(request.url);
    // Next's development server can expose localhost internally for a 127.0.0.1 Host.
    // The browser Origin must still match the actual request host, not a supplied body value.
    const host = request.headers.get('host') || target.host;
    if (!origin || new URL(origin).host !== host || !['https:', 'http:'].includes(new URL(origin).protocol))
        throw new Error('Invalid request origin.');
}
export const getClinicIdentity = cache(async () => {
    if (!clinicsEnabled())
        return null;
    const partner = await getPartnerPortalSession();
    if (partner)
        return { email: partner.email.toLowerCase(), name: partner.display_name, partnerId: partner.profile_id, photoUrl: partner.clinic_avatar_url || '' };
    const token = (await cookies()).get(CLINIC_COOKIE)?.value;
    if (!token || token.length < 32)
        return null;
    const { rows } = await getDbPool().query<{
        email: string;
        name: string;
        photoUrl: string;
    }>(`select a.email, a.full_name as name, coalesce(a.profile_photo_url, '') as "photoUrl" from app.clinic_sessions s join app.clinic_accounts a on a.id=s.account_id where s.token_hash=$1 and s.expires_at>now() and a.is_active=true`, [hashClinicToken(token)]);
    return rows[0] ? { ...rows[0], partnerId: '' } : null;
});
export async function loginClinicAccount(email: string, password: string) {
    if (!clinicsEnabled())
        return null;
    const { rows } = await getDbPool().query<{
        id: string;
        password_hash: string;
    }>(`select id,password_hash from app.clinic_accounts where email=$1 and is_active=true limit 1`, [email.trim().toLowerCase()]);
    if (!rows[0] || !await verifyPassword(password, rows[0].password_hash))
        return null;
    const token = randomBytes(32).toString('base64url');
    await getDbPool().query(`insert into app.clinic_sessions(token_hash,account_id,expires_at) values($1,$2,now()+interval '7 days')`, [hashClinicToken(token), rows[0].id]);
    return token;
}
export async function requireClinicManager(clinicId: string) {
    const identity = await getClinicIdentity();
    if (!identity)
        throw new Error('Sign in to your partner account.');
    const { rows } = await getDbPool().query<{
        role: 'owner' | 'manager';
        status: string;
    }>(`select m.role,c.status from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id where m.clinic_id=$1 and m.email=$2 and m.status='active' and m.accepted_at is not null and m.role in ('owner','manager') and c.status <> 'suspended' limit 1`, [clinicId, identity.email]);
    if (!rows[0])
        throw new Error('Clinic access denied.');
    return { ...identity, ...rows[0] };
}

// Clinic owners share the partner portal's existing one-use reset-token flow.
// The caller owns the transaction; revoke sessions before committing the reset.
export async function resetClinicAccountPassword(client: import('pg').PoolClient, tokenHash: string, passwordHash: string) {
    const { rows } = await client.query<{ id: string }>(`select a.id from app.account_password_reset_tokens t join app.clinic_accounts a on a.id=t.account_id where t.account_kind='partner' and t.token_hash=$1 and t.consumed_at is null and t.expires_at>now() and a.is_active for update of t,a`, [tokenHash]);
    if (!rows[0]) return null;
    await client.query(`update app.clinic_accounts set password_hash=$2 where id=$1`, [rows[0].id, passwordHash]);
    await client.query(`update app.account_password_reset_tokens set consumed_at=now() where account_kind='partner' and account_id=$1 and consumed_at is null`, [rows[0].id]);
    await client.query(`delete from app.clinic_sessions where account_id=$1`, [rows[0].id]);
    return rows[0].id;
}

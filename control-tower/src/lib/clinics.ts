import 'server-only';
import { randomBytes } from 'node:crypto';
import { unstable_cache, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { getDbPool } from '@/lib/db';
import { getMyDripNurseOrganizationId } from '@/lib/myDripNurseServiceCatalog';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { getClinicIdentity, hashClinicToken, requireClinicManager, requireClinicsEnabled } from '@/lib/clinicAuth';
import { CLINIC_CACHE_TAG, type ClinicRole, type ClinicStatus } from '@/lib/clinicPolicy';
import { loadSelectablePricingRegions } from '@/lib/regionalPricingCatalog';
import type { PricingRegion } from '@/lib/regionalPricing';
import { CLINIC_AFFILIATE_POLICY_VERSION } from '@/lib/clinicAffiliatePolicy';
export type Clinic = {
    id: string;
    slug: string;
    name: string;
    status: ClinicStatus;
    description: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
    contactEmail: string;
    contactPhone: string;
    coverage: PricingRegion[];
    published: boolean;
};
export type PublicClinic = Omit<Clinic, 'contactEmail' | 'contactPhone'>;
export type ClinicMember = {
    id: string;
    email: string;
    role: ClinicRole;
    status: string;
    partnerId: string | null;
    name: string;
    coverage: PricingRegion[];
    acceptedAt: string | null;
    profileSlug: string | null;
    publicationReady: boolean;
};
const columns = `c.id,c.slug,c.name,c.status,c.description,c.logo_url as "logoUrl",c.primary_color as "primaryColor",c.accent_color as "accentColor",c.contact_email as "contactEmail",c.contact_phone as "contactPhone",c.coverage,c.published`;
const basic = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine(value => !['register', 'invite'].includes(value), 'Choose a different website address.'), contactEmail: z.string().trim().email().max(254), contactPhone: z.string().trim().max(40), description: z.string().trim().max(4000) });
export const clinicInput = basic.extend({ logoUrl: z.union([z.literal(''), z.string().url().max(2000).refine(v => v.startsWith('https://'))]), primaryColor: z.string().regex(/^#[a-f0-9]{6}$/i), accentColor: z.string().regex(/^#[a-f0-9]{6}$/i), coverageIds: z.array(z.string().max(300)).max(500), published: z.boolean() });
export async function coverageFromIds(ids: string[]) {
    const snapshot = await loadSelectablePricingRegions();
    const index = new Map(snapshot.regions.filter(r => r.active !== false).map(r => [r.id, r]));
    return [...new Set(ids)].map(id => { const region = index.get(id); if (!region)
        throw new Error('Select active locations from the coverage catalog.'); return region; });
}
export function invalidateClinics() { revalidateTag(CLINIC_CACHE_TAG, { expire: 0 }); }
export async function registerClinic(raw: unknown) {
    requireClinicsEnabled();
    const input = basic.extend({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), password: z.string().max(200).optional(), affiliatePolicyAccepted: z.literal(true, { error: 'Accept the clinic affiliate policy before continuing.' }), affiliatePolicyVersion: z.literal(CLINIC_AFFILIATE_POLICY_VERSION) }).parse(raw);
    const identity = await getClinicIdentity();
    const email = identity?.email || input.email.toLowerCase();
    const organization = await getMyDripNurseOrganizationId();
    const passwordError = !identity ? validatePasswordStrength(input.password || '') : '';
    if (passwordError)
        throw new Error(passwordError);
    const passwordHash = !identity ? await hashPassword(input.password || '') : '';
    const client = await getDbPool().connect();
    try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`clinic-identity:${email}`]);
        if (!identity) {
            const existing = await client.query(`select 1 from app.partner_profiles where lower(email)=$1 union all select 1 from app.clinic_accounts where email=$1 limit 1`, [email]);
            if (existing.rows.length)
                throw new Error('An account already exists. Sign in before registering your clinic.');
            await client.query(`insert into app.clinic_accounts(email,full_name,password_hash) values($1,$2,$3)`, [email, input.fullName, passwordHash]);
        }
        const { rows } = await client.query<{
            id: string;
        }>(`insert into app.clinics(organization_id,slug,name,contact_email,contact_phone,description) values($1,$2,$3,$4,$5,$6) returning id`, [organization, input.slug, input.name, input.contactEmail, input.contactPhone, input.description]);
        await client.query(`insert into app.clinic_memberships(clinic_id,email,partner_profile_id,role,status,accepted_at,authorized_at,authorized_by) values($1,$2,$3,'owner','active',now(),now(),$2)`, [rows[0].id, email, identity?.partnerId || null]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action) values($1,$2,'clinic_registered')`, [rows[0].id, email]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,'affiliate_policy_accepted',$3)`, [rows[0].id, email, CLINIC_AFFILIATE_POLICY_VERSION]);
        await client.query('commit');
        return rows[0].id;
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function listClinics(email?: string, offset = 0) {
    requireClinicsEnabled();
    const { rows } = await getDbPool().query<Clinic & {
        role?: ClinicRole;
    }>(`select ${columns}${email ? ',m.role' : ''} from app.clinics c ${email ? `join app.clinic_memberships m on m.clinic_id=c.id and m.email=$1 and m.status='active' and m.accepted_at is not null and m.role in ('owner','manager') and c.status <> 'suspended'` : ''} order by c.name,c.id limit 50 offset $${email ? 2 : 1}`, email ? [email, offset] : [offset]);
    return rows;
}
export async function clinicWorkspace(id: string) {
    const actor = await requireClinicManager(id);
    const pool = getDbPool();
    const [clinic, members, appointments, services] = await Promise.all([
        pool.query<Clinic>(`select ${columns} from app.clinics c where c.id=$1`, [id]),
        pool.query<ClinicMember>(`select m.id,m.email,m.role,m.status,m.partner_profile_id as "partnerId",coalesce(p.display_name,m.email) as name,m.coverage,m.accepted_at::text as "acceptedAt",p.slug as "profileSlug",coalesce(p.profile_consent_at is not null and p.website_status='published' and m.status='active',false) as "publicationReady" from app.clinic_memberships m left join app.partner_profiles p on p.id=m.partner_profile_id where m.clinic_id=$1 order by m.created_at desc limit 100`, [id]),
        pool.query(`select a.id,a.public_reference as reference,a.status,a.starts_at::text as "startsAt",a.service_price::text as price,a.deposit_amount::text as deposit,a.currency,coalesce(customer.full_name,'') as "customerName",coalesce(customer.email,'') as "customerEmail",coalesce(customer.phone,'') as "customerPhone",coalesce(p.display_name,'') as "nurseName",a.metadata->'client_reward'->>'platformFunded' as "platformFunded" from app.appointments a left join app.booking_customers customer on customer.id=a.customer_id left join app.partner_profiles p on p.id=a.partner_profile_id where a.clinic_id=$1 order by a.starts_at desc limit 50`, [id]),
        pool.query(`select s.id,s.name,s.price::text as "defaultPrice",s.currency,p.price::text as "clinicPrice",p.regional_prices as "regionalPrices" from app.clinic_service_prices p join app.services s on s.id=p.service_id where p.clinic_id=$1 and p.enabled and s.is_active order by s.name limit 100`, [id]),
    ]);
    return { clinic: clinic.rows[0], role: actor.role, members: members.rows, appointments: appointments.rows, services: services.rows };
}
export async function saveClinic(id: string, raw: unknown) {
    const actor = await requireClinicManager(id);
    const input = clinicInput.parse(raw);
    if (input.published && actor.status !== 'approved')
        throw new Error('My Drip Nurse must approve your clinic before publication.');
    const coverage = await coverageFromIds(input.coverageIds);
    if (input.published && (!coverage.length || !input.description))
        throw new Error('Add a description and service coverage before publishing.');
    await getDbPool().query(`update app.clinics set name=$2,description=$3,logo_url=$4,primary_color=$5,accent_color=$6,contact_email=$7,contact_phone=$8,coverage=$9::jsonb,published=$10,updated_at=now() where id=$1`, [id, input.name, input.description, input.logoUrl, input.primaryColor, input.accentColor, input.contactEmail, input.contactPhone, JSON.stringify(coverage), input.published]);
    invalidateClinics();
}
export async function inviteClinicMember(id: string, raw: unknown) {
    const actor = await requireClinicManager(id);
    if (actor.status !== 'approved')
        throw new Error('Your clinic must be approved before inviting your team.');
    const input = z.object({ email: z.string().email().max(254), role: z.enum(['nurse', 'manager']) }).parse(raw);
    if (input.role === 'manager' && actor.role !== 'owner')
        throw new Error('Only the owner can invite a manager.');
    const token = randomBytes(32).toString('base64url');
    const result = await getDbPool().query(`insert into app.clinic_memberships(clinic_id,email,role,invite_hash,invite_expires_at) values($1,$2,$3,$4,now()+interval '7 days') on conflict(clinic_id,email) do update set role=excluded.role,invite_hash=excluded.invite_hash,invite_expires_at=excluded.invite_expires_at,status='invited',updated_at=now() where clinic_memberships.status in ('invited','removed') and clinic_memberships.role <> 'owner' returning id`, [id, input.email.toLowerCase(), input.role, hashClinicToken(token)]);
    if (!result.rows.length)
        throw new Error('This person already belongs to the clinic.');
    return `https://partners.mydripnurse.com/clinics/invite#${token}`;
}
export async function acceptClinicInvite(raw: unknown) {
    requireClinicsEnabled();
    const input = z.object({ token: z.string().min(32).max(100), fullName: z.string().trim().min(2).max(120), email: z.string().email().max(254), password: z.string().max(200).optional(), credentials: z.string().trim().max(250).default(''), phone: z.string().trim().max(32).default(''), publicProfileConsent: z.boolean().default(false) }).parse(raw);
    const identity = await getClinicIdentity();
    const email = identity?.email || input.email.toLowerCase();
    if (!identity) {
        const error = validatePasswordStrength(input.password || '');
        if (error)
            throw new Error(error);
    }
    const passwordHash = !identity ? await hashPassword(input.password || '') : '';
    const client = await getDbPool().connect();
    try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`clinic-identity:${email}`]);
        const { rows } = await client.query<{
            id: string;
            clinic_id: string;
            role: ClinicRole;
            organization_id: string;
            email: string;
        }>(`select m.id,m.clinic_id,m.role,m.email,c.organization_id from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id where m.invite_hash=$1 and m.status='invited' and m.invite_expires_at>now() and c.status='approved' for update of m`, [hashClinicToken(input.token)]);
        const invite = rows[0];
        if (!invite || invite.email !== email)
            throw new Error('This invitation is expired or belongs to another email. Sign in with the invited account.');
        const existing = await client.query<{
            id: string;
        }>(`select id from app.partner_profiles where lower(email)=$1 and organization_id=$2 limit 2`, [email, invite.organization_id]);
        if (existing.rows.length > 1)
            throw new Error('Contact My Drip Nurse to resolve duplicate profiles before linking.');
        if (!identity && (existing.rows.length || (await client.query('select 1 from app.clinic_accounts where email=$1', [email])).rows.length))
            throw new Error('Sign in to your existing account, then reopen this invitation.');
        let partnerId = existing.rows[0]?.id || null;
        if (invite.role === 'nurse' && !partnerId) {
            if (!input.credentials)
                throw new Error('Enter your professional credentials for clinic review.');
            if (!/^\+[1-9]\d{7,14}$/.test(input.phone))
                throw new Error('Enter your mobile number with country code, for example +15555550123.');
            if (identity)
                throw new Error('Contact My Drip Nurse to enable a professional profile on this clinic-owner account.');
            const app = await client.query<{
                id: string;
            }>(`insert into app.staff_applications(organization_id,email,status,first_name,last_name,professional_credentials,phone,request_payload) values($1,$2,'under_review',$3,$4,$5,$6,'{"source":"clinic_invitation"}') returning id`, [invite.organization_id, email, input.fullName.split(' ')[0], input.fullName.split(' ').slice(1).join(' '), input.credentials, input.phone]);
            const profile = await client.query<{
                id: string;
            }>(`insert into app.partner_profiles(organization_id,application_id,ghl_user_id,email,slug,display_name,professional_credentials,website_status,directory_status,portal_password_hash,clinic_managed,profile_consent_at) values($1,$2,'',$3,$4,$5,$6,'hidden','hidden',$7,true,case when $8 then now() else null end) returning id`, [invite.organization_id, app.rows[0].id, email, `${input.fullName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'nurse'}-${randomBytes(4).toString('hex')}`, input.fullName, input.credentials, passwordHash, input.publicProfileConsent]);
            partnerId = profile.rows[0].id;
        }
        else if (!identity) {
            await client.query(`insert into app.clinic_accounts(email,full_name,password_hash) values($1,$2,$3)`, [email, input.fullName, passwordHash]);
        }
        if (partnerId && input.publicProfileConsent)
            await client.query('update app.partner_profiles set profile_consent_at=coalesce(profile_consent_at,now()) where id=$1', [partnerId]);
        await client.query(`update app.clinic_memberships set partner_profile_id=$2,status='pending',accepted_at=now(),invite_hash=null,invite_expires_at=null,updated_at=now() where id=$1`, [invite.id, partnerId]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,'invitation_accepted',$3)`, [invite.clinic_id, email, invite.id]);
        await client.query('commit');
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function updateClinicMember(clinicId: string, raw: unknown) {
    const actor = await requireClinicManager(clinicId);
    if (actor.status !== 'approved')
        throw new Error('Clinic approval is required.');
    const input = z.object({ id: z.string().uuid(), status: z.enum(['active', 'suspended', 'removed']), coverageIds: z.array(z.string().max(300)).max(500) }).parse(raw);
    const coverage = await coverageFromIds(input.coverageIds);
    const client = await getDbPool().connect();
    try {
        await client.query('begin');
        const { rows } = await client.query<{
            role: ClinicRole;
            accepted_at: string | null;
            partner_profile_id: string | null;
        }>(`select role,accepted_at,partner_profile_id from app.clinic_memberships where id=$1 and clinic_id=$2 for update`, [input.id, clinicId]);
        const member = rows[0];
        if (!member || member.role === 'owner' || (member.role === 'manager' && actor.role !== 'owner'))
            throw new Error('You cannot change this membership.');
        if (!member.accepted_at)
            throw new Error('The invitation must be accepted first.');
        if (input.status !== 'active' && member.partner_profile_id) {
            const pending = await client.query(`select 1 from app.appointments where clinic_id=$1 and partner_profile_id=$2 and status in ('payment_pending','confirmed','partner_acknowledged','in_progress') limit 1`, [clinicId, member.partner_profile_id]);
            if (pending.rows.length)
                throw new Error('Resolve the nurse’s pending clinic appointments before removing or suspending them.');
        }
        await client.query(`update app.clinic_memberships set status=$3,coverage=$4::jsonb,authorized_by=$5,authorized_at=now(),updated_at=now() where id=$1 and clinic_id=$2`, [input.id, clinicId, input.status, JSON.stringify(coverage), actor.email]);
        if (input.status === 'active' && member.partner_profile_id)
            await client.query(`insert into app.partner_service_assignments(organization_id,partner_profile_id,service_id,status,activated_at) select c.organization_id,$2,p.service_id,'active',now() from app.clinic_service_prices p join app.clinics c on c.id=p.clinic_id where p.clinic_id=$1 and p.enabled on conflict(partner_profile_id,service_id) do nothing`, [clinicId, member.partner_profile_id]);
        if (input.status === 'active' && member.role === 'nurse' && member.partner_profile_id)
            await client.query(`update app.partner_profiles set website_status='published',directory_status='published',updated_at=now() where id=$1 and clinic_managed and profile_consent_at is not null`, [member.partner_profile_id]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,$3,$4)`, [clinicId, actor.email, `member_${input.status}`, input.id]);
        await client.query('commit');
        invalidateClinics();
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
}
// Public reads deliberately exclude private clinic contact details at the SQL boundary.
const publicColumns = `c.id,c.slug,c.name,c.status,c.description,c.logo_url as "logoUrl",c.primary_color as "primaryColor",c.accent_color as "accentColor",c.coverage,c.published`;
export const publicClinics = unstable_cache(async (slug: string = '', offset = 0) => {
    const { rows } = await getDbPool().query<PublicClinic>(`select ${publicColumns} from app.clinics c where c.status='approved' and c.published=true and ($1='' or c.slug=$1) order by c.name,c.id limit 24 offset $2`, [slug, offset]);
    return rows;
}, ['clinics-public-v2-private-contacts'], { revalidate: 300, tags: [CLINIC_CACHE_TAG] });

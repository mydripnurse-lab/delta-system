import type { ClinicWebsiteSettings } from '@/lib/clinicWebsiteBrand';
import { CLINIC_MANAGER_SQL } from '@/lib/clinicPolicy';
import 'server-only';
import { validateClinicMemberServices, ensureClinicMemberServices } from '@/lib/clinicMemberServices';
import { scheduleClinicCommunications } from '@/lib/clinicCommunications';
import { clinicRegistrationCoverage } from '@/lib/clinicRegistrationLocation';
import { randomBytes } from 'node:crypto';
import { unstable_cache, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { getDbPool } from '@/lib/db';
import { getMyDripNurseOrganizationId } from '@/lib/myDripNurseServiceCatalog';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { getClinicIdentity, hashClinicToken, requireClinicManager, requireClinicsEnabled } from '@/lib/clinicAuth';
import { CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG, type ClinicRole, type ClinicStatus } from '@/lib/clinicPolicy';
import { loadSelectablePricingRegions } from '@/lib/regionalPricingCatalog';
import { SERVICE_PRICING_TAG, type PricingRegion } from '@/lib/regionalPricing';
import { resolveNewClinicReferral } from '@/lib/clinicAffiliate';
import { CLINIC_AFFILIATE_POLICY_VERSION } from '@/lib/clinicAffiliatePolicy';
export type Clinic = {
    id: string;
    slug: string;
    name: string;
    status: ClinicStatus;
    description: string;
    logoUrl: string;
    websiteSettings?: ClinicWebsiteSettings;
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
    serviceIds: string[] | null;
};
const columns = `c.id,c.slug,c.name,c.status,c.description,c.logo_url as "logoUrl",c.primary_color as "primaryColor",c.accent_color as "accentColor",c.contact_email as "contactEmail",c.contact_phone as "contactPhone",c.coverage,c.published,coalesce(to_jsonb(c)->'website_settings','{}'::jsonb) as "websiteSettings"`;
const basic = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine(value => !['register', 'invite'].includes(value), 'Choose a different website address.'), contactEmail: z.string().trim().email().max(254), contactPhone: z.string().trim().max(40), description: z.string().trim().max(4000) });
export const clinicInput = basic.extend({ logoUrl: z.union([z.literal(''), z.string().url().max(2000).refine(v => v.startsWith('https://'))]), primaryColor: z.string().regex(/^#[a-f0-9]{6}$/i), accentColor: z.string().regex(/^#[a-f0-9]{6}$/i), coverageIds: z.array(z.string().max(300)).max(500), published: z.boolean().optional() });
export async function coverageFromIds(ids: string[]) {
    const snapshot = await loadSelectablePricingRegions();
    const index = new Map(snapshot.regions.filter(r => r.active !== false).map(r => [r.id, r]));
    return [...new Set(ids)].map(id => { const region = index.get(id); if (!region)
        throw new Error('Select active locations from the coverage catalog.'); return region; });
}
export function invalidateClinics() { revalidateTag(CLINIC_CACHE_TAG, { expire: 0 }); revalidateTag(CLINIC_TEAM_CACHE_TAG, { expire: 0 }); }
export async function registerClinic(raw: unknown) {
    requireClinicsEnabled();
    const input = basic.extend({ description: z.string().trim().min(20, 'Tell us about your clinic in at least 20 characters.').max(4000), contactPhone: z.string().trim().min(7, 'Enter a private clinic phone number.').max(40), locationId: z.string().min(1, 'Choose the city where your clinic operates.').max(300), coverageIds: z.array(z.string().max(300)).max(500).default([]), fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), password: z.string().max(200).optional(), referralCode: z.string().max(87).optional(), affiliatePolicyAccepted: z.literal(true, { error: 'Accept the clinic affiliate policy before continuing.' }), affiliatePolicyVersion: z.literal(CLINIC_AFFILIATE_POLICY_VERSION) }).parse(raw);
    const coverage = clinicRegistrationCoverage(input.locationId, input.coverageIds);
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
        // Resolve before account creation, in the same transaction. Existing identities retain their attribution.
        const referrer = input.referralCode && !identity ? await resolveNewClinicReferral(client, input.referralCode, organization, email) : null;
        if (!identity) {
            const existing = await client.query(`select 1 from app.partner_profiles where lower(email)=$1 union all select 1 from app.clinic_accounts where email=$1 limit 1`, [email]);
            if (existing.rows.length)
                throw new Error('An account already exists. Sign in before registering your clinic.');
            await client.query(`insert into app.clinic_accounts(email,full_name,password_hash) values($1,$2,$3)`, [email, input.fullName, passwordHash]);
        }
        const { rows } = await client.query<{
            id: string;
        }>(`insert into app.clinics(organization_id,slug,name,contact_email,contact_phone,description,referred_by_clinic_id,coverage,status,published) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'pending',false) returning id`, [organization, input.slug, input.name, input.contactEmail, input.contactPhone, input.description, referrer, JSON.stringify(coverage)]);
        await client.query(`insert into app.clinic_memberships(clinic_id,email,partner_profile_id,role,status,accepted_at,authorized_at,authorized_by) values($1,$2,$3,'owner','active',now(),now(),$2)`, [rows[0].id, email, identity?.partnerId || null]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action) values($1,$2,'clinic_registered')`, [rows[0].id, email]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,'affiliate_policy_accepted',$3)`, [rows[0].id, email, CLINIC_AFFILIATE_POLICY_VERSION]);
        await client.query('commit');
        scheduleClinicCommunications(rows[0].id);
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
    }>(`select ${columns}${email ? ',m.role' : ''} from app.clinics c ${email ? `join app.clinic_memberships m on m.clinic_id=c.id and m.email=$1 and m.status='active' and m.accepted_at is not null and ${CLINIC_MANAGER_SQL} and c.status <> 'suspended'` : ''} order by c.name,c.id limit 50 offset $${email ? 2 : 1}`, email ? [email, offset] : [offset]);
    return rows;
}
const cachedClinicWorkspace = unstable_cache(async (id: string, approved: boolean) => {
    const pool = getDbPool();
    const [clinic, members, appointments, services] = await Promise.all([
        pool.query<Clinic>(`select ${columns} from app.clinics c where c.id=$1`, [id]),
        Promise.resolve({ rows: [] as ClinicMember[] }), // Paged team is loaded on demand.
        Promise.resolve({ rows: [] }), // Appointment details are loaded on demand by the paged calendar.
        approved ? pool.query(`select s.id,s.name,s.image_url as "imageUrl",s.short_description as description,s.ingredients,coalesce(p.availability_status,'paused') as "availabilityStatus",coalesce(p.enabled,true) as "canOffer",(p.service_id is not null and p.enabled) as configured,s.price::text as "defaultPrice",s.currency,s.deposit_type as "depositType",s.deposit_value::text as "depositValue",p.price::text as "clinicPrice",p.regional_prices as "regionalPrices" from app.clinics c join app.services s on s.organization_id=c.organization_id left join app.clinic_service_prices p on p.clinic_id=c.id and p.service_id=s.id where c.id=$1 and s.is_active order by s.name limit 100`, [id]) : Promise.resolve({ rows: [] }),
    ]);
    return { clinic: clinic.rows[0], members: members.rows, appointments: appointments.rows, services: services.rows };
}, ['clinic-workspace-v6-paged-team'], { revalidate: 60, tags: [CLINIC_CACHE_TAG, SERVICE_PRICING_TAG] });
export async function clinicWorkspace(id: string) {
    const actor = await requireClinicManager(id);
    const workspace = await cachedClinicWorkspace(id, actor.status === 'approved');
    // Approval status comes from the fresh authorization check, never a cached grant.
    return { ...workspace, role: actor.role, clinic: { ...workspace.clinic, status: actor.status as ClinicStatus } };
}
export async function saveClinic(id: string, raw: unknown) {
    await requireClinicManager(id);
    const input = clinicInput.parse(raw);
    const coverage = await coverageFromIds(input.coverageIds);
    await getDbPool().query(`update app.clinics set name=$2,description=$3,logo_url=$4,primary_color=$5,accent_color=$6,contact_email=$7,contact_phone=$8,coverage=$9::jsonb,updated_at=now() where id=$1`, [id, input.name, input.description, input.logoUrl, input.primaryColor, input.accentColor, input.contactEmail, input.contactPhone, JSON.stringify(coverage)]);
    invalidateClinics();
}
export async function inviteClinicMember(id: string, raw: unknown) {
    const actor = await requireClinicManager(id);
    if (actor.status !== 'approved')
        throw new Error('Your clinic must be approved before inviting your team.');
    const input = z.object({ email: z.string().email().max(254), role: z.enum(['nurse', 'manager']), serviceIds: z.array(z.string().uuid()).max(100).optional() }).parse(raw);
    if (input.role === 'manager' && actor.role !== 'owner') throw new Error('Only the owner can invite a manager.');
    const token = randomBytes(32).toString('base64url');
    const client = await getDbPool().connect();
    try {
        await client.query('begin');
        const access = await client.query(`select c.id from app.clinics c join app.clinic_memberships m on m.clinic_id=c.id where c.id=$1 and c.status='approved' and m.email=$2 and m.status='active' and m.accepted_at is not null and ${CLINIC_MANAGER_SQL} and ($3<>'manager' or m.role='owner') for share of c,m`, [id, actor.email, input.role]);
        if (!access.rowCount) throw new Error('Clinic access denied.');
        const serviceIds = input.role === 'nurse' && input.serviceIds !== undefined ? await validateClinicMemberServices(client, id, input.serviceIds) : null;
        const result = await client.query(`insert into app.clinic_memberships(clinic_id,email,role,invite_hash,invite_expires_at,service_ids) values($1,$2,$3,$4,now()+interval '7 days',$5::uuid[]) on conflict(clinic_id,email) do update set can_manage_clinic=false,role=excluded.role,invite_hash=excluded.invite_hash,invite_expires_at=excluded.invite_expires_at,service_ids=excluded.service_ids,status='invited',updated_at=now() where clinic_memberships.status in ('invited','removed') and clinic_memberships.role <> 'owner' returning id`, [id, input.email.toLowerCase(), input.role, hashClinicToken(token), serviceIds]);
        if (!result.rows.length) throw new Error('This person already belongs to the clinic.');
        await client.query('commit');
        invalidateClinics();
        return `https://partners.mydripnurse.com/clinics/invite#${token}`;
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
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
        scheduleClinicCommunications(invite.clinic_id);
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
    const input = z.object({ id: z.string().uuid(), status: z.enum(['active', 'suspended', 'removed']), serviceIds: z.array(z.string().uuid()).max(100).optional(), coverageIds: z.array(z.string().max(300)).max(500) }).parse(raw);
    const coverage = await coverageFromIds(input.coverageIds);
    const client = await getDbPool().connect();
    try {
        await client.query('begin');
        const access = await client.query(`select c.id from app.clinics c join app.clinic_memberships m on m.clinic_id=c.id where c.id=$1 and c.status='approved' and m.email=$2 and m.status='active' and m.accepted_at is not null and ${CLINIC_MANAGER_SQL} for share of c,m`, [clinicId, actor.email]);
        if (!access.rowCount) throw new Error('Clinic access denied.');
        const { rows } = await client.query<{
            can_manage_clinic: boolean;
            service_ids: string[] | null;
            role: ClinicRole;
            status: string;
            authorized_at: string | null;
            accepted_at: string | null;
            partner_profile_id: string | null;
        }>(`select coalesce(to_jsonb(m)->>'can_manage_clinic','false')='true' as can_manage_clinic,role,status,authorized_at,accepted_at,partner_profile_id,service_ids from app.clinic_memberships m where id=$1 and clinic_id=$2 for update`, [input.id, clinicId]);
        const member = rows[0];
        if (!member || member.role === 'owner' || ((member.role === 'manager' || member.can_manage_clinic) && actor.role !== 'owner'))
            throw new Error('You cannot change this membership.');
        if (!member.accepted_at)
            throw new Error('The invitation must be accepted first.');
        if (input.status !== 'active' && member.partner_profile_id) {
            const pending = await client.query(`select 1 from app.appointments where clinic_id=$1 and partner_profile_id=$2 and status in ('payment_pending','confirmed','partner_acknowledged','in_progress') limit 1`, [clinicId, member.partner_profile_id]);
            if (pending.rows.length)
                throw new Error('Resolve the nurse’s pending clinic appointments before removing or suspending them.');
        }
        const serviceIds = member.role === 'nurse' && input.serviceIds !== undefined
            ? await validateClinicMemberServices(client, clinicId, input.serviceIds) : member.service_ids;
        if (input.status === 'active' && member.role === 'nurse') {
            const ready = await client.query(`select id from app.partner_profiles where id=$1
                and nullif(trim(professional_credentials),'') is not null and profile_consent_at is not null for update`, [member.partner_profile_id]);
            if (!ready.rowCount) throw new Error('The nurse must complete their credentials and consent to their public profile before activation.');
        }
        await client.query(`update app.clinic_memberships set status=$3,coverage=$4::jsonb,authorized_by=$5,authorized_at=now(),service_ids=$6::uuid[],updated_at=now() where id=$1 and clinic_id=$2`, [input.id, clinicId, input.status, JSON.stringify(coverage), actor.email, serviceIds]);
        if (input.status === 'active' && member.partner_profile_id) await ensureClinicMemberServices(client, clinicId, member.partner_profile_id);
        if (input.status === 'active' && member.role === 'nurse' && member.partner_profile_id)
            await client.query(`update app.partner_profiles set website_status='published',directory_status='published',updated_at=now() where id=$1 and profile_consent_at is not null and (website_status<>'published' or directory_status<>'published')`, [member.partner_profile_id]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,$3,$4)`, [clinicId, actor.email, member.status !== input.status || !member.authorized_at ? `member_${input.status}` : "member_coverage_updated", input.id]);
        await client.query('commit');
        scheduleClinicCommunications(clinicId);
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
const publicColumns = `c.id,c.slug,c.name,c.status,c.description,c.logo_url as "logoUrl",c.primary_color as "primaryColor",c.accent_color as "accentColor",c.coverage,c.published,coalesce(to_jsonb(c)->'website_settings','{}'::jsonb) as "websiteSettings"`;
export const publicClinics = unstable_cache(async (slug: string = '', offset = 0) => {
    const { rows } = await getDbPool().query<PublicClinic>(`select ${publicColumns} from app.clinics c where c.status='approved' and c.published=true and ($1='' or c.slug=$1) order by c.name,c.id limit 24 offset $2`, [slug, offset]);
    return rows;
}, ['clinics-public-v3-website-settings'], { revalidate: 300, tags: [CLINIC_CACHE_TAG, SERVICE_PRICING_TAG] });

// A bounded public lookup for booking branding, shared across requests and invalidated on saves.
export const publicClinicById = unstable_cache(async (id: string) => {
    const { rows } = await getDbPool().query<PublicClinic>(`select ${publicColumns} from app.clinics c where c.id=$1 and c.status='approved' and c.published=true limit 1`, [id]);
    return rows[0] || null;
}, ['clinic-public-booking-v1'], { revalidate: 300, tags: [CLINIC_CACHE_TAG, SERVICE_PRICING_TAG] });

// A branding save cannot overwrite profile details, coverage, publication or pricing.
export async function saveClinicBranding(id: string, raw: unknown) {
    await requireClinicManager(id);
    const input = clinicInput.pick({ logoUrl: true, primaryColor: true, accentColor: true }).parse(raw);
    await getDbPool().query(`update app.clinics set logo_url=$2,primary_color=$3,accent_color=$4,updated_at=now() where id=$1`, [id, input.logoUrl, input.primaryColor, input.accentColor]);
    invalidateClinics();
}

// This action cannot change portal branding, prices, coverage or publication status.
export async function saveClinicWebsite(id: string, raw: unknown) {
    await requireClinicManager(id);
    const color = z.string().regex(/^#[a-f0-9]{6}$/i);
    const input = z.object({
        heroImageUrl: z.union([z.literal(''), z.string().url().max(2000).refine(value => {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password && url.hostname.endsWith('.public.blob.vercel-storage.com') && url.pathname.startsWith(`/clinics/${id}/hero-`);
        }, 'Upload a hero image for this clinic.')]),
        primaryColor: color, secondaryColor: color,
    }).parse(raw);
    await getDbPool().query(`update app.clinics set website_settings=$2::jsonb,updated_at=now() where id=$1`, [id, JSON.stringify(input)]);
    invalidateClinics();
}

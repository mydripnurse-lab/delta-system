import { CLINIC_MANAGER_SQL } from '@/lib/clinicPolicy';
import 'server-only';
import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { revalidateTag } from 'next/cache';
import { getDbPool } from './db';
import { requireClinicManager, requireClinicsEnabled } from './clinicAuth';
import { CLINIC_CACHE_TAG } from './clinicPolicy';
import { CLINIC_DOMAIN_CACHE_TAG, clinicDomainsEnabled, normalizeClinicDomain, defaultClinicSite, type ClinicDomainSettings, type ClinicDnsRecord, type ClinicDomainStatus } from './clinicDomainPolicy';
import { attachClinicDomain, clinicDomainProviderConfigured, detachClinicDomain, domainConfiguration, inspectClinicDomain, providerDnsRecords, verifyClinicDomainProvider } from './clinicDomainProvider';

type DomainRow = { clinic_id: string; hostname: string; verification_token: string; status: ClinicDomainStatus['status']; provider_attached: boolean; dns_records: ClinicDnsRecord[]; last_checked_at: Date | null; verified_at: Date | null };
function ownershipRecord(row: DomainRow): ClinicDnsRecord {
    return { type: 'TXT', name: `_mdn-verify.${row.hostname}`, value: `mdn-clinic=${row.verification_token}`, purpose: 'Clinic ownership verification' };
}
function publicSettings(row?: DomainRow): ClinicDomainStatus | null {
    return row ? { hostname: row.hostname, status: row.status, records: [ownershipRecord(row), ...row.dns_records], lastCheckedAt: row.last_checked_at?.toISOString() || null, verifiedAt: row.verified_at?.toISOString() || null } : null;
}
function invalidateDomains() {
    revalidateTag(CLINIC_DOMAIN_CACHE_TAG, { expire: 0 });
    revalidateTag(CLINIC_CACHE_TAG, { expire: 0 });
}
export async function clinicDomainSettings(clinicId: string): Promise<ClinicDomainSettings> {
    await requireClinicManager(clinicId);
    const enabled = clinicDomainsEnabled(), configured = clinicDomainProviderConfigured();
    if (!enabled) return { enabled, configured, domain: null };
    const { rows } = await getDbPool().query<DomainRow>('select * from app.clinic_domains where clinic_id=$1', [clinicId]);
    return { enabled, configured, domain: publicSettings(rows[0]) };
}
// Called only by a deliberate admin/manager click. No cron, polling or per-visit DNS queries.
export async function changeClinicDomain(clinicId: string, action: 'connect' | 'verify' | 'disconnect', rawHostname = '') {
    requireClinicsEnabled();
    if (!clinicDomainsEnabled() || !clinicDomainProviderConfigured()) throw new Error('Domain connections are not available yet. Contact My Drip Nurse.');
    const identity = await requireClinicManager(clinicId);
    if (identity.status !== 'approved') throw new Error('Your clinic must be approved before connecting a domain.');
    const client = await getDbPool().connect();
    let notice = '';
    try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`clinic-domain:${clinicId}`]);
        // Check membership again inside the mutation, not from a cached workspace.
        const access = await client.query(`select m.id from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id where c.id=$1 and c.status='approved' and m.email=$2 and ${CLINIC_MANAGER_SQL} and m.status='active' and m.accepted_at is not null for share of m,c`, [clinicId, identity.email]);
        if (!access.rows.length) throw new Error('Clinic access denied.');
        let row = (await client.query<DomainRow>('select * from app.clinic_domains where clinic_id=$1 for update', [clinicId])).rows[0];
        if (action === 'connect') {
            const hostname = normalizeClinicDomain(rawHostname);
            if (row) throw new Error('Disconnect the current domain before connecting another.');
            const config = await domainConfiguration(hostname);
            const records = providerDnsRecords(hostname, config);
            const result = await client.query<DomainRow>(`insert into app.clinic_domains(clinic_id,hostname,verification_token,dns_records) values($1,$2,$3,$4::jsonb) returning *`, [clinicId, hostname, randomBytes(32).toString('hex'), JSON.stringify(records)]);
            row = result.rows[0];
            notice = 'Add the DNS records below at your domain provider, then verify the connection.';
        } else if (action === 'disconnect') {
            if (row) {
                // Fail closed before removing the alias. Keep the record if removal needs a retry.
                await client.query("update app.clinic_domains set status='disconnecting',updated_at=now() where clinic_id=$1", [clinicId]);
                await client.query('commit');
                invalidateDomains();
                await client.query('begin');
                await client.query('select pg_advisory_xact_lock(hashtext($1))', [`clinic-domain:${clinicId}`]);
                const removing = (await client.query<DomainRow>('select * from app.clinic_domains where clinic_id=$1 for update', [clinicId])).rows[0];
                if (removing?.hostname === row.hostname && removing.verification_token === row.verification_token && removing.status === 'disconnecting') {
                    if (removing.provider_attached) await detachClinicDomain(removing.hostname);
                    await client.query('delete from app.clinic_domains where clinic_id=$1', [clinicId]);
                }
            }
            notice = 'Domain disconnected. Your My Drip Nurse website remains available.';
        } else {
            if (!row || row.status === 'disconnecting') throw new Error('Connect a domain first, or finish disconnecting the current one.');
            if (row.last_checked_at && Date.now() - row.last_checked_at.getTime() < 60000) throw new Error('Please wait one minute before checking DNS again.');
            await client.query('update app.clinic_domains set last_checked_at=now() where clinic_id=$1', [clinicId]);
            const resolver = new Resolver({ timeout: 2000, tries: 1 });
            const proof = ownershipRecord(row);
            let verifiedOwner = false;
            try { verifiedOwner = (await resolver.resolveTxt(proof.name)).some(parts => parts.join('') === proof.value); } catch { /* Not propagated yet. Never request a user-supplied HTTP URL. */ }
            if (!verifiedOwner) {
                await client.query("update app.clinic_domains set status='pending',verified_at=null,updated_at=now() where clinic_id=$1", [clinicId]);
                notice = 'The ownership TXT record is not visible yet. Check the exact name and value, then try again after DNS propagates.';
            } else {
                // Only claim the provider alias after a unique clinic-specific ownership proof.
                let domain = row.provider_attached ? await inspectClinicDomain(row.hostname) : await attachClinicDomain(row.hostname);
                await client.query('update app.clinic_domains set provider_attached=true where clinic_id=$1', [clinicId]);
                // Keep the lock through provider verification. If a later check
                // fails, commit attachment as pending so a retry can inspect it.
                try {
                    if (!domain.verified) {
                        try { domain = await verifyClinicDomainProvider(row.hostname); } catch { /* Show the provider challenge below. */ }
                    }
                    const config = await domainConfiguration(row.hostname);
                    const active = domain.name === row.hostname && domain.verified === true && config.misconfigured === false;
                    await client.query(`update app.clinic_domains set status=$2,dns_records=$3::jsonb,verified_at=case when $2='active' then now() else null end,updated_at=now() where clinic_id=$1`, [clinicId, active ? 'active' : 'pending', JSON.stringify(providerDnsRecords(row.hostname, config, domain))]);
                    notice = active ? 'DNS verified. HTTPS is provisioned automatically by the hosting provider and may take a few minutes. Only an admin-published clinic website will be visible.' : 'Ownership confirmed. Complete the hosting DNS records below and verify again.';
                } catch {
                    notice = 'The hosting connection was saved, but its DNS check could not finish. Try Verify connection again in one minute.';
                }
            }
        }
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action) values($1,$2,$3)`, [clinicId, identity.email, `domain_${action}`]);
        await client.query('commit');
        invalidateDomains();
        return { notice, ...await clinicDomainSettings(clinicId) };
    } catch (error) {
        await client.query('rollback');
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new Error('This domain is already connected to a clinic. Contact My Drip Nurse to resolve ownership.');
        throw error;
    } finally { client.release(); }
}
export { clinicByDomain, clinicSiteAddress } from './clinicDomainLookup';

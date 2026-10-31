// Shared by the browser, routing boundary and server. No secrets or database reads.
export const CLINIC_DOMAIN_CACHE_TAG = 'clinic-custom-domains';
export const PARTNER_ORIGIN = 'https://partners.mydripnurse.com';
// Rollout: apply 054_clinic_domains.sql, configure the server-only provider
// variables documented in clinicDomainProvider, then enable and redeploy.
// Off by default: existing websites work without this table or provider access.
export const clinicDomainsEnabled = () => process.env.CLINIC_CUSTOM_DOMAINS_ENABLED === 'true';
const reserved = ['mydripnurse.com', 'telahagocrecer.com', 'vercel.app', 'vercel.com', 'localhost', 'local', 'internal', 'test', 'invalid', 'example', 'example.com', 'example.net', 'example.org'];
export function isClinicDomainCandidate(host: string) {
    return host.length <= 253 && /^[a-z0-9.-]+$/.test(host) && !/^\d+(?:\.\d+){3}$/.test(host)
        && !reserved.some(root => host === root || host.endsWith(`.${root}`));
}
export function normalizeClinicDomain(raw: string) {
    const host = raw.trim().toLowerCase().replace(/\.$/, '');
    const labels = host.split('.');
    if (!isClinicDomainCandidate(host) || labels.length < 3 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/^[a-z]{2,63}$/.test(labels.at(-1)!))
        throw new Error('Enter a subdomain you own, such as care.yourclinic.com, without https://, paths or ports.');
    return host;
}
export type ClinicDnsRecord = { type: 'CNAME' | 'TXT'; name: string; value: string; purpose: string };
export type ClinicDomainStatus = {
    hostname: string; status: 'pending' | 'active' | 'disconnecting'; records: ClinicDnsRecord[];
    lastCheckedAt: string | null; verifiedAt: string | null;
};
export type ClinicDomainSettings = { enabled: boolean; configured: boolean; domain: ClinicDomainStatus | null };
export type ClinicSiteAddress = { home: string; canonicalHome: string };
export function defaultClinicSite(slug: string): ClinicSiteAddress {
    const home = `/clinics/${slug}`;
    return { home, canonicalHome: `${PARTNER_ORIGIN}${home}` };
}

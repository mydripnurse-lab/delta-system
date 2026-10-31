import 'server-only';
import type { ClinicDnsRecord } from './clinicDomainPolicy';

type ProjectDomain = { name: string; verified: boolean; verification?: { type: string; domain: string; value: string }[] };
type DomainConfig = { misconfigured: boolean; recommendedCNAME?: { rank: number; value: string }[] };
// Configure in the hosting environment, never in browser code or source control:
// CLINIC_DOMAINS_VERCEL_TOKEN (dedicated token with the minimum available scope),
// CLINIC_DOMAINS_VERCEL_PROJECT_ID, CLINIC_DOMAINS_VERCEL_TEAM_ID.
// Do not reuse or copy unrelated application credentials. No automatic domain
// purchases, DNS-zone edits, forced ownership transfers or deployment creation.
export const clinicDomainProviderConfigured = () => Boolean(process.env.CLINIC_DOMAINS_VERCEL_TOKEN && process.env.CLINIC_DOMAINS_VERCEL_PROJECT_ID && process.env.CLINIC_DOMAINS_VERCEL_TEAM_ID);
function projectPath(hostname: string) {
    return `/v9/projects/${encodeURIComponent(process.env.CLINIC_DOMAINS_VERCEL_PROJECT_ID!)}/domains/${encodeURIComponent(hostname)}`;
}
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!clinicDomainProviderConfigured()) throw new Error('Domain connections are not configured yet. Contact My Drip Nurse.');
    const url = new URL(path, 'https://api.vercel.com');
    url.searchParams.set('teamId', process.env.CLINIC_DOMAINS_VERCEL_TEAM_ID!);
    const response = await fetch(url, { method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${process.env.CLINIC_DOMAINS_VERCEL_TOKEN}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    // Never return provider payloads or credentials in errors.
    if (method === 'DELETE' && response.status === 404) return {} as T;
    if (!response.ok) throw new Error('The hosting provider could not complete this request. Your existing website is unchanged; contact My Drip Nurse if it persists.');
    return (response.status === 204 ? {} : await response.json()) as T;
}
export function domainConfiguration(hostname: string) {
    return request<DomainConfig>(`/v6/domains/${encodeURIComponent(hostname)}/config?projectIdOrName=${encodeURIComponent(process.env.CLINIC_DOMAINS_VERCEL_PROJECT_ID!)}`);
}
export function attachClinicDomain(hostname: string) {
    return request<ProjectDomain>(`/v10/projects/${encodeURIComponent(process.env.CLINIC_DOMAINS_VERCEL_PROJECT_ID!)}/domains`, 'POST', { name: hostname });
}
export function verifyClinicDomainProvider(hostname: string) { return request<ProjectDomain>(`${projectPath(hostname)}/verify`, 'POST'); }
export function inspectClinicDomain(hostname: string) { return request<ProjectDomain>(projectPath(hostname)); }
export function detachClinicDomain(hostname: string) { return request(projectPath(hostname), 'DELETE'); }
export function providerDnsRecords(hostname: string, config: DomainConfig, domain?: ProjectDomain): ClinicDnsRecord[] {
    const cname = [...(config.recommendedCNAME || [])].sort((a, b) => a.rank - b.rank)[0]?.value;
    if (!cname || !/^[a-z0-9.-]+\.?$/i.test(cname)) throw new Error('DNS instructions are not available yet. Please try again.');
    return [{ type: 'CNAME', name: hostname, value: cname, purpose: 'Website routing' }, ...(domain?.verification || []).filter(r => r.type === 'TXT').map(r => ({ type: 'TXT' as const, name: r.domain, value: r.value, purpose: 'Hosting verification' }))];
}

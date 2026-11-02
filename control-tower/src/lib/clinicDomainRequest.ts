import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { clinicByDomain } from './clinicDomainLookup';
import { isClinicDomainCandidate } from './clinicDomainPolicy';
import { clinicsEnabled } from './clinicFeature';

// Deduplicated within the request; domain routing itself uses the shared 5-minute cache.
// Never trust a body parameter or forwarded tenant header as an authorization grant.
export const getRequestClinicTenant = cache(async () => {
    const host = (await headers()).get('host')?.split(':')[0].toLowerCase() || '';
    if (!isClinicDomainCandidate(host)) return null;
    if (!clinicsEnabled()) notFound();
    const clinic = await clinicByDomain(host);
    if (!clinic) notFound();
    return clinic;
});
export async function requirePublicClinicDomain(host: string) {
    const clinic = await getRequestClinicTenant();
    if (!clinic || clinic.hostname !== host) notFound();
    return clinic;
}

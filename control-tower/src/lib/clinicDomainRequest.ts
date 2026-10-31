import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { clinicByDomain } from './clinicDomains';
import { clinicsEnabled } from './clinicFeature';

export async function requirePublicClinicDomain(host: string) {
    // Read the actual host, never a client-supplied forwarded clinic ID/slug.
    const actualHost = (await headers()).get('host')?.split(':')[0].toLowerCase();
    if (!clinicsEnabled() || actualHost !== host) notFound();
    const clinic = await clinicByDomain(host);
    if (!clinic) notFound();
    return clinic;
}

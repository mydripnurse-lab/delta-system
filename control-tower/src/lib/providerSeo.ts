import type { Metadata } from 'next';

/** Public presentation only: reuse the already authorized, cached provider data. */
type Coverage = { state: string; county?: string; city?: string; placeName?: string };
export function providerCoverage(areas: readonly Coverage[]) {
    const entries = areas.map(area => {
        const state = area.state.trim();
        const city = (area.city || area.placeName || '').trim();
        const county = (area.county || '').trim();
        const parts = [...new Set([city, county, state].filter(Boolean))];
        return {
            label: parts.join(', '),
            schema: {
                '@type': city ? 'City' : 'AdministrativeArea',
                name: city || county || state,
                ...(city && county ? { containedInPlace: { '@type': 'AdministrativeArea', name: county, ...(state ? { containedInPlace: { '@type': 'AdministrativeArea', name: state } } : {}) } }
                    : (city || county) && state && state !== (city || county) ? { containedInPlace: { '@type': 'AdministrativeArea', name: state } } : {}),
            },
        };
    }).filter(area => area.label);
    return [...new Map(entries.map(area => [area.label.toLowerCase(), area])).values()];
}

export function coverageSummary(areas: readonly Coverage[], limit = 2) {
    const labels = providerCoverage(areas).map(area => area.label);
    return labels.slice(0, limit).join('; ');
}

export function publishedServiceNames(services: readonly { name: string; status: string }[]) {
    return [...new Set(services.filter(s => ['active', 'out_of_stock'].includes(s.status.toLowerCase())).map(s => s.name.trim()).filter(Boolean))];
}

export function publicProviderMetadata(title: string, description: string, canonical: string, image?: string, keywords?: string[]): Metadata {
    return {
        metadataBase: new URL(canonical),
        title, description, ...(keywords?.length ? { keywords } : {}), alternates: { canonical },
        robots: { index: true, follow: true },
        openGraph: { type: 'website', title, description, url: canonical, ...(image ? { images: [image] } : {}) },
        twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
    };
}

export function clinicEntity(clinic: { name: string; description: string; logoUrl: string; coverage: Coverage[] }, home: string) {
    return { '@type': 'Organization', '@id': `${home}#clinic`, name: clinic.name, url: home,
        logo: clinic.logoUrl || undefined, description: clinic.description || undefined,
        areaServed: providerCoverage(clinic.coverage).map(area => area.schema) };
}

export function clinicServiceEntities(services: readonly { slug: string; name: string; description: string; imageUrl: string }[], home: string, areas: readonly Coverage[]) {
    return services.map(service => ({ '@type': 'Service', '@id': `${home}/services/${service.slug}#service`,
        name: service.name, description: service.description, image: service.imageUrl || undefined,
        url: `${home}/services/${service.slug}`, provider: { '@id': `${home}#clinic` },
        areaServed: providerCoverage(areas).map(area => area.schema) }));
}

/** Descriptive metadata only, never a ranking guarantee or invented coverage. */
export function clinicKeywords(clinic: { name: string; coverage: Coverage[] }, services: readonly string[] = []) {
    return [...new Set([clinic.name, ...services, ...providerCoverage(clinic.coverage).slice(0, 6).map(a => a.label)])];
}
export function clinicServiceIntroduction(clinic: { name: string; description: string; coverage: Coverage[] }, service: { name: string }, team: readonly { name: string; credentials: string }[]) {
    const area = coverageSummary(clinic.coverage, 3);
    const professionals = team.slice(0, 4).map(n => [n.name, n.credentials].filter(Boolean).join(', '));
    return {
        heading: `${service.name} with ${clinic.name}`,
        description: clinic.description.trim(),
        coverage: area ? `${clinic.name} lists ${service.name} for ${area}. Enter the visit address to check which team members can attend at your selected time.` : 'Enter your visit address to check coverage and available professionals.',
        team: professionals.length ? `The clinic team offering this service includes ${professionals.join('; ')}. Availability varies by address and appointment time.` : 'Available clinic professionals will appear when coverage and an appointment time are confirmed.',
    };
}

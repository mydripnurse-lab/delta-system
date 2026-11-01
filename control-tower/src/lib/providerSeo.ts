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

export function publicProviderMetadata(title: string, description: string, canonical: string, image?: string): Metadata {
    return {
        metadataBase: new URL(canonical),
        title, description, alternates: { canonical },
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

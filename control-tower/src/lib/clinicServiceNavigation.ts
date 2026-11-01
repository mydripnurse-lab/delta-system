export type ClinicNavigationService = { id: string; slug: string; name: string; imageUrl: string | null };
export function clinicServiceGroups<T extends ClinicNavigationService>(services: T[]) {
    const groups = [
        { id: 'iv-therapy', image: '/clinic-assets/category-iv-therapy.webp', imageAlt: 'A nurse providing mobile IV therapy to a client at home', label: 'IV Therapy', description: 'Explore IV wellness services with your local care team.', services: [] as T[] },
        { id: 'nad', image: '/clinic-assets/category-nad.webp', imageAlt: 'A nurse supporting a client during an at-home infusion visit', label: 'NAD+', description: 'Discover the NAD+ options offered by this clinic.', services: [] as T[] },
        { id: 'vitamins', image: '/clinic-assets/category-vitamins.webp', imageAlt: 'A nurse preparing a client for a vitamin injection at home', label: 'Vitamins', description: 'Explore vitamin and injection services available through the clinic.', services: [] as T[] },
    ];
    for (const service of services) {
        const name = `${service.slug} ${service.name}`;
        const group = /\bnad(?:\b|\+)/i.test(name) ? groups[1] : /vitamin.*injection|vitamin-injection|\bb-?12\b|\bshots?\b/i.test(name) ? groups[2] : groups[0];
        group.services.push(service);
    }
    return groups.filter(group => group.services.length > 0);
}

export type ClinicNavigationService = { id: string; slug: string; name: string; imageUrl: string | null };
export function clinicServiceGroups<T extends ClinicNavigationService>(services: T[]) {
    const groups = [
        { id: 'iv-therapy', label: 'IV Therapy', description: 'Explore IV wellness services with your local care team.', services: [] as T[] },
        { id: 'nad', label: 'NAD+', description: 'Discover the NAD+ options offered by this clinic.', services: [] as T[] },
        { id: 'vitamins', label: 'Vitamins', description: 'Explore vitamin and injection services available through the clinic.', services: [] as T[] },
    ];
    for (const service of services) {
        const name = `${service.slug} ${service.name}`;
        const group = /\bnad(?:\b|\+)/i.test(name) ? groups[1] : /vitamin.*injection|vitamin-injection|\bb-?12\b|\bshots?\b/i.test(name) ? groups[2] : groups[0];
        group.services.push(service);
    }
    return groups.filter(group => group.services.length > 0);
}

// Shared URL contract; no data fetching is needed when switching sections.
export const clinicScreens = {
    overview: 'Overview', appointments: 'Appointments', profile: 'Profile', website: 'Website',
    directory: 'Directory', services: 'Services', affiliates: 'Affiliates', team: 'Team',
    coverage: 'Coverage', support: 'Support', rewards: 'Rewards', products: 'Products',
} as const;
export type ClinicScreen = typeof clinicScreens[keyof typeof clinicScreens];
export const clinicProfileScreens = ['details', 'branding', 'account', 'practice'] as const;
export function parseClinicScreen(parts: string[] = []) {
    const key = parts[0] || 'overview';
    if (!Object.hasOwn(clinicScreens, key) || parts.length > 2) return null;
    if (parts[1] && (key !== 'profile' || !clinicProfileScreens.includes(parts[1] as typeof clinicProfileScreens[number]))) return null;
    return { section: clinicScreens[key as keyof typeof clinicScreens], profile: parts[1] || 'details' };
}
export function clinicScreenUrl(section: ClinicScreen, clinicId: string, profile = 'details', appointment?: string) {
    const key = Object.entries(clinicScreens).find(([, value]) => value === section)?.[0] || 'overview';
    const query = new URLSearchParams({ clinic: clinicId });
    if (appointment) query.set('appointment', appointment);
    return `/portal/clinics/${key}${key === 'profile' && profile !== 'details' ? `/${profile}` : ''}?${query}`;
}

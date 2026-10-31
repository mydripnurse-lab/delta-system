// Explicit rollout switch: migrate and verify before enabling in production.
export const clinicsEnabled = () => process.env.CLINIC_PARTNERS_ENABLED === 'true';
// Portal onboarding can launch before clinic-specific communications are connected.
export const clinicBookingsEnabled = () => clinicsEnabled() && process.env.CLINIC_BOOKINGS_ENABLED === 'true';
export function requireClinicBookingsEnabled() { if (!clinicBookingsEnabled())
    throw new Error('Online bookings for clinics are not open yet.'); }
export function requireClinicsEnabled() { if (!clinicsEnabled())
    throw new Error('Clinic registration is not open yet.'); }

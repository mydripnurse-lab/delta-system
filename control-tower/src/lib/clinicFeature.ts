// Explicit rollout switch: migrate and verify before enabling in production.
export const clinicsEnabled = () => process.env.CLINIC_PARTNERS_ENABLED === 'true';
export function requireClinicsEnabled() { if (!clinicsEnabled())
    throw new Error('Clinic registration is not open yet.'); }

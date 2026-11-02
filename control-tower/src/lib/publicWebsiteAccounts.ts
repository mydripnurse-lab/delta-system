import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { CLINIC_COOKIE, getClinicIdentity } from '@/lib/clinicAuth';
import { getAuthenticatedClient } from '@/lib/clientPortalAuth';
import { getPartnerPortalSession } from '@/lib/partnerPortalAuth';

import { getRequestClinicTenant } from '@/lib/clinicDomainRequest';
import { clinicLoginDestination } from '@/lib/clinicLogin';

// Private request-scoped identity only. Never put these values in the public catalog cache.
export const publicWebsiteAccounts = cache(async () => {
    const [client, partner] = await Promise.all([getAuthenticatedClient(), getPartnerPortalSession()]);
    // Both auth readers return before accessing the database when there is no session.
    // Avoid repeating partner session reads through getClinicIdentity.
    const clinic = !partner && (await cookies()).has(CLINIC_COOKIE) ? await getClinicIdentity() : null;
    const tenant = await getRequestClinicTenant();
    const identity = partner || clinic;
    const access = tenant && identity ? await clinicLoginDestination(tenant.slug, identity.email) : null;
    const clinicPortal = tenant ? `/portal/clinics?clinic=${encodeURIComponent(tenant.clinicId)}` : 'https://partners.mydripnurse.com/portal/clinics';
    const nursePortal = tenant ? '/portal' : 'https://partners.mydripnurse.com/portal';
    return {
        account: client ? { fullName: client.fullName, email: client.email, photoUrl: client.profilePhotoUrl, photoUpdatedAt: client.profilePhotoUpdatedAt } : null,
        partnerAccount: partner ? { fullName: partner.display_name, email: partner.email, photoUrl: partner.clinic_avatar_url || '', photoUpdatedAt: '', portalLabel: access?.canManage ? 'Clinic Portal' : 'Partner Portal', portalHref: access?.canManage ? clinicPortal : nursePortal, profileHref: tenant ? `/nurses/${partner.slug}` : `https://partners.mydripnurse.com/${partner.slug}` } : clinic ? { fullName: clinic.name, email: clinic.email, photoUrl: clinic.photoUrl, photoUpdatedAt: '', portalLabel: 'Clinic Portal', portalHref: clinicPortal, profileHref: clinicPortal, profileLabel: 'My clinics' } : null,
    };
});

import 'server-only';
import { getDbPool } from './db';
import { clinicsEnabled } from './clinicFeature';
// Deliberately uncached: role, accepted invitation and suspension changes take effect at sign-in.
export async function clinicLoginDestination(slug: string, email: string) {
    if (!clinicsEnabled() || !/^[a-z0-9-]{3,80}$/.test(slug)) return null;
    const { rows } = await getDbPool().query<{ clinicId: string; role: 'owner' | 'manager' | 'nurse'; partnerId: string | null }>(`select c.id as "clinicId",m.role,m.partner_profile_id as "partnerId" from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id where c.slug=$1 and c.status='approved' and m.email=$2 and m.status='active' and m.accepted_at is not null and m.authorized_at is not null and (m.role in ('owner','manager') or (m.role='nurse' and m.partner_profile_id is not null)) order by case when m.role='owner' then 0 when m.role='manager' then 1 else 2 end limit 1`, [slug, email.trim().toLowerCase()]);
    const member = rows[0];
    return member ? { ...member, redirectTo: member.role === 'nurse' ? '/portal' : `/portal/clinics?clinic=${encodeURIComponent(member.clinicId)}` } : null;
}

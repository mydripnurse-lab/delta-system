import 'server-only';
import type { PoolClient } from 'pg';

export async function validateClinicMemberServices(db: PoolClient, clinicId: string, ids: string[]) {
    const selected = [...new Set(ids)];
    if (!selected.length) return selected;
    const { rows } = await db.query<{ service_id: string }>(`select p.service_id from app.clinic_service_prices p
      join app.clinics c on c.id=p.clinic_id
      join app.services s on s.id=p.service_id and s.organization_id=c.organization_id and s.is_active
      where p.clinic_id=$1 and p.enabled and p.service_id=any($2::uuid[]) for share of p,s`, [clinicId, selected]);
    if (rows.length !== selected.length) throw new Error('Choose services enabled in your clinic catalog.');
    return selected;
}

// Keep existing independent/other-clinic assignments and stock settings intact.
export async function ensureClinicMemberServices(db: PoolClient, clinicId: string, partnerId?: string) {
    await db.query(`insert into app.partner_service_assignments(organization_id,partner_profile_id,service_id,status,activated_at)
      select distinct c.organization_id,m.partner_profile_id,p.service_id,'active',now()
      from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
      join app.clinic_service_prices p on p.clinic_id=c.id and p.enabled and p.availability_status<>'paused'
      join app.services s on s.id=p.service_id and s.organization_id=c.organization_id and s.is_active
      where c.id=$1 and m.role='nurse' and m.status='active' and m.accepted_at is not null and m.authorized_at is not null
      and m.partner_profile_id is not null and ($2::uuid is null or m.partner_profile_id=$2)
      and (m.service_ids is null or p.service_id=any(m.service_ids))
      on conflict(partner_profile_id,service_id) do nothing`, [clinicId, partnerId || null]);
}

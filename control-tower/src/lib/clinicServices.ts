import { CLINIC_MANAGER_SQL } from '@/lib/clinicPolicy';
import 'server-only';
import { ensureClinicMemberServices } from '@/lib/clinicMemberServices';
import { z } from 'zod';
import { getDbPool } from '@/lib/db';
import { requireClinicManager } from '@/lib/clinicAuth';
import { revalidateTag } from 'next/cache';
import { CLINIC_CACHE_TAG } from '@/lib/clinicPolicy';

const serviceInput = z.object({ serviceId: z.string().uuid(), status: z.enum(['active', 'paused', 'out_of_stock']) });
const suggestionInput = z.object({ type: z.enum(['service', 'recipe', 'other']), name: z.string().trim().min(2).max(160), ingredients: z.array(z.string().trim().min(1).max(200)).max(40), details: z.string().trim().max(4000) });

export async function changeClinicService(clinicId: string, raw: unknown, suggestion = false) {
    const input = suggestion ? suggestionInput.parse(raw) : serviceInput.parse(raw);
    const actor = await requireClinicManager(clinicId);
    const client = await getDbPool().connect();
    try {
        await client.query('begin');
        // Lock the current grant so approval or membership revocation cannot race this write.
        const access = await client.query(`select c.id from app.clinics c join app.clinic_memberships m on m.clinic_id=c.id where c.id=$1 and c.status='approved' and m.email=$2 and m.status='active' and m.accepted_at is not null and ${CLINIC_MANAGER_SQL} for share of c,m`, [clinicId, actor.email]);
        if (!access.rowCount) throw new Error('An approved clinic and active manager access are required.');
        if ('serviceId' in input) {
            const updated = await client.query(`insert into app.clinic_service_prices(clinic_id,service_id,availability_status)
              select c.id,s.id,$3 from app.clinics c join app.services s on s.organization_id=c.organization_id where c.id=$1 and s.id=$2 and s.is_active
              on conflict(clinic_id,service_id) do update set availability_status=excluded.availability_status,updated_at=now()
              where clinic_service_prices.enabled returning service_id`, [clinicId, input.serviceId, input.status]);
            if (!updated.rowCount) throw new Error('My Drip Nurse must enable this service for your clinic first.');
            if (input.status !== 'paused') await ensureClinicMemberServices(client, clinicId);
            await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,$3,$4)`, [clinicId, actor.email, `service_${input.status}`, input.serviceId]);
        } else {
            await client.query(`insert into app.clinic_service_suggestions(clinic_id,submitted_by,suggestion_type,name,ingredients,details) values($1,$2,$3,$4,$5,$6)`, [clinicId, actor.email, input.type, input.name, input.ingredients, input.details]);
        }
        await client.query('commit');
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally { client.release(); }
    if (!suggestion) revalidateTag(CLINIC_CACHE_TAG, { expire: 0 });
}

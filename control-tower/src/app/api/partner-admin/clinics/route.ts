import type { PoolClient } from 'pg';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePartnerAdmin } from '@/lib/partnerAdminAuth';
import { requireClinicsEnabled, requireClinicOrigin } from '@/lib/clinicAuth';
import { getDbPool } from '@/lib/db';
import { listClinics, invalidateClinics } from '@/lib/clinics';
import { validateRegionalPrices } from '@/lib/regionalPricingCatalog';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    const auth = await requirePartnerAdmin(request, { ownerOnly: true });
    if ('response' in auth)
        return auth.response;
    try {
        requireClinicsEnabled();
        const url = new URL(request.url);
        const service = url.searchParams.get('serviceId');
        if (service) {
            const { rows } = await getDbPool().query(`select clinic_id as "clinicId",enabled,price::float8,regional_prices as "regionalPrices" from app.clinic_service_prices where service_id=$1 order by clinic_id limit 500`, [z.string().uuid().parse(service)]);
            return json({ ok: true, clinics: await listClinics(), prices: rows });
        }
        const page = z.coerce.number().int().min(0).max(1000).parse(url.searchParams.get('page') || 0);
        return json({ ok: true, clinics: await listClinics(undefined, page * 50) });
    }
    catch {
        return json({ error: 'Clinics are not available. Complete the clinic migration and enable the feature.' }, 503);
    }
}
export async function POST(request: Request) {
    const auth = await requirePartnerAdmin(request, { ownerOnly: true });
    if ('response' in auth)
        return auth.response;
    let client: PoolClient | null = null;
    try {
        requireClinicsEnabled();
        requireClinicOrigin(request);
        const body = await request.json();
        const id = z.string().uuid().parse(body.clinicId);
        if (!['status', 'price'].includes(body.action))
            return json({ error: 'Unknown action.' }, 400);
        client = await getDbPool().connect();
        await client.query('begin');
        if (body.action === 'status') {
            const status = z.enum(['approved', 'suspended', 'pending']).parse(body.status);
            await client.query(`update app.clinics set status=$2,approved_by=$3,approved_at=case when $2='approved' then now() else approved_at end,published=case when $2='approved' then published else false end,updated_at=now() where id=$1`, [id, status, auth.user.id]);
            await client.query(`insert into app.clinic_audit(clinic_id,actor,action) values($1,$2,$3)`, [id, auth.user.id, `clinic_${status}`]);
        }
        else if (body.action === 'price') {
            const input = z.object({ serviceId: z.string().uuid(), enabled: z.boolean(), price: z.number().finite().min(0).max(1000000).multipleOf(.01).nullable(), regionalPrices: z.array(z.object({ regionId: z.string().max(300), price: z.number().finite().min(0).max(1000000).multipleOf(.01) })).max(500) }).parse(body);
            const regions = await validateRegionalPrices(input.regionalPrices);
            const result = await client.query(`insert into app.clinic_service_prices(clinic_id,service_id,enabled,price,regional_prices,updated_by) select c.id,s.id,$3,$4,$5::jsonb,$6 from app.clinics c join app.services s on s.organization_id=c.organization_id where c.id=$1 and s.id=$2 on conflict(clinic_id,service_id) do update set enabled=excluded.enabled,price=excluded.price,regional_prices=excluded.regional_prices,updated_by=excluded.updated_by,updated_at=now() returning clinic_id`, [id, input.serviceId, input.enabled, input.price, JSON.stringify(regions), auth.user.id]);
            if (!result.rows.length)
                throw new Error('Service not found in this organization.');
            if (input.enabled)
                await client.query(`insert into app.partner_service_assignments(organization_id,partner_profile_id,service_id,status,activated_at) select c.organization_id,m.partner_profile_id,$2,'active',now() from app.clinics c join app.clinic_memberships m on m.clinic_id=c.id where c.id=$1 and m.role='nurse' and m.status='active' and m.partner_profile_id is not null on conflict(partner_profile_id,service_id) do nothing`, [id, input.serviceId]);
            await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,'service_price_updated',$3)`, [id, auth.user.id, input.serviceId]);
        }
        else
            return json({ error: 'Unknown action.' }, 400);
        await client.query('commit');
        invalidateClinics();
        return json({ ok: true });
    }
    catch (error) {
        if (client)
            await client.query('rollback');
        return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : 'Unable to save clinic settings.' }, 400);
    }
    finally {
        client?.release();
    }
}

import { consumeClinicRequestBudget } from "@/lib/clinicRequestBudget";
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClinicIdentity, requireClinicsEnabled, requireClinicOrigin } from '@/lib/clinicAuth';
import { registerClinic, listClinics, clinicWorkspace, saveClinic, inviteClinicMember, acceptClinicInvite, updateClinicMember } from '@/lib/clinics';
import { loadPricingRegions } from '@/lib/regionalPricingCatalog';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
    try {
        requireClinicsEnabled();
        const identity = await getClinicIdentity();
        if (!identity)
            return json({ error: 'Sign in to continue.' }, 401);
        const url = new URL(request.url), id = url.searchParams.get('id');
        if (id)
            return json({ ok: true, ...await clinicWorkspace(z.string().uuid().parse(id)) });
        if (url.searchParams.get('regions') === '1')
            return json({ ok: true, ...await loadPricingRegions() });
        return json({ ok: true, clinics: await listClinics(identity.email), identity });
    }
    catch {
        return json({ error: 'Unable to access this clinic workspace.' }, 403);
    }
}
export async function POST(request: Request) {
    try {
        requireClinicsEnabled();
        requireClinicOrigin(request);
        const raw = await request.text();
        if (raw.length > 100000)
            return json({ error: 'Request too large.' }, 413);
        const body = JSON.parse(raw);
        if (!consumeClinicRequestBudget(request, body.action === 'register' ? 'clinic-registration' : 'clinic-write', body.action === 'register' ? 10 : 100))
            return json({ error: 'Too many requests. Please try again later.' }, 429);
        if (body.action === 'register')
            return json({ ok: true, id: await registerClinic(body) });
        if (body.action === 'accept') {
            await acceptClinicInvite(body);
            return json({ ok: true });
        }
        const id = z.string().uuid().parse(body.clinicId);
        if (body.action === 'save')
            await saveClinic(id, body);
        else if (body.action === 'invite')
            return json({ ok: true, inviteUrl: await inviteClinicMember(id, body) });
        else if (body.action === 'member')
            await updateClinicMember(id, body);
        else
            return json({ error: 'Unknown action.' }, 400);
        return json({ ok: true });
    }
    catch (error) {
        return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error && !('code' in error) ? error.message : 'Unable to save. Check your details and try again.' }, 400);
    }
}

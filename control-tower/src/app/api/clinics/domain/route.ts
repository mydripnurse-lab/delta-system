import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicOrigin } from '@/lib/clinicAuth';
import { clinicDomainSettings, changeClinicDomain } from '@/lib/clinicDomains';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
    try { return json(await clinicDomainSettings(z.string().uuid().parse(new URL(request.url).searchParams.get('clinicId')))); }
    catch { return json({ error: 'Unable to access these domain settings.' }, 403); }
}
export async function POST(request: Request) {
    try {
        requireClinicOrigin(request);
        if (!consumeClinicRequestBudget(request, 'clinic-domain', 10, 600000)) return json({ error: 'Too many requests. Please try again later.' }, 429);
        const raw = await request.text();
        if (raw.length > 2000) return json({ error: 'Request too large.' }, 413);
        const body = z.object({ clinicId: z.string().uuid(), action: z.enum(['connect','verify','disconnect']), hostname: z.string().max(253).default('') }).parse(JSON.parse(raw));
        return json(await changeClinicDomain(body.clinicId, body.action, body.hostname));
    } catch (error) { return json({ error: error instanceof z.ZodError ? 'Check the domain and try again.' : error instanceof Error && !('code' in error) ? error.message : 'Unable to update this domain.' }, 400); }
}

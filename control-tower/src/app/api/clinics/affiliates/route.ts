import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicsEnabled } from '@/lib/clinicFeature';
import { getClinicAffiliateDashboard } from '@/lib/clinicAffiliate';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    try {
        requireClinicsEnabled();
        const id = z.string().uuid().parse(new URL(request.url).searchParams.get('clinicId'));
        return NextResponse.json({ ok: true, data: await getClinicAffiliateDashboard(id) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
        return NextResponse.json({ ok: false, error: 'Unable to access clinic affiliate earnings. Sign in as the clinic owner.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    }
}

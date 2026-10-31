import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicsEnabled } from '@/lib/clinicAuth';
import { getClinicDashboard } from '@/lib/clinicDashboard';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    try {
        requireClinicsEnabled();
        const params = new URL(request.url).searchParams;
        const id = z.string().uuid().parse(params.get('clinicId'));
        const days = z.coerce.number().refine(n => [30, 90, 365].includes(n)).parse(params.get('days') || 30);
        return NextResponse.json({ data: await getClinicDashboard(id, days) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return NextResponse.json({ error: error instanceof z.ZodError ? 'Invalid dashboard request.' : 'Unable to access clinic performance. Your clinic must be approved.' }, { status: error instanceof z.ZodError ? 400 : 403, headers: { 'Cache-Control': 'private, no-store' } });
    }
}

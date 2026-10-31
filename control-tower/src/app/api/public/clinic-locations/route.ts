import { clinicRegistrationLocations } from '@/lib/clinicRegistrationLocation';

export const runtime = 'nodejs';
export async function GET(request: Request) {
    try {
        const state = new URL(request.url).searchParams.get('state') || '';
        if (state.length > 40) throw new Error('Choose a valid state or territory.');
        return Response.json({ regions: clinicRegistrationLocations(state) }, {
            headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' },
        });
    } catch {
        return Response.json({ error: 'Choose a valid state or territory.' }, { status: 400 });
    }
}

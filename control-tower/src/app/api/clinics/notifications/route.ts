import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicsEnabled, requireClinicOrigin } from '@/lib/clinicAuth';
import { clinicNotificationFeed, readClinicNotifications } from '@/lib/clinicPortalNotifications';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const id=z.string().regex(/^[1-9]\d{0,17}$/);
const query=z.object({clinicId:z.string().uuid(),cursor:id.optional()});
export async function GET(request:Request) {
    if (!consumeClinicRequestBudget(request,'clinic-operations-read',180,60000)) return NextResponse.json({error:'Please wait a moment and try again.'},{status:429,headers});
    try {requireClinicsEnabled();const q=query.parse(Object.fromEntries(new URL(request.url).searchParams));
        return NextResponse.json({data:await clinicNotificationFeed(q.clinicId,q.cursor)},{headers});
    } catch {return NextResponse.json({error:'Unable to load clinic notifications.'},{status:403,headers});}
}
export async function POST(request:Request) {
    if (!consumeClinicRequestBudget(request,'clinic-operations-write',30,60000)) return NextResponse.json({error:'Please wait a moment and try again.'},{status:429,headers});
    try {requireClinicsEnabled();requireClinicOrigin(request);
        const body=z.object({clinicId:z.string().uuid(),ids:z.array(id).min(1).max(100)}).strict().parse(await request.json());
        await readClinicNotifications(body.clinicId,body.ids);
        return NextResponse.json({ok:true},{headers});
    } catch {return NextResponse.json({error:'Unable to mark notifications as read.'},{status:403,headers});}
}

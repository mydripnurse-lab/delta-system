import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicsEnabled, requireClinicOrigin } from '@/lib/clinicAuth';
import { clinicCalendar, clinicCalendarStaff, clinicVisit, clinicReassignmentCandidates, reassignClinicAppointment, ClinicAppointmentError } from '@/lib/clinicAppointments';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const uuid=z.string().uuid();
const querySchema=z.object({clinicId:uuid,mode:z.enum(['calendar','staff','visit','candidates']).default('calendar'),
    id:uuid.optional(),search:z.string().max(100).default(''),cursor:uuid.optional(),nurseId:uuid.optional(),
    from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),
    cursorTime:z.iso.datetime({offset:true}).optional(),cursorId:uuid.optional(),
    status:z.enum(['payment_pending','confirmed','partner_acknowledged','in_progress','completed','cancelled','refunded','failed']).optional()});
function failure(error: unknown) {
    const status=error instanceof z.ZodError?400:error instanceof ClinicAppointmentError?error.status:403;
    return NextResponse.json({error:error instanceof ClinicAppointmentError?error.message:status===400?'Invalid calendar request.':'Unable to access clinic appointments. Refresh or sign in again.'},{status,headers});
}
export async function GET(request:Request) {
    if (!consumeClinicRequestBudget(request,'clinic-operations-read',180,60000)) return NextResponse.json({error:'Please wait a moment and try again.'},{status:429,headers});
    try {
        requireClinicsEnabled();
        const q=querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        if(q.mode==='staff') return NextResponse.json({data:await clinicCalendarStaff(q.clinicId,q.search,q.cursor)},{headers});
        if(q.mode==='visit'||q.mode==='candidates') {
            const id=uuid.parse(q.id);
            return NextResponse.json({data:q.mode==='visit'?await clinicVisit(q.clinicId,id):await clinicReassignmentCandidates(q.clinicId,id,q.search,q.cursor)},{headers});
        }
        const from=z.iso.datetime({offset:true}).parse(q.from),to=z.iso.datetime({offset:true}).parse(q.to);
        const days=(Date.parse(to)-Date.parse(from))/86400000;
        if(days<=0||days>32||Boolean(q.cursorId)!==Boolean(q.cursorTime)) throw new ClinicAppointmentError('Choose a date range of up to 31 days.',400);
        return NextResponse.json({data:await clinicCalendar(q.clinicId,{...q,from,to})},{headers});
    } catch(error) {return failure(error);}
}
export async function POST(request:Request) {
    if (!consumeClinicRequestBudget(request,'clinic-operations-write',30,60000)) return NextResponse.json({error:'Please wait a moment and try again.'},{status:429,headers});
    try {
        requireClinicsEnabled();requireClinicOrigin(request);
        const body=z.object({clinicId:uuid,appointmentId:uuid,nurseId:uuid,version:z.string().min(10).max(50),reason:z.string().trim().min(3).max(500)}).strict().parse(await request.json());
        return NextResponse.json({data:await reassignClinicAppointment(body.clinicId,body)},{headers});
    } catch(error) {return failure(error);}
}

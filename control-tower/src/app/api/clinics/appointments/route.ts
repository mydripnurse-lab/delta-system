import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicsEnabled, requireClinicOrigin } from '@/lib/clinicAuth';
import { clinicCalendar, clinicCalendarStaff, clinicVisit, clinicReassignmentCandidates, reassignClinicAppointment, ClinicAppointmentError } from '@/lib/clinicAppointments';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
import { advancePartnerAppointment, declinePartnerAppointment } from '@/lib/partnerAppointments';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const uuid=z.string().uuid();
const nurseList=z.string().max(7500).transform(value=>value?value.split(','):[]).pipe(z.array(uuid).max(200));
const querySchema=z.object({clinicId:uuid,mode:z.enum(['calendar','staff','visit','candidates']).default('calendar'),
    id:uuid.optional(),search:z.string().max(100).default(''),cursor:uuid.optional(),nurseId:uuid.optional(),nurseIds:nurseList.optional(),staffMode:z.enum(['all','include','exclude']).default('all'),includeUnassigned:z.enum(['0','1']).transform(v=>v==='1').optional(),
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

// A clinic administrator responds only as the nurse assigned to this visit.
// The existing nurse lifecycle locks the assignment again before mutating it.
export async function PATCH(request:Request) {
    if (!consumeClinicRequestBudget(request,'clinic-operations-write',30,60000)) return NextResponse.json({error:'Please wait a moment and try again.'},{status:429,headers});
    try {
        requireClinicsEnabled();requireClinicOrigin(request);
        const body=z.object({clinicId:uuid,appointmentId:uuid,action:z.enum(['acknowledge','decline','start','complete']),reason:z.string().trim().max(1000).default('')}).strict().parse(await request.json());
        const visit=await clinicVisit(body.clinicId,body.appointmentId);
        if(!visit.canRespond||!visit.nurseId) throw new ClinicAppointmentError('You can only respond to your own assigned nursing visits.',403);
        if(body.action==='decline'){
            if(body.reason.length<3) throw new ClinicAppointmentError('Enter a reason for declining.',400);
            const result=await declinePartnerAppointment({profileId:visit.nurseId,appointmentId:visit.id,reason:body.reason});
            return NextResponse.json({ok:true,message:result.outcome==='reassigned'?'The appointment was offered to another available nurse.':'No replacement was available. The appointment was cancelled; review its payment status.'},{headers});
        }
        await advancePartnerAppointment({profileId:visit.nurseId,appointmentId:visit.id,action:body.action,earlyStartReason:body.reason});
        return NextResponse.json({ok:true,message:'Appointment updated.'},{headers});
    } catch(error){return failure(error);}
}

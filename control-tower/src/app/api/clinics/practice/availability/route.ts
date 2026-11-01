import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicManager, requireClinicOrigin, requireClinicsEnabled } from '@/lib/clinicAuth';
import { getOwnerPractice } from '@/lib/clinicOwnerPractice';
import { getPartnerWeeklyAvailability, savePartnerWeeklyAvailability } from '@/lib/partnerAvailability';
import { scheduleSchema } from '@/lib/partnerAvailabilitySchema';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
async function profile(request:Request) {
    requireClinicsEnabled();
    const id=z.string().uuid().parse(new URL(request.url).searchParams.get('clinicId'));
    const actor=await requireClinicManager(id);
    if(actor.role!=='owner'||actor.status!=='approved')throw new Error('Clinic owner access required.');
    const practice=await getOwnerPractice(id);
    if(!practice.eligible||!practice.partnerId)throw new Error('An approved nursing profile is required.');
    return {profileId:practice.partnerId,clinicId:id,email:actor.email};
}
function failure(error:unknown){return NextResponse.json({error:error instanceof z.ZodError?'Check your schedule and try again.':'Unable to access your schedule. Refresh your profile or contact My Drip Nurse.'},{status:400,headers});}
export async function GET(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-owner-schedule-read',30,60000))return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
    try{return NextResponse.json({data:await getPartnerWeeklyAvailability((await profile(request)).profileId,true)},{headers});}catch(error){return failure(error);}
}
export async function PUT(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-owner-schedule-write',15,60000))return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
    try{
        requireClinicOrigin(request);
        const {profileId,clinicId,email}=await profile(request);
        const raw=await request.text();if(raw.length>100000)return NextResponse.json({error:'Request too large.'},{status:413,headers});
        const parsed=JSON.parse(raw);
        const {timezone,days,blockedDates,blockedRanges}=scheduleSchema.parse(parsed);
        return NextResponse.json({data:await savePartnerWeeklyAvailability({profileId,timezone,days,...(Object.hasOwn(parsed,"blockedDates")?{blockedDates}:{}),...(Object.hasOwn(parsed,"blockedRanges")?{blockedRanges}:{}),schemaReady:true,authorizeWrite:async db=>{
            const access=await db.query(`select m.id from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
              where c.id=$1 and c.status='approved' and m.email=$2 and m.role='owner' and m.status='active'
              and m.accepted_at is not null and m.authorized_at is not null and m.partner_profile_id=$3
              and m.owner_practice_enabled=true for share of c,m`,[clinicId,email,profileId]);
            if(!access.rowCount)throw new Error('Clinic owner access changed.');
        }})},{headers});
    }catch(error){return failure(error);}
}

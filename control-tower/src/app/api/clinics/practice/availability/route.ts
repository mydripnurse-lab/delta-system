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
    return practice.partnerId;
}
function failure(error:unknown){return NextResponse.json({error:error instanceof z.ZodError?'Check your schedule and try again.':'Unable to access your schedule. Refresh your profile or contact My Drip Nurse.'},{status:400,headers});}
export async function GET(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-owner-schedule-read',30,60000))return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
    try{return NextResponse.json({data:await getPartnerWeeklyAvailability(await profile(request),true)},{headers});}catch(error){return failure(error);}
}
export async function PUT(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-owner-schedule-write',15,60000))return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
    try{
        requireClinicOrigin(request);
        const profileId=await profile(request);
        const raw=await request.text();if(raw.length>100000)return NextResponse.json({error:'Request too large.'},{status:413,headers});
        const {timezone,days}=scheduleSchema.parse(JSON.parse(raw));
        return NextResponse.json({data:await savePartnerWeeklyAvailability({profileId,timezone,days,schemaReady:true})},{headers});
    }catch(error){return failure(error);}
}

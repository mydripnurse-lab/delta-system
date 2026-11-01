import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicOrigin, requireClinicsEnabled } from '@/lib/clinicAuth';
import { getOwnerPractice, saveOwnerPractice } from '@/lib/clinicOwnerPractice';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const failure=(error:unknown)=>NextResponse.json({error:error instanceof Error && !('code' in error)?error.message:'Unable to update your nursing practice. Please contact My Drip Nurse.'},{status:400,headers});
export async function GET(request:Request) {
    if(!consumeClinicRequestBudget(request,'clinic-owner-practice-read',30,60000)) return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
    try {
        requireClinicsEnabled();
        const id=z.string().uuid().parse(new URL(request.url).searchParams.get('clinicId'));
        return NextResponse.json({data:await getOwnerPractice(id)},{headers});
    } catch(error){return failure(error);}
}
export async function POST(request:Request) {
    try {
        requireClinicsEnabled();requireClinicOrigin(request);
        if(!consumeClinicRequestBudget(request,'clinic-owner-practice',20,60000)) return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
        const raw=await request.text();
        if(raw.length>100000) return NextResponse.json({error:'Request too large.'},{status:413,headers});
        const body=JSON.parse(raw);
        const clinicId=z.string().uuid().parse(body.clinicId);
        await saveOwnerPractice(clinicId,body);
        return NextResponse.json({ok:true,data:await getOwnerPractice(clinicId)},{headers});
    } catch(error){return failure(error);}
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicOrigin, requireClinicsEnabled } from '@/lib/clinicAuth';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
import { clinicTeamIds,clinicTeamSchedule,saveClinicTeamSchedule } from '@/lib/clinicTeam';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function ids(request:Request){requireClinicsEnabled();return clinicTeamIds.parse(Object.fromEntries(new URL(request.url).searchParams));}
const failure=(error:unknown)=>json({error:error instanceof z.ZodError?'Check the schedule and try again.':error instanceof Error&&!('code' in error)?error.message:'Unable to access this schedule.'},400);
export async function GET(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-team-schedule-read',30,60000))return json({error:'Please wait before trying again.'},429);
    try{const {clinicId,memberId}=ids(request);return json({data:await clinicTeamSchedule(clinicId,memberId)});}catch(error){return failure(error);}
}
export async function PUT(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-team-schedule-write',15,60000))return json({error:'Please wait before trying again.'},429);
    try{
        requireClinicOrigin(request);const {clinicId,memberId}=ids(request);
        const raw=await request.text();if(raw.length>100000)return json({error:'Request too large.'},413);
        return json({data:await saveClinicTeamSchedule(clinicId,memberId,JSON.parse(raw))});
    }catch(error){return failure(error);}
}

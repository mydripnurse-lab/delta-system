import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireClinicOrigin, requireClinicsEnabled } from '@/lib/clinicAuth';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
import { clinicTeam,clinicTeamMember,setClinicTeamAdmin,clinicTeamIds } from '@/lib/clinicTeam';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(error:unknown)=>json({error:error instanceof z.ZodError?'Check your request and try again.':error instanceof Error&&!('code' in error)?error.message:'Unable to access the team.'},400);
export async function GET(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-team-read',60,60000))return json({error:'Please wait before trying again.'},429);
    try{
        requireClinicsEnabled();
        const params=new URL(request.url).searchParams,clinicId=z.string().uuid().parse(params.get('clinicId'));
        const memberId=params.get('memberId');
        if(memberId)return json({member:await clinicTeamMember(clinicId,z.string().uuid().parse(memberId))});
        const offset=z.coerce.number().int().min(0).max(100000).parse(params.get('offset')||0);
        const search=z.string().max(120).parse(params.get('search')||'');
        return json(await clinicTeam(clinicId,search,offset));
    }catch(error){return failure(error);}
}
export async function PATCH(request:Request){
    if(!consumeClinicRequestBudget(request,'clinic-team-access',15,60000))return json({error:'Please wait before trying again.'},429);
    try{
        requireClinicsEnabled();requireClinicOrigin(request);
        const raw=await request.text();if(raw.length>2000)return json({error:'Request too large.'},413);
        const body=clinicTeamIds.extend({enabled:z.boolean()}).parse(JSON.parse(raw));
        await setClinicTeamAdmin(body.clinicId,body.memberId,body.enabled);
        return json({ok:true});
    }catch(error){return failure(error);}
}

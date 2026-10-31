/* Isolated local PostgreSQL tests. Never accepts a production/Neon URL. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Pool } = require('pg');
const url = new URL(process.env.CLINIC_TEST_DATABASE_URL || 'postgresql://axel@127.0.0.1:55487/mdn_clinic_test');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/mdn_clinic_test') throw new Error('Use the dedicated local test database only.');
const pool = new Pool({connectionString:url.toString(),max:3});
const root = path.join(__dirname,'..');
let identity = null;
let queryCount = 0;
const query = pool.query.bind(pool);
pool.query = (...args) => {queryCount++;return query(...args);};
const org='10000000-0000-4000-8000-000000000001';
const service='10000000-0000-4000-8000-000000000002';
const memo = new Map();
const mocks = {
 'server-only':{}, 'react':{cache:fn=>fn},
 'next/headers':{cookies:async()=>({get:()=>undefined})},
 'next/cache':{unstable_cache:(fn,keys)=>async(...args)=>{const k=JSON.stringify([keys,args]);if(!memo.has(k))memo.set(k,await fn(...args));return memo.get(k);},revalidateTag:()=>memo.clear()},
 '@/lib/db':{getDbPool:()=>pool},
 '@/lib/partnerPortalAuth':{getPartnerPortalSession:async()=>identity?{email:identity.email,display_name:identity.name||'Fixture',profile_id:identity.partnerId||''}:null},
 '@/lib/myDripNurseServiceCatalog':{getMyDripNurseOrganizationId:async()=>org},
};
const modules = new Map();
function load(relative) {
 if(modules.has(relative))return modules.get(relative).exports;
 const module={exports:{}};modules.set(relative,module);
 const code=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:name.startsWith('@/')?load(`src/${name.slice(2)}.ts`):require(name),module,module.exports);
 return module.exports;
}
const pricing=load('src/lib/regionalPricing.ts');
const region=(level,state,county='',city='')=>({id:pricing.regionId(level,{state,county,city}),level,state,county,city,label:[city,county,state].filter(Boolean).join(', '),urls:[]});
const fl=region('state','Florida'),orange=region('county','Florida','Orange'),orlando=region('city','Florida','Orange','Orlando'),ca=region('county','California','Orange');
mocks['@/lib/regionalPricingCatalog']={loadPricingRegions:async()=>({regions:[fl,orange,orlando,ca],syncedAt:'',warnings:[]})};
process.env.CLINIC_PARTNERS_ENABLED='true';
const policy=load('src/lib/clinicPolicy.ts'),clinics=load('src/lib/clinics.ts'),booking=load('src/lib/clinicBooking.ts');
async function main(){
 const {consumeClinicRequestBudget}=load('src/lib/clinicRequestBudget.ts');
 const request=new Request('http://127.0.0.1',{headers:{'x-vercel-forwarded-for':'192.0.2.1'}});
 assert.equal(consumeClinicRequestBudget(request,'test',1,100,1000),true);
 assert.equal(consumeClinicRequestBudget(request,'test',1,100,1001),false);
 assert.equal(consumeClinicRequestBudget(request,'test',1,100,1101),true);
 await pool.query('drop schema if exists app cascade; create schema app;');
 await pool.query(`create table app.organizations(id uuid primary key);create table app.users(id uuid primary key);
 create table app.staff_applications(id uuid primary key default gen_random_uuid(),organization_id uuid references app.organizations(id),email text,status text,first_name text,last_name text,professional_credentials text,phone text,request_payload jsonb);
 create table app.services(id uuid primary key,organization_id uuid references app.organizations(id),slug text,name text,price numeric,currency text default 'USD',source_metadata jsonb default '{}',is_active boolean default true,image_url text,short_description text);
 create table app.service_calendars(id uuid primary key default gen_random_uuid(),service_id uuid references app.services(id),public_key text,status text);
 create table app.appointments(id uuid primary key default gen_random_uuid(),public_reference text,status text,starts_at timestamptz,partner_profile_id uuid,service_price numeric,deposit_amount numeric,customer_id uuid,currency text default 'USD',metadata jsonb default '{}');
 create table app.booking_customers(id uuid primary key,full_name text,email text,phone text);`);
 const foundation=fs.readFileSync(path.join(root,'db/migrations/042_mdn_booking_foundation.sql'),'utf8');
 for(const name of ['partner_profiles','partner_service_assignments']){
 const start=foundation.indexOf(`create table if not exists app.${name} (`),end=foundation.indexOf('\n);',start)+4;
 await pool.query(foundation.slice(start,end));
 }
 await pool.query("alter table app.partner_profiles add column directory_status text default 'hidden';");
 await pool.query(fs.readFileSync(path.join(root,'db/migrations/048_clinic_partners.sql'),'utf8'));
 // Migration must be repeatable, including indexes and additive columns.
 await pool.query(fs.readFileSync(path.join(root,'db/migrations/048_clinic_partners.sql'),'utf8'));
 await pool.query('insert into app.organizations values($1)',[org]);
 await pool.query("insert into app.services(id,organization_id,slug,name,price) values($1,$2,'alleviate','Alleviate',219)",[service,org]);
 await pool.query("insert into app.service_calendars(service_id,public_key,status) values($1,'fixture-calendar','active')",[service]);
 const input={name:'Fixture Clinic',slug:'fixture-clinic',fullName:'Fixture Owner',email:'owner@example.invalid',password:'FixtureOnly2026!',contactEmail:'clinic@example.invalid',contactPhone:'',description:'Local fixture clinic'};
 const id=await clinics.registerClinic(input);
 assert.equal((await query('select status from app.clinics where id=$1',[id])).rows[0].status,'pending');
 await assert.rejects(()=>clinics.registerClinic({...input,slug:'duplicate-account'}),/already exists/);
 identity={email:input.email};
 await assert.rejects(()=>clinics.inviteClinicMember(id,{email:'nurse@example.invalid',role:'nurse'}),/approved/);
 const save={...input,logoUrl:'',primaryColor:'#084f5e',accentColor:'#e9f3f7',coverageIds:[orange.id],published:true};
 await assert.rejects(()=>clinics.saveClinic(id,save),/approve/);
 await query("update app.clinics set status='approved' where id=$1",[id]);
 await clinics.saveClinic(id,save);
 identity={email:'intruder@example.invalid'};
 await assert.rejects(()=>clinics.clinicWorkspace(id),/denied/);
 await assert.rejects(()=>clinics.inviteClinicMember(id,{email:'nurse@example.invalid',role:'nurse'}),/denied/);
 identity={email:input.email};
 await query('insert into app.clinic_service_prices(clinic_id,service_id,price,regional_prices) values($1,$2,229,$3)',[id,service,JSON.stringify([{region:orlando,price:239}])]);
 const invitation=await clinics.inviteClinicMember(id,{email:'nurse@example.invalid',role:'nurse'});
 const token=new URL(invitation).hash.slice(1);
 identity=null;
 await assert.rejects(()=>clinics.acceptClinicInvite({token,fullName:'Wrong User',email:'wrong@example.invalid',password:input.password,credentials:'RN'}),/belongs/);
 await clinics.acceptClinicInvite({token,fullName:'Fixture Nurse',email:'nurse@example.invalid',password:input.password,credentials:'RN - TEST ONLY',phone:'+15555550123',publicProfileConsent:true});
 await assert.rejects(()=>clinics.acceptClinicInvite({token,fullName:'Fixture Nurse',email:'nurse@example.invalid',password:input.password}),/expired/);
 const member=(await query('select * from app.clinic_memberships where clinic_id=$1 and role=\'nurse\'',[id])).rows[0];
 assert.equal(member.status,'pending');
 assert.deepEqual((await booking.clinicBookingContext(id,'fixture-calendar',orlando)).partnerIds,[]);
 identity={email:input.email};
 await clinics.updateClinicMember(id,{id:member.id,status:'active',coverageIds:[orlando.id]});
 assert.equal((await clinics.clinicWorkspace(id)).members.filter(m=>m.role==='nurse').length,1);
 const quote=await booking.clinicBookingContext(id,'fixture-calendar',orlando);
 assert.equal(quote.price,239);assert.deepEqual(quote.partnerIds,[member.partner_profile_id]);
 assert.equal((await booking.clinicBookingContext(id,'fixture-calendar',orange)).price,229);
 assert.deepEqual((await booking.clinicBookingContext(id,'fixture-calendar',ca)).partnerIds,[]);
 assert.equal((await query('select count(*)::int as n from app.partner_service_assignments')).rows[0].n,1);
 const id2=await clinics.registerClinic({...input,name:'Second Fixture',slug:'fixture-two'});
 await query("update app.clinics set status='approved' where id=$1",[id2]);
 const invitation2=await clinics.inviteClinicMember(id2,{email:'nurse@example.invalid',role:'nurse'});
 identity={email:'nurse@example.invalid',partnerId:member.partner_profile_id};
 await clinics.acceptClinicInvite({token:new URL(invitation2).hash.slice(1),fullName:'Existing Nurse',email:identity.email});
 assert.equal((await query('select count(*)::int as n from app.partner_profiles')).rows[0].n,1,'Existing nurse must never be duplicated');
 assert.equal((await query('select count(distinct partner_profile_id)::int as n from app.clinic_memberships where role=\'nurse\'')).rows[0].n,1);
 await assert.rejects(()=>clinics.clinicWorkspace(id),/denied/);
 identity={email:input.email};
 await query("insert into app.appointments(clinic_id,partner_profile_id,status,starts_at) values($1,$2,'confirmed',now())",[id,member.partner_profile_id]);
 await assert.rejects(()=>clinics.updateClinicMember(id,{id:member.id,status:'removed',coverageIds:[]}),/pending/);
 memo.clear();queryCount=0;
 await booking.publicClinicServices(id);await booking.publicClinicServices(id);
 assert.equal(queryCount,1,'Public cache should reuse the catalog');
 const team=await booking.publicClinicTeam(id);assert.equal(team.length,1);
 await query("update app.clinics set status='suspended' where id=$1",[id]);
 await assert.rejects(()=>booking.clinicBookingContext(id,'fixture-calendar',orlando),/not accepting/);
 const client=await pool.connect();try {await client.query('begin');assert.deepEqual(await booking.clinicReassignmentPartners(id,service,orlando,client),[]);await client.query('rollback');}finally{client.release();}
 assert.equal(policy.resolveClinicPrice(219,[{region:fl,price:225}],{price:null,regionalPrices:[]},orlando).price,225);
 assert.equal(policy.resolveClinicPrice(219,[{region:orlando,price:300}],{price:229,regionalPrices:[{region:fl,price:235},{region:orange,price:240},{region:orlando,price:245}]},orlando).price,245);
 assert.equal(policy.clinicNurseCovers([orange],[orlando],ca),false);
 // The clinic balance must not appear as the nurse's personal revenue.
 Object.assign(mocks,{
  '@/lib/bookingEngineSchema':{ensureBookingEngineSchema:async()=>{}},
  '@/lib/partnerAppointmentNotifications':{},'@/lib/customerAppointmentNotifications':{},
  '@/lib/stripeCheckout':{},'@/lib/appointmentCreatedWebhook':{},'@/lib/stripePaymentLifecycle':{},
 });
 await query(`create table app.appointment_events(appointment_id uuid,actor_type text,actor_id text,event_type text);
 alter table app.appointments add column ends_at timestamptz default now(),add column timezone text default 'America/New_York',add column address_line_1 text default '',add column address_line_2 text default '',add column county text default '',add column city text default '',add column state text default '',add column postal_code text default '';
 alter table app.services add column image_alt text;`);
 const customer='10000000-0000-4000-8000-000000000003';
 await query("insert into app.booking_customers values($1,'Fixture Patient','patient@example.invalid','+15555550124')",[customer]);
 await query("alter table app.appointments add column service_id uuid");
 await query("update app.appointments set status='completed',service_id=$1,customer_id=$2,service_price=219,deposit_amount=88,metadata=$3",[service,customer,JSON.stringify({clinic:{name:'Fixture Clinic',balanceCollector:'clinic'}})]);
 const appointments=load('src/lib/partnerAppointments.ts');
 assert.equal((await appointments.getPartnerPortalDashboard(member.partner_profile_id)).completedRevenue,0);
 const listed=await appointments.listPartnerPortalAppointments(member.partner_profile_id);
 assert.equal(listed[0].clinicCollects,true);assert.equal(listed[0].partnerEarnings,0);assert.equal(listed[0].amountDueAtVisit,131);
 await query("update app.appointments set metadata=$1",[JSON.stringify({clinic:{balanceCollector:'clinic'},client_reward:{platformFunded:true,platformFundedPartnerAmount:131}})]);
 assert.equal((await appointments.getPartnerPortalDashboard(member.partner_profile_id)).completedRevenue,131,'Keep reward exception');
 const reward=await appointments.listPartnerPortalAppointments(member.partner_profile_id);
 assert.equal(reward[0].clinicCollects,false);assert.equal(reward[0].amountDueAtVisit,0);

 const auth=load('src/lib/clinicAuth.ts');
 await query("create table app.account_password_reset_tokens(account_kind text,account_id uuid,token_hash text,expires_at timestamptz,consumed_at timestamptz)");
 const account=(await query('select id from app.clinic_accounts where email=$1',[input.email])).rows[0].id;
 await query("insert into app.account_password_reset_tokens values('partner',$1,'local-reset-fixture',now()+interval '1 hour',null)",[account]);
 await query("insert into app.clinic_sessions(token_hash,account_id,expires_at) values('old-session-fixture',$1,now()+interval '1 hour')",[account]);
 const resetClient=await pool.connect();try{
  await resetClient.query('begin');
  assert.equal(await auth.resetClinicAccountPassword(resetClient,'local-reset-fixture','synthetic-new-password-hash'),account);
  await resetClient.query('commit');
  assert.equal((await query('select count(*)::int as n from app.clinic_sessions where account_id=$1',[account])).rows[0].n,0);
  await resetClient.query('begin');assert.equal(await auth.resetClinicAccountPassword(resetClient,'local-reset-fixture','replayed'),null);await resetClient.query('rollback');
 }finally{resetClient.release();}
 console.log('PASS: additive migration, approval gates, cross-clinic access, invitation ownership/replay, nurse identity reuse, authorization, coverage, clinic pricing, cache reuse, suspended-clinic booking and reassignment. Local synthetic data only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());

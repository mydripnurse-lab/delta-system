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
 '@/lib/publicStaffProvisioning':{ensureStaffSchema:async()=>{}},
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
mocks['@/lib/regionalPricingCatalog']={loadSelectablePricingRegions:async()=>({regions:[fl,orange,orlando,ca],syncedAt:'',warnings:[]})};
process.env.CLINIC_PARTNERS_ENABLED='true';
process.env.CLINIC_BOOKINGS_ENABLED='true';
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
 await pool.query("alter table app.staff_applications add constraint fixture_application_status check (status in ('under_review','submitted','completed'))");
 await pool.query('insert into app.organizations values($1)',[org]);
 await pool.query("insert into app.services(id,organization_id,slug,name,price) values($1,$2,'alleviate','Alleviate',219)",[service,org]);
 await pool.query("insert into app.service_calendars(service_id,public_key,status) values($1,'fixture-calendar','active')",[service]);
 const input={affiliatePolicyAccepted:true,affiliatePolicyVersion:'external-only-v1',name:'Fixture Clinic',slug:'fixture-clinic',fullName:'Fixture Owner',email:'owner@example.invalid',password:'FixtureOnly2026!',contactEmail:'clinic@example.invalid',contactPhone:'',description:'Local fixture clinic'};
 const beforeDecline=(await query('select count(*)::int n from app.clinic_accounts')).rows[0].n;
 await assert.rejects(()=>clinics.registerClinic({...input,affiliatePolicyAccepted:false}),/Accept the clinic affiliate policy/);
 await assert.rejects(()=>clinics.registerClinic({...input,affiliatePolicyAccepted:undefined}),/Accept the clinic affiliate policy/);
 await assert.rejects(()=>clinics.registerClinic({...input,affiliatePolicyVersion:'old-version'}));
 assert.equal((await query('select count(*)::int n from app.clinic_accounts')).rows[0].n,beforeDecline,'Declining or missing policy cannot create an account');
 const id=await clinics.registerClinic(input);
 assert.equal((await query("select count(*)::int n from app.clinic_audit where clinic_id=$1 and action='affiliate_policy_accepted' and subject_id='external-only-v1'",[id])).rows[0].n,1,'Store versioned acceptance in the registration transaction');
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
 const workspace = await clinics.clinicWorkspace(id);
 assert.equal(workspace.members.filter(m=>m.role==='nurse').length,1);
 const nurseRow=workspace.members.find(m=>m.role==='nurse');
 assert.equal(nurseRow.publicationReady,true,'Clinic authorization publishes the consented professional');
 assert.match(nurseRow.profileSlug,/^fixture-nurse-/);
 const profiles=load('src/lib/partnerProfiles.ts');
 let publicNurse=await profiles.getPublicPartnerProfile(nurseRow.profileSlug);
 assert.equal(publicNurse.id,member.partner_profile_id);
 assert.equal(publicNurse.clinicManaged,true);
 assert.equal(publicNurse.clinics[0].id,id);
 assert.deepEqual(publicNurse.serviceAreas.map(a=>a.city),['Orlando']);
 assert.equal((await profiles.listPublicPartnerProfiles()).length,1);
 const reads=queryCount;
 await profiles.getPublicPartnerProfile(nurseRow.profileSlug);
 assert.equal(queryCount-reads,1,'Affiliations stay cached; no extra Neon call for each profile render');
 await clinics.updateClinicMember(id,{id:member.id,status:'suspended',coverageIds:[orlando.id]});
 assert.equal(await profiles.getPublicPartnerProfile(nurseRow.profileSlug),null,'Suspended clinic nurses cannot remain publicly bookable');
 assert.equal((await profiles.listPublicPartnerProfiles()).length,0);
 await clinics.updateClinicMember(id,{id:member.id,status:'active',coverageIds:[orlando.id]});
 await query('update app.partner_profiles set profile_consent_at=null where id=$1',[member.partner_profile_id]);
 assert.equal(await profiles.getPublicPartnerProfile(nurseRow.profileSlug),null,'Consent is required');
 await query('update app.partner_profiles set profile_consent_at=now() where id=$1',[member.partner_profile_id]);
 process.env.CLINIC_PARTNERS_ENABLED='false';
 assert.equal(await profiles.getPublicPartnerProfile(nurseRow.profileSlug),null,'Rollout switch also gates clinic-only sites');
 process.env.CLINIC_PARTNERS_ENABLED='true';
 process.env.CLINIC_BOOKINGS_ENABLED='false';
 const gatedReads=queryCount;
 await assert.rejects(()=>booking.clinicBookingContext(id,'fixture-calendar',orlando),/not open yet/);
 assert.equal(queryCount,gatedReads,'Closed clinic checkout does not query the database');
 process.env.CLINIC_BOOKINGS_ENABLED='true';
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
 assert.equal(await profiles.getPublicPartnerProfile(nurseRow.profileSlug),null,'Suspended clinics cannot leave clinic-only profiles exposed');
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
 // Existing professionals can add a clinic without losing their identity or records.
 identity={email:'nurse@example.invalid',partnerId:member.partner_profile_id};
 const beforeProfile=(await query('select * from app.partner_profiles where id=$1',[member.partner_profile_id])).rows[0];
 const beforeAppointments=(await query('select count(*)::int as n from app.appointments where partner_profile_id=$1',[member.partner_profile_id])).rows[0].n;
 const owned=await clinics.registerClinic({...input,name:'Nurse Owned Clinic',slug:'nurse-owned-clinic',email:'ignored@example.invalid'});
 assert.equal((await query("select partner_profile_id from app.clinic_memberships where clinic_id=$1 and role='owner'",[owned])).rows[0].partner_profile_id,member.partner_profile_id);
 assert.deepEqual((await query('select * from app.partner_profiles where id=$1',[member.partner_profile_id])).rows[0],beforeProfile);
 assert.equal((await query('select count(*)::int as n from app.appointments where partner_profile_id=$1',[member.partner_profile_id])).rows[0].n,beforeAppointments);
 assert.equal((await query('select count(*)::int as n from app.clinic_accounts where email=$1',[identity.email])).rows[0].n,0,'Do not create another login for an existing nurse');

 // Clinic affiliate accounting: new external partners only, no real payouts.
 await query(`alter table app.staff_applications add column referred_by_profile_id uuid;
 alter table app.appointments add column organization_id uuid;
 create table app.staff_form_configs(organization_id uuid primary key,affiliate_commission_rate numeric);
 create table app.partner_affiliate_commissions(appointment_id uuid primary key);
 create table app.appointment_payments(appointment_id uuid primary key,status text);`);
 await query(fs.readFileSync(path.join(root,'db/migrations/049_clinic_affiliates.sql'),'utf8'));
 await query(fs.readFileSync(path.join(root,'db/migrations/049_clinic_affiliates.sql'),'utf8'));
 await query("update app.clinics set status='approved' where id=$1",[id]);
 await query('insert into app.staff_form_configs values($1,2)',[org]);
 const affiliates=load('src/lib/clinicAffiliate.ts');
 const externalEmail='external@example.invalid';
 assert.equal(await affiliates.resolveClinicReferral('clinic:fixture-clinic',org,externalEmail),id);
 assert.equal(await affiliates.resolveClinicReferral('clinic:fixture-clinic',org,'nurse@example.invalid'),null,'Team nurses cannot be referred');
 assert.equal(await affiliates.resolveClinicReferral('clinic:fixture-clinic',org,input.email),null,'Owner cannot self-refer');
 assert.equal(await affiliates.resolveClinicReferral('clinic:fixture-clinic','20000000-0000-4000-8000-000000000001',externalEmail),null,'Tenant isolation');
 await assert.rejects(()=>affiliates.resolveClinicReferral('clinic:../bad',org,externalEmail),/Invalid/);
 const externalApp=(await query("insert into app.staff_applications(organization_id,email,status,request_payload) values($1,$2,'completed',$3) returning id",[org,externalEmail,JSON.stringify({clinicReferralId:id})])).rows[0].id;
 const external=(await query("insert into app.partner_profiles(organization_id,application_id,ghl_user_id,email,slug,display_name,website_status) values($1,$2,'',$3,'external-fixture','External Partner','published') returning id",[org,externalApp,externalEmail])).rows[0].id;
 assert.equal(await affiliates.resolveClinicReferral('clinic:fixture-clinic',org,externalEmail),null,'Existing attribution cannot be overwritten');
 async function appointment(patch={}) {
  return (await query("insert into app.appointments(organization_id,partner_profile_id,service_id,service_price,currency,status,public_reference,metadata,clinic_id) values($1,$2,$3,$4,'USD',$5,'SYNTHETIC-REF',$6,$7) returning id",[org,external,service,patch.price??229,patch.status||'confirmed',JSON.stringify(patch.metadata||{}),patch.clinicId||null])).rows[0].id;
 }
 const referralAppointment=await appointment();
 assert(await affiliates.recordClinicAffiliateCommission(referralAppointment));
 assert.equal(await affiliates.recordClinicAffiliateCommission(referralAppointment),null,'Repeated payment events cannot duplicate commission');
 assert.equal((await query('select amount::text from app.clinic_affiliate_commissions where appointment_id=$1',[referralAppointment])).rows[0].amount,'4.58');
 const simultaneous=await appointment();
 assert.equal((await Promise.all([affiliates.recordClinicAffiliateCommission(simultaneous),affiliates.recordClinicAffiliateCommission(simultaneous)])).filter(Boolean).length,1);
 const ownClinic=await appointment({clinicId:id});
 assert.equal(await affiliates.recordClinicAffiliateCommission(ownClinic),null,'Own-clinic visits are not external referrals');
 const unpaid=await appointment({status:'payment_pending'});
 assert.equal(await affiliates.recordClinicAffiliateCommission(unpaid),null);
 const rewardVisit=await appointment({metadata:{client_reward:{platformFunded:true}}});
 assert.equal(await affiliates.recordClinicAffiliateCommission(rewardVisit),null,'Do not pay referral commission for a platform-funded reward');
 await query("insert into app.clinic_memberships(clinic_id,email,partner_profile_id,role,status) values($1,$2,$3,'nurse','pending')",[id,externalEmail,external]);
 const teamVisit=await appointment();
 assert.equal(await affiliates.recordClinicAffiliateCommission(teamVisit),null,'Pending or active own team cannot generate commission');
 await query("update app.clinic_memberships set status='removed' where clinic_id=$1 and email=$2",[id,externalEmail]);
 await query('update app.staff_applications set referred_by_profile_id=$2 where id=$1',[externalApp,member.partner_profile_id]);
 assert.equal(await affiliates.recordClinicAffiliateCommission(teamVisit),null,'Original partner referrer always retains attribution');
 await query('update app.staff_applications set referred_by_profile_id=null where id=$1',[externalApp]);
 await query('insert into app.partner_affiliate_commissions values($1)',[teamVisit]);
 assert.equal(await affiliates.recordClinicAffiliateCommission(teamVisit),null,'Do not duplicate an existing legacy commission');
 await query('update app.clinics set affiliate_commission_rate=0 where id=$1',[id]);
 const zeroVisit=await appointment();
 await affiliates.recordClinicAffiliateCommission(zeroVisit);
 assert.equal((await query('select amount::text from app.clinic_affiliate_commissions where appointment_id=$1',[zeroVisit])).rows[0].amount,'0.00','Zero percent must not fall back to 2%');
 await query("update app.appointments set status='cancelled' where id=$1",[simultaneous]);
 identity={email:input.email};memo.clear();
 let dashboard=await affiliates.getClinicAffiliateDashboard(id);
 assert.equal(dashboard.metrics[0].earned,'4.58');
 assert.equal(dashboard.commissions.find(c=>c.reference==='SYNTHETIC-REF'&&c.status==='void').status,'void');
 assert.equal(dashboard.partners.length,1);
 const readBudget=queryCount;
 await affiliates.getClinicAffiliateDashboard(id);
 assert.equal(queryCount-readBudget,1,'Repeat dashboard only checks access; financial data stays cached');
 await query("insert into app.appointment_payments values($1,'partially_refunded')",[referralAppointment]);memo.clear();
 dashboard=await affiliates.getClinicAffiliateDashboard(id);
 assert.equal(dashboard.metrics[0].pending,'0.00','Refunded visits must not inflate pending earnings');
 identity={email:'nurse@example.invalid',partnerId:member.partner_profile_id};
 await assert.rejects(()=>affiliates.getClinicAffiliateDashboard(id),/denied/);
 await query("insert into app.clinic_memberships(clinic_id,email,role,status) values($1,'manager@example.invalid','manager','active')",[id]);
 identity={email:'manager@example.invalid'};
 await assert.rejects(()=>affiliates.getClinicAffiliateDashboard(id),/Only the clinic owner/);
 // A nurse becoming a clinic owner must not keep earning personal affiliate
 // commissions from accepted members of their own team. Existing ledger stays intact.
 await query(`alter table app.partner_profiles add column if not exists affiliate_commission_rate numeric;
 alter table app.partner_affiliate_commissions add column id uuid default gen_random_uuid(), add column referrer_profile_id uuid, add column referred_profile_id uuid, add column service_id uuid, add column amount numeric, add column rate numeric, add column currency text, add column status text, add column metadata jsonb;`);
 await query('update app.staff_applications set referred_by_profile_id=$2 where id=$1',[externalApp,member.partner_profile_id]);
 const legacy=load('src/lib/partnerAffiliate.ts');
 const historical=await appointment();
 assert(await legacy.recordPartnerAffiliateCommission(historical),'External referral earns before joining owner team');
 const historicalRow=(await query('select * from app.partner_affiliate_commissions where appointment_id=$1',[historical])).rows[0];
 await query("insert into app.clinic_memberships(clinic_id,email,partner_profile_id,role,status) values($1,$2,$3,'nurse','invited')",[owned,externalEmail,external]);
 const notAccepted=await appointment();
 assert(await legacy.recordPartnerAffiliateCommission(notAccepted),'An unaccepted invitation alone must not remove earnings');
 await query("update app.clinic_memberships set status='pending',accepted_at=now() where clinic_id=$1 and email=$2",[owned,externalEmail]);
 const ownTeamVisit=await appointment();
 assert.equal(await legacy.recordPartnerAffiliateCommission(ownTeamVisit),null,'Old personal referral cannot bypass own-team exclusion');
 assert.equal((await query('select count(*)::int n from app.partner_affiliate_commissions where appointment_id=$1',[ownTeamVisit])).rows[0].n,0);
 assert.deepEqual((await query('select * from app.partner_affiliate_commissions where appointment_id=$1',[historical])).rows[0],historicalRow,'Already earned commissions are unchanged');
 assert.equal((await query('select referred_by_profile_id from app.staff_applications where id=$1',[externalApp])).rows[0].referred_by_profile_id,member.partner_profile_id,'Preserve attribution and history');
 await query("update app.clinic_memberships set status='removed' where clinic_id=$1 and email=$2",[owned,externalEmail]);
 assert(await legacy.recordPartnerAffiliateCommission(await appointment()),'External referral may earn again after leaving own team');
 process.env.CLINIC_PARTNERS_ENABLED='false';
 const offReads=queryCount;assert.equal(await affiliates.recordClinicAffiliateCommission(teamVisit),null);assert.equal(queryCount,offReads,'Disabled clinic rollout adds no DB requests');
 process.env.CLINIC_PARTNERS_ENABLED='true';
 console.log('PASS: clinic lifecycle, required versioned policy acceptance, existing nurse-to-owner identity preservation, personal own-team commission exclusion, preserved historical earnings, external referrals, own-team/self exclusion, idempotent commissions, legacy attribution, refunds, owner-only access and shared-cache checks. Local synthetic data only; no payments or production writes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());

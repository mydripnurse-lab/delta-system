// Run after test-clinic-partners.cjs. Synthetic data in the dedicated local DB only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
const url=new URL(process.env.CLINIC_TEST_DATABASE_URL||'postgresql://axel@127.0.0.1:55487/mdn_clinic_test');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/mdn_clinic_test')throw Error('Local isolated database required');
const db=new Pool({connectionString:url.toString(),max:6}),root=path.join(__dirname,'..'),modules=new Map();
let email='owner@example.invalid';
const mocks={'server-only':{},'next/server':{NextResponse:Response,after:()=>{}},'react':{cache:f=>f},'next/headers':{cookies:async()=>({get:()=>undefined})},'@/lib/db':{getDbPool:()=>db},'@/lib/bookingEngineSchema':{ensureBookingEngineSchema:async()=>{}},'@/lib/partnerPortalAuth':{getPartnerPortalSession:async()=>email?{email,display_name:'Fixture owner',profile_id:''}:null}};
function load(relative){if(modules.has(relative))return modules.get(relative).exports;const m={exports:{}};modules.set(relative,m);
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n in mocks?mocks[n]:n.startsWith('@/')?load('src/'+n.slice(2)+'.ts'):require(n),m,m.exports);return m.exports;}
process.env.CLINIC_PARTNERS_ENABLED='true';process.env.CLINIC_COMMUNICATIONS_ENABLED='false';
let sends=0;global.fetch=async()=>{sends++;throw Error('External request forbidden in this test');};
const migration=name=>fs.readFileSync(path.join(root,'db/migrations',name),'utf8');
(async()=>{
 await db.query(`alter table app.appointments add column if not exists ends_at timestamptz,add column if not exists updated_at timestamptz default now(),add column if not exists timezone text default 'America/New_York',add column if not exists address_line_1 text default '1 Test St',add column if not exists address_line_2 text default '',add column if not exists city text default 'Orlando',add column if not exists county text default 'Orange',add column if not exists state text default 'Florida',add column if not exists postal_code text default '32801',add column if not exists hold_expires_at timestamptz,add column if not exists partner_decline_reason text default '',add column if not exists declined_at timestamptz;
 alter table app.appointment_events add column if not exists id uuid default gen_random_uuid(),add column if not exists payload jsonb default '{}';
 drop table if exists app.partner_availability_rules;
 drop table if exists app.partner_availability_exceptions;`);
 const foundation=migration('042_mdn_booking_foundation.sql');
 for(const name of ['partner_availability_rules','partner_availability_exceptions']){const start=foundation.indexOf(`create table if not exists app.${name} (`);await db.query(foundation.slice(start,foundation.indexOf('\n);',start)+4));}
 const schema=fs.readFileSync(path.join(root,'src/lib/bookingEngineSchema.ts'),'utf8');const begin=schema.indexOf('create table if not exists app.partner_portal_notifications (');await db.query(schema.slice(begin,schema.indexOf('\n      );',begin)+9));
 await db.query(migration('052_clinic_communications.sql'));await db.query(migration('055_clinic_appointment_workspace.sql'));await db.query(migration('055_clinic_appointment_workspace.sql'));
 const org='10000000-0000-4000-8000-000000000001',service='10000000-0000-4000-8000-000000000002';
 const fl=[{id:'state:florida',level:'state',state:'Florida',county:'',city:'',label:'Florida',urls:[]}];
 const clinic=randomUUID(),other=randomUUID();
 for(const [id,slug] of [[clinic,'calendar-fixture'],[other,'calendar-other']]){await db.query("insert into app.clinics(id,organization_id,slug,name,status,coverage,contact_email) values($1,$2,$3,$3,'approved',$4,$5)",[id,org,slug,JSON.stringify(fl),email]);await db.query("insert into app.clinic_memberships(clinic_id,email,role,status,accepted_at) values($1,$2,'owner','active',now())",[id,id===clinic?email:'other-owner@example.invalid']);await db.query("insert into app.clinic_service_prices(clinic_id,service_id,enabled) values($1,$2,true)",[id,service]);}
 const nurses=[];
 for(let n=0;n<55;n++){const app=randomUUID(),id=randomUUID(),mail=`calendar-nurse-${n}@example.invalid`;await db.query("insert into app.staff_applications(id,organization_id,email,status,phone) values($1,$2,$3,'completed','+15555550000')",[app,org,mail]);await db.query("insert into app.partner_profiles(id,organization_id,application_id,email,slug,display_name) values($1,$2,$3,$4,$5,$6)",[id,org,app,mail,`calendar-nurse-${n}`,`Nurse ${String(n).padStart(2,'0')}`]);await db.query("insert into app.clinic_memberships(clinic_id,email,role,status,partner_profile_id,accepted_at,authorized_at,coverage) values($1,$2,'nurse','active',$3,now(),now(),$4)",[clinic,mail,id,JSON.stringify(fl)]);await db.query('insert into app.partner_service_assignments(organization_id,partner_profile_id,service_id) values($1,$2,$3)',[org,id,service]);nurses.push(id);}
 const start=new Date(Date.now()+86400000*4);start.setUTCHours(14,0,0,0);const end=new Date(+start+3600000);
 for(const id of nurses)await db.query("insert into app.partner_availability_exceptions(partner_profile_id,starts_at,ends_at,kind) values($1,$2,$3,'available')",[id,new Date(+start-86400000),new Date(+end+86400000*20)]);
 const customer=randomUUID();await db.query("insert into app.booking_customers(id,full_name,email,phone) values($1,'Test Client','client@example.invalid','+15555551111')",[customer]);
 async function visit(nurse=nurses[0],at=start,clinicId=clinic,status='confirmed'){const id=randomUUID();await db.query(`insert into app.appointments(id,public_reference,clinic_id,service_id,customer_id,partner_profile_id,status,starts_at,ends_at,service_price,deposit_amount,state,county,city,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,229,91.6,'Florida','Orange','Orlando','{"keep":"unchanged"}')`,[id,`TEST-${id.slice(0,6)}`,clinicId,service,customer,nurse,status,at,new Date(+at+3600000)]);await db.query("insert into app.appointment_payments(appointment_id,status,amount) values($1,'paid',91.6)",[id]);return id;}
 const a=await visit(),foreign=await visit(nurses[0],start,other);
 const ops=load('src/lib/clinicAppointments.ts'),inbox=load('src/lib/clinicPortalNotifications.ts');
 await assert.rejects(()=>ops.clinicVisit(clinic,foreign),/not found/);
 email='other-owner@example.invalid';await assert.rejects(()=>ops.clinicVisit(clinic,a),/denied/);email='owner@example.invalid';
 await db.query("update app.clinics set status='pending' where id=$1",[clinic]);await assert.rejects(()=>ops.clinicVisit(clinic,a),/approved/);await db.query("update app.clinics set status='approved' where id=$1",[clinic]);
 let first=await ops.clinicCalendarStaff(clinic,'');assert.equal(first.items.length,50);assert(first.next);const tail=await ops.clinicCalendarStaff(clinic,'',first.next);assert.equal(tail.items.length,5);assert.equal(new Set([...first.items,...tail.items].map(x=>x.id)).size,55);
 assert.equal((await ops.clinicCalendarStaff(clinic,'Nurse 54')).items.length,1);
 let snap=await ops.clinicVisit(clinic,a);assert.equal(snap.price,'229');
 await db.query("insert into app.appointment_events(appointment_id,event_type,actor_type) values($1,'appointment_confirmed','system')",[a]);
 const feed=await inbox.clinicNotificationFeed(clinic);assert(feed.items.some(x=>x.appointmentId===a));assert(!feed.items.some(x=>x.appointmentId===foreign));
 await inbox.readClinicNotifications(clinic,feed.items.map(x=>x.id));assert.equal((await inbox.clinicNotificationFeed(clinic)).unread,0);
 await db.query("insert into app.clinic_memberships(clinic_id,email,role,status,accepted_at) values($1,'manager@example.invalid','manager','active',now())",[clinic]);email='manager@example.invalid';assert((await inbox.clinicNotificationFeed(clinic)).unread>0,'Read state belongs to each manager');email='owner@example.invalid';
 await db.query("insert into app.partner_availability_exceptions(partner_profile_id,starts_at,ends_at,kind) values($1,$2,$3,'unavailable')",[nurses[1],start,end]);
 assert.equal((await ops.clinicReassignmentCandidates(clinic,a,'Nurse 01')).items.length,0,'Unavailable exceptions override availability');
 await db.query("delete from app.partner_availability_exceptions where partner_profile_id=$1 and kind='unavailable'",[nurses[1]]);
 let candidate=await ops.clinicReassignmentCandidates(clinic,a,'Nurse 01');assert.equal(candidate.items[0].id,nurses[1]);
 await db.query("update app.clinic_memberships set service_ids='{}' where clinic_id=$1 and partner_profile_id=$2",[clinic,nurses[1]]);
 assert.equal((await ops.clinicReassignmentCandidates(clinic,a,'Nurse 01')).items.length,0,'Clinic service selection excludes otherwise available nurses');
 await assert.rejects(()=>ops.reassignClinicAppointment(clinic,{appointmentId:a,nurseId:nurses[1],version:snap.version,reason:'Unassigned service'}),/eligible/);
 await db.query('update app.clinic_memberships set service_ids=$3::uuid[] where clinic_id=$1 and partner_profile_id=$2',[clinic,nurses[1],[service]]);

 await db.query("update app.clinic_memberships set status='suspended' where clinic_id=$1 and partner_profile_id=$2",[clinic,nurses[1]]);await assert.rejects(()=>ops.reassignClinicAppointment(clinic,{appointmentId:a,nurseId:nurses[1],version:snap.version,reason:'Staff change'}),/eligible/);await db.query("update app.clinic_memberships set status='active' where clinic_id=$1 and partner_profile_id=$2",[clinic,nurses[1]]);
 const conflict=await visit(nurses[1],start,other);await assert.rejects(()=>ops.reassignClinicAppointment(clinic,{appointmentId:a,nurseId:nurses[1],version:snap.version,reason:'Staff change'}),/eligible/);await db.query("update app.appointments set status='cancelled' where id=$1",[conflict]);
 await db.query("update app.clinic_memberships set coverage='[]' where clinic_id=$1 and partner_profile_id=$2",[clinic,nurses[1]]);assert.equal((await ops.clinicReassignmentCandidates(clinic,a,'Nurse 01')).items.length,0);await db.query('update app.clinic_memberships set coverage=$3 where clinic_id=$1 and partner_profile_id=$2',[clinic,nurses[1],JSON.stringify(fl)]);
 const before=(await db.query('select service_price,deposit_amount,metadata,currency from app.appointments where id=$1',[a])).rows[0],paymentBefore=(await db.query('select * from app.appointment_payments where appointment_id=$1',[a])).rows[0];
 await ops.reassignClinicAppointment(clinic,{appointmentId:a,nurseId:nurses[1],version:snap.version,reason:'Coverage adjustment'});
 let after=(await db.query('select * from app.appointments where id=$1',[a])).rows[0];assert.equal(after.partner_profile_id,nurses[1]);assert.equal(after.status,'confirmed');for(const key of ['service_price','deposit_amount','currency'])assert.equal(after[key],before[key]);assert.equal(after.metadata.keep,'unchanged');assert.deepEqual((await db.query('select * from app.appointment_payments where appointment_id=$1',[a])).rows[0],paymentBefore);
 await assert.rejects(()=>ops.reassignClinicAppointment(clinic,{appointmentId:a,nurseId:nurses[2],version:snap.version,reason:'Stale browser'}),/changed/);
 const notices=(await db.query('select partner_profile_id,event_type from app.partner_portal_notifications where appointment_id=$1',[a])).rows;assert.equal(notices.length,2);assert(notices.some(n=>n.partner_profile_id===nurses[1]&&n.event_type==='appointment_reassigned'));assert(notices.some(n=>n.partner_profile_id===nurses[0]&&n.event_type==='appointment_assignment_removed'));
 const nurseInbox=load('src/lib/partnerPortalNotifications.ts');
 const beforeInbox=(await db.query('select count(*)::int n from app.partner_portal_notifications where appointment_id=$1',[a])).rows[0].n;
 await nurseInbox.listPartnerPortalNotifications(nurses[1]);
 await db.query('update app.partner_portal_notifications set read_at=now() where appointment_id=$1 and partner_profile_id=$2',[a,nurses[1]]);
 await nurseInbox.listPartnerPortalNotifications(nurses[1]);
 assert.equal((await db.query('select count(*)::int n from app.partner_portal_notifications where appointment_id=$1',[a])).rows[0].n,beforeInbox,'Opening or reading the offer must not backfill a duplicate legacy notification');
 const formerInbox=await nurseInbox.listPartnerPortalNotifications(nurses[0]);assert(formerInbox.every(n=>n.appointmentId!==a),'Former nurse cannot see live details of reassigned appointments');
 const queued=(await db.query("select payload,event_type from app.clinic_communication_events where payload->>'appointmentId'=$1",[a])).rows;assert.equal(queued.length,2);assert(queued.every(e=>e.payload.externalDeliveryPending));assert.equal(queued.find(e=>e.event_type==='clinic_assignment_removed').payload.nurse.email,'calendar-nurse-0@example.invalid');
 const comm=load('src/lib/clinicCommunications.ts');await comm.deliverClinicCommunications(clinic);assert.equal(sends,0,'Manual events remain held even if a dispatcher is invoked');
 // Overlapping concurrent reassignment requests must never double-book the same nurse.
 const b=await visit(nurses[2]),c=await visit(nurses[3]);const sb=await ops.clinicVisit(clinic,b),sc=await ops.clinicVisit(clinic,c);
 const concurrent=await Promise.allSettled([ops.reassignClinicAppointment(clinic,{appointmentId:b,nurseId:nurses[4],version:sb.version,reason:'Concurrent staff change'}),ops.reassignClinicAppointment(clinic,{appointmentId:c,nurseId:nurses[4],version:sc.version,reason:'Concurrent staff change'})]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);assert.equal((await db.query("select count(*)::int n from app.appointments where partner_profile_id=$1 and status='confirmed'",[nurses[4]])).rows[0].n,1);
 await db.query("update app.appointments set status='in_progress' where id=$1",[a]);await assert.rejects(()=>ops.clinicReassignmentCandidates(clinic,a,''),/upcoming/);
 // Notification triggers include direct status/time changes and declines; metadata-only updates do not create noise.
 const count=async()=>Number((await db.query('select count(*) n from app.clinic_portal_notifications where appointment_id=$1',[a])).rows[0].n);
 const n=await count();await db.query("update app.appointments set metadata=metadata||'{\"irrelevant\":true}' where id=$1",[a]);assert.equal(await count(),n);await db.query("insert into app.appointment_events(appointment_id,event_type,actor_type) values($1,'partner_declined','partner')",[a]);assert.equal(await count(),n+1);
 // Paginate tied starts without dropping or duplicating visits.
 for(let i=0;i<105;i++)await visit(nurses[5],new Date(+start+86400000),clinic,'completed');
 const range={from:new Date(+start-86400000).toISOString(),to:new Date(+start+3*86400000).toISOString()};const page=await ops.clinicCalendar(clinic,range);assert.equal(page.items.length,100);assert(page.next);const page2=await ops.clinicCalendar(clinic,{...range,cursorTime:new Date(page.next.time).toISOString(),cursorId:page.next.id});assert.equal(new Set([...page.items,...page2.items].map(x=>x.id)).size,108);assert(page.items.every(x=>x.id!==foreign));
 const route=load('src/app/api/clinics/appointments/route.ts');const base='http://localhost/api/clinics/appointments';
 assert.equal((await route.GET(new Request(`${base}?clinicId=${clinic}&from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z`))).status,400);
 assert.equal((await route.POST(new Request(base,{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:JSON.stringify({clinicId:clinic,appointmentId:a,nurseId:nurses[1],version:snap.version,reason:'Invalid origin'})}))).status,403);
 console.log('PASS: clinic/staff isolation, approval gating, paged large roster and calendar, private read state, coverage/availability/conflict checks, stale requests, concurrent assignment, unchanged payments/prices, internal alerts, held role-separated webhooks, date limits and CSRF. No external requests.');
 fs.writeFileSync('/tmp/mdn-clinic-calendar-fixture.json',JSON.stringify({clinicId:clinic,appointmentId:a,email,from:start.toISOString()}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.end());

// Local PostgreSQL only; every external webhook is mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {Pool}=require('pg');
const url=new URL(process.env.CLINIC_TEST_DATABASE_URL||'postgresql://axel@127.0.0.1:55487/mdn_clinic_test');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/mdn_clinic_test')throw Error('Local fixture database required');
const db=new Pool({connectionString:url.toString(),max:4});
const root=path.join(__dirname,'..'),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const m={exports:{}};
 const source=fs.readFileSync(path.join(root,'src/lib',name+'.ts'),'utf8');
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n==='server-only'?{}:n==='next/server'?{after:()=>{}}:n==='@/lib/db'?{getDbPool:()=>db}:n==='@/lib/clinicFeature'?{clinicsEnabled:()=>true}:n.startsWith('@/lib/')?load(n.slice(6)):require(n),m,m.exports);modules.set(name,m.exports);return m.exports;}
(async()=>{
 await db.query("create table if not exists app.staff_form_configs(organization_id uuid primary key)");
 const migration=fs.readFileSync(path.join(root,'db/migrations/052_clinic_communications.sql'),'utf8');
 await db.query(migration);await db.query(migration);
 const clinic=(await db.query("select id,organization_id from app.clinics where slug='fixture-clinic'")).rows[0];assert(clinic);
 const routes={clinic:'https://services.leadconnectorhq.com/hooks/fixture',clinic_nurse:'https://services.leadconnectorhq.com/hooks/fixture-nurse',clinic_client:'https://services.leadconnectorhq.com/hooks/fixture-client'};
 await db.query('insert into app.staff_form_configs(organization_id,clinic_communication_routes) values($1,$2) on conflict(organization_id) do update set clinic_communication_routes=excluded.clinic_communication_routes',[clinic.organization_id,JSON.stringify(routes)]);
 const content=load('clinicCommunicationContent'),sender=load('clinicCommunications');
 assert.deepEqual(content.clinicRolesForEvent('clinic_approved'),['clinic']);
 assert.deepEqual(content.clinicRolesForEvent('new_booking'),['clinic','clinic_nurse','clinic_client']);
 assert.deepEqual(content.clinicRolesForEvent('not-real'),[]);
 const html=content.clinicCommunicationContent({event:'new_booking',role:'clinic_nurse',clinicName:'<script>x</script>',serviceImageUrl:'javascript:alert(1)',balance:'$131'});
 assert(!html.emailHtml.includes('<script>'));assert(!html.emailHtml.includes('javascript:'));assert.match(html.collectionInstructions,/clinic collects/);assert.match(html.actionLabel,/Accept or decline/);
 const reward=content.clinicCommunicationContent({event:'new_booking',role:'clinic',clinicName:'Fixture',collectionInstructions:'Funded reward: collect $0 from the client.'});assert.match(reward.collectionInstructions,/collect \$0/);
 const clientNotice=content.clinicCommunicationContent({event:'new_booking',role:'clinic_client',clinicName:'Fixture'});
 assert(!clientNotice.collectionInstructions.includes('nurse payout'));assert.match(clientNotice.collectionInstructions,/Pay the remaining balance directly to the clinic/);
 const fundedClient=content.clinicCommunicationContent({event:'new_booking',role:'clinic_client',clinicName:'Fixture',platformFunded:true});assert.match(fundedClient.collectionInstructions,/owe \$0/);
 const membership=content.clinicCommunicationContent({event:'invitation_accepted',role:'clinic',clinicName:'Fixture',memberName:'Fixture Nurse'});assert.match(membership.message,/Fixture Nurse accepted/);
 const suspended=content.clinicCommunicationContent({event:'clinic_suspended',role:'clinic',clinicName:'Fixture'});assert.match(suspended.message,/does not cancel appointments/);
 const sent=[];let fail=false;
 global.fetch=async(endpoint,options)=>{sent.push(JSON.parse(options.body));return new Response('',{status:fail?503:200});};
 const key='fixture:'+require('node:crypto').randomUUID();
 const input={clinicId:clinic.id,key,event:'new_booking',message:{serviceName:'Fixture service',balance:'$131'},nurse:{name:'Nurse',email:'nurse@example.invalid',phone:'+12025550101'},client:{name:'Client',email:'client@example.invalid',phone:'+12025550102'}};
 await Promise.all([sender.queueClinicAppointment(input),sender.queueClinicAppointment(input)]);
 assert.equal(sent.length,3,'Concurrent duplicate events send each role once');
 assert.equal(new Set(sent.map(x=>x.idempotencyKey)).size,3);
 assert.equal(sent.find(x=>x.recipientRole==='clinic_nurse').email,'nurse@example.invalid');
 assert.equal(sent.find(x=>x.recipientRole==='clinic_client').email,'client@example.invalid');
 await sender.queueClinicAppointment(input);assert.equal(sent.length,3,'No replays of successful sends');
 const dispatched=(await db.query('select dispatched_at from app.clinic_communication_events where event_key=$1',[key])).rows[0];assert(dispatched.dispatched_at);
 fail=true;const failedKey=key+':failed';await sender.queueClinicAppointment({...input,key:failedKey,event:'clinic_approved'});
 assert.equal((await db.query('select dispatched_at from app.clinic_communication_events where event_key=$1',[failedKey])).rows[0].dispatched_at,null,'Failed delivery stays unresolved');
 await sender.queueClinicAppointment({...input,key:failedKey,event:'clinic_approved'});assert.equal(sent.length,4,'Ambiguous failed sends are not automatically retried');
 // Failed historical sends must not starve new events in the bounded drain.
 for(let i=0;i<25;i++) {
   const row=(await db.query(`insert into app.clinic_communication_events(clinic_id,event_key,event_type,created_at) values($1,$2,'clinic_approved',now()-interval '1 day') returning id`,[clinic.id,key+':backlog:'+i])).rows[0];
   await db.query(`insert into app.clinic_communication_deliveries(event_id,role,status,attempts) values($1,'clinic','failed',1)`,[row.id]);
 }
 const freshKey=key+':fresh';
 await db.query(`insert into app.clinic_communication_events(clinic_id,event_key,event_type) values($1,$2,'clinic_approved')`,[clinic.id,freshKey]);
 fail=false;await sender.deliverClinicCommunications(clinic.id);
 assert((await db.query('select dispatched_at from app.clinic_communication_events where event_key=$1',[freshKey])).rows[0].dispatched_at,'Fresh events bypass unresolved historical failures');
 const sendsBeforeMissing=sent.length;
 await sender.queueClinicAppointment({...input,key:key+':missing-phone',event:'partner_confirmation_required',nurse:{name:'Nurse',email:'nurse@example.invalid',phone:''}});
 assert.equal(sent.length,sendsBeforeMissing,'Missing identity fields must not trigger a paid send to a stale GHL contact');
 const priorStart=process.env.CLINIC_COMMUNICATIONS_START_AT;
 process.env.CLINIC_COMMUNICATIONS_START_AT=new Date(Date.now()+60000).toISOString();
 await sender.queueClinicAppointment({...input,key:key+':before-activation',event:'clinic_approved'});
 assert.equal(sent.length,sendsBeforeMissing,'Activation must not replay earlier lifecycle changes');
 if(priorStart===undefined)delete process.env.CLINIC_COMMUNICATIONS_START_AT;else process.env.CLINIC_COMMUNICATIONS_START_AT=priorStart;
 const before=(await db.query('select count(*)::int n from app.clinic_communication_events')).rows[0].n;
 const transaction=await db.connect();await transaction.query('begin');await transaction.query("insert into app.clinic_audit(clinic_id,actor,action) values($1,'fixture','clinic_approved')",[clinic.id]);await transaction.query('rollback');transaction.release();
 assert.equal((await db.query('select count(*)::int n from app.clinic_communication_events')).rows[0].n,before,'Rolled-back state never emits an event');
 console.log('PASS: migration idempotence, atomic audit events, role separation, concurrent deduplication, failed delivery retention, branded HTML escaping and funded reward exception. No real messages sent.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.end());

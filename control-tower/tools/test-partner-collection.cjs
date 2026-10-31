const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..'),ts=require(require.resolve('typescript',{paths:[root,process.env.MDN_TEST_DEPENDENCIES||root]}));
async function check(file,funded,event,clinic=false){
 let sent,reads=0;const reward=funded?{platformFunded:true,platformFundedPartnerAmount:150}:{};
 const row={id:'appt',organization_id:'org',status:'confirmed',starts_at:'2026-11-04T15:00:00Z',ends_at:'2026-11-04T16:00:00Z',timezone:'America/New_York',currency:'USD',service_price:219,deposit_amount:88,amount_due_at_visit:'131',service_name:'IV',partner_id:'partner',partner_email:'nurse@example.invalid',partner_name:'Test Nurse',new_booking_webhook_url:'https://example.invalid/hook',appointment_reassigned_webhook_url:'https://example.invalid/hook',appointment_accepted_webhook_url:'https://example.invalid/hook',webhook_url:'https://example.invalid/hook',appointment_metadata:{client_reward:reward},metadata:{client_reward:reward}};
 if(clinic){row.appointment_metadata.clinic={id:'clinic-test',name:'Test Clinic',balanceCollector:'clinic'};row.metadata.clinic=row.appointment_metadata.clinic;}
 const pool={query:async sql=>{reads++;if(sql.startsWith('insert into app.appointment_webhook_events'))return{rows:[{id:'delivery'}]};if(sql.startsWith('update'))return{rows:[]};return{rows:[row]}}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/src/lib/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,AbortController,setTimeout,clearTimeout,console,require:n=>n.endsWith('appointmentCommunicationRoles')?require('./load-communication-roles.cjs'):n.endsWith('/db')?{getDbPool:()=>pool}:{ensureBookingEngineSchema:async()=>{},ensureStaffSchema:async()=>{},createPartnerAppointmentPush:async()=>{},ghlRoutingFieldsForEvent:()=>({}),ghlRoutingFieldsForPayload:()=>({})},fetch:async(u,o)=>{sent=JSON.parse(o.body);return{ok:true,status:200,text:async()=>''}}});
 const lifecycle=file==='appointmentCreatedWebhook';
 await module.exports[lifecycle?'sendAppointmentLifecycleWebhook':'sendPartnerAppointmentNotification']('appt',event);
 assert.ok(sent);assert.equal(sent.clientAmountDueAtVisit,funded?0:131);assert.equal(sent.partnerPayoutSource,funded?'my_drip_nurse':'patient');assert.equal(reads,lifecycle?3:1,'No extra queries');
 assert.match(sent.smsMessage,funded?/collect \$0/i:clinic?/Your clinic collects.*\$131.00/:/Collect \$131.00 directly from the client; tips are voluntary/);
 assert.match(sent.collectionInstructions,funded?/My Drip Nurse pays \$150.00 after completion/:clinic?/clinic balance, not a nurse payout/:/does not collect or pay out/);
 assert.equal(sent.professionalRecipientRole,clinic?'clinic_nurse':'independent_partner');
 assert.equal(sent.collectionResponsibleRole,funded?'my_drip_nurse':clinic?'clinic':'independent_partner');
 if(clinic&&!funded){assert.equal(sent.nurseEarningsAmount,null);assert.equal(sent.clinicBalanceAmount,131);assert.equal(sent.clinicCollectionStatus,'not_verified');assert.match(sent.earningsDisplay,/Clinic balance/);}
 assert.doesNotMatch(sent.smsMessage,/Earn |guaranteed/);
}
(async()=>{for(const clinic of [false,true])for(const funded of [false,true]){for(const event of ['new_booking','appointment_reassigned'])await check('appointmentCreatedWebhook',funded,event,clinic);for(const event of ['confirmed','reassigned'])await check('partnerAppointmentNotifications',funded,event,clinic);}await check('appointmentCreatedWebhook',true,'appointment_accepted');await check('partnerAppointmentNotifications',true,'partner_acknowledged');console.log('PASS: clinic/nurse recipient isolation and collection responsibility, direct collection, voluntary tips, funded-reward $0 exception, funding amounts and unchanged DB query counts. Mock only; no messages/payments.');})().catch(e=>{console.error(e);process.exitCode=1});

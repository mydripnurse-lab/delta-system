const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const path = require('path').resolve(__dirname, '..'), ts = require(path + '/node_modules/typescript');
function load(file, deps) {
 const module = {exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path+'/src/lib/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,AbortController,setTimeout,clearTimeout,console,...deps});
 return module.exports;
}
(async()=>{
 const requests=[],reservations=new Set(),queryArgs=[];
 const pool={query:async(sql,v)=>{
  queryArgs.push([sql,v]);
  if(sql.includes('select a.id::text')) return {rows:[{id:'appt',organization_id:'org',status:'cancelled',starts_at:'2026-11-04T15:00:00Z',ends_at:'2026-11-04T16:00:00Z',timezone:'America/New_York',currency:'USD',service_price:219,deposit_amount:88,service_name:'IV',service_image_url:'https://example.invalid/real-product.png',partner_id:v[1],partner_email:v[1]+'@example.invalid',appointment_declined_webhook_url:'https://example.invalid/declined',appointment_reassigned_webhook_url:'https://example.invalid/reassigned'}]};
  if(sql.startsWith('insert into app.appointment_webhook_events')) {if(reservations.has(v[2]))return {rows:[]};reservations.add(v[2]);return {rows:[{id:v[2]}]};}
  return {rows:[]};
 }};
 const send=load('appointmentCreatedWebhook',{require:n=>n.endsWith('appointmentCommunicationRoles')?require('./load-communication-roles.cjs'):n.endsWith('bookingEngineSchema')?{ensureBookingEngineSchema:async()=>{}}:n.endsWith('/db')?{getDbPool:()=>pool}:{ghlRoutingFieldsForEvent:()=>({}),ghlRoutingFieldsForPayload:()=>({})},fetch:async(url,o)=>{requests.push(JSON.parse(o.body));return {ok:true,status:200,text:async()=>''}}}).sendAppointmentLifecycleWebhook;
 const ctx={eventId:'decline1',declinedPartnerId:'original',replacementPartnerId:'replacement',replacementPartnerName:'New professional',reason:'Unavailable',outcome:'reassigned'};
 await send('appt','appointment_declined',undefined,ctx);
 assert.equal(requests[0].partnerId,'original');assert.equal(requests[0].actionRequired,false);
 assert.equal(queryArgs.length,3);assert.match(requests[0].customerUpdateMessage,/once they accept/);
 await send('appt','appointment_reassigned',undefined,ctx);
 assert.equal(requests[1].partnerId,'replacement');assert.equal(requests[1].actionRequired,true);
 assert.match(requests[1].smsMessage,/accept or decline/);
 assert.equal((await send('appt','appointment_declined',undefined,ctx)).reason,'already_reserved');
 for(const outcome of ['cancelled','refunded','refund_pending','refund_review']){
  await send('appt','appointment_declined',undefined,{...ctx,eventId:outcome,replacementPartnerId:null,outcome});
  const p=requests.at(-1);assert.equal(p.partnerId,'original');assert.match(p.customerUpdateMessage,/cancelled/);
  assert.equal(p.adminActionRequired,true);assert.equal(p.serviceImageUrl,'https://example.invalid/real-product.png');
  if(outcome==='refund_review')assert.match(p.customerPaymentMessage,/reviewing/);
 }
 const lifecycle=[];let cancelSql='',alternativeSql='';
 async function run(replacement,paid,refundFails=false){
  lifecycle.length=0;cancelSql='';
  const db={query:async(sql,v)=>{
   if(sql.includes('select appointment.id, appointment.organization_id'))return {rows:[{id:'appt',organization_id:'org',service_id:'service',partner_profile_id:'original',state:'Florida',county:'Orange',city:'Orlando',starts_at:'2026-11-04T15:00:00Z',ends_at:'2026-11-04T16:00:00Z',payment_intent_id:paid?'pi_test':null,payment_amount:'88',payment_currency:'USD',payment_status:paid?'paid':'pending'}]};
   if(sql.includes('select distinct partner.id')){alternativeSql=sql;return {rows:replacement?[{id:'replacement',display_name:'New professional'}]:[]};}
   if(sql.includes("'partner_declined', 'partner'"))return {rows:[{id:'event'}]};
   if(sql.includes("set status = 'cancelled', partner_decline_reason"))cancelSql=sql;
   return {rows:[]};
  },release(){}};
  const partner=load('partnerAppointments',{require:n=>{
   if(n.endsWith('bookingEngineSchema'))return {ensureBookingEngineSchema:async()=>{}};
   if(n.endsWith('/db'))return {getDbPool:()=>({...db,connect:async()=>db})};
   if(n.endsWith('appointmentCreatedWebhook'))return {sendAppointmentLifecycleWebhook:async(id,event,r,c)=>{lifecycle.push({event,context:{...c}})}};
   if(n.endsWith('partnerAppointmentNotifications'))return {sendPartnerAppointmentNotification:async()=>{}};
   if(n.endsWith('stripeCheckout'))return {refundStripePayment:async()=>{if(refundFails)throw Error('simulated');return {id:'re_test',paymentIntentId:'pi_test',amountCents:8800,currency:'USD',status:'succeeded'}}};
   if(n.endsWith('stripePaymentLifecycle'))return {applyStripeRefundUpdate:async()=>({fullyRefunded:true,status:'succeeded'})};
   return {};
  }});
  return partner.declinePartnerAppointment({profileId:'original',appointmentId:'appt',reason:'Unavailable'});
 }
 assert.equal((await run(true,true)).outcome,'reassigned');
 assert.deepEqual(lifecycle.map(x=>x.event),['appointment_declined','appointment_reassigned']);
 assert.match(alternativeSql,/declined.actor_id = partner.id::text/);assert.match(alternativeSql,/partner_availability_rules/);assert.match(alternativeSql,/x.kind = 'unavailable'/);
 assert.equal((await run(false,false)).outcome,'cancelled');assert.ok(cancelSql);assert.equal(lifecycle[0].context.declinedPartnerId,'original');
 assert.equal((await run(false,true)).outcome,'refunded');
 await assert.rejects(run(false,true,true),/Admin review/);assert.ok(cancelSql);assert.equal(lifecycle[0].context.outcome,'refund_review');
 console.log('PASS: original/replacement recipients, event deduplication, all customer outcomes, actual image, unchanged 3 queries per webhook, reassignment, cancellation, successful/failed refund notifications. No real DB, payment or network calls.');
})().catch(e=>{console.error(e);process.exitCode=1});

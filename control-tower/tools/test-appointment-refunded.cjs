const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', {paths:[root, process.env.MDN_TEST_DEPENDENCIES || root]}));
function load(file, deps) {
 const module = {exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/src/lib/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,AbortController,setTimeout,clearTimeout,console,...deps});
 return module.exports;
}
(async()=>{
 let paymentStatus='refunded';const requests=[],queries=[],reserved=new Set();
 const pool={query:async(sql,v)=>{
  queries.push([sql,v]);
  if(sql.includes('select a.id::text'))return {rows:[{id:'appt',organization_id:'org',status:'refunded',starts_at:'2026-11-04T15:00:00Z',ends_at:'2026-11-04T16:00:00Z',timezone:'America/New_York',currency:'USD',service_price:299,deposit_amount:120,payment_status:paymentStatus,service_name:'IV',service_image_url:'https://example.invalid/actual-iv.png',partner_id:v[1],partner_email:'nurse@example.invalid',appointment_refunded_webhook_url:'https://example.invalid/refunded'}]};
  if(sql.startsWith('insert into app.appointment_webhook_events')){if(reserved.has(v[2]))return {rows:[]};reserved.add(v[2]);return {rows:[{id:'delivery'}]};}
  return {rows:[]};
 }};
 const send=load('appointmentCreatedWebhook',{require:n=>n.endsWith('appointmentCommunicationRoles')?require('./load-communication-roles.cjs'):n.endsWith('bookingEngineSchema')?{ensureBookingEngineSchema:async()=>{}}:n.endsWith('/db')?{getDbPool:()=>pool}:{ghlRoutingFieldsForEvent:()=>({}),ghlRoutingFieldsForPayload:()=>({})},fetch:async(url,o)=>{requests.push(JSON.parse(o.body));return {ok:true,status:200,text:async()=>''}}}).sendAppointmentLifecycleWebhook;
 const ctx={refundId:'re_test',status:'succeeded',totalRefundedAmount:88,currency:'USD',partnerProfileId:'original'};
 assert.equal((await send('appt','appointment_refunded')).reason,'refund_not_confirmed');assert.equal(queries.length,0);
 for(const status of ['pending','failed','requires_action','canceled'])assert.equal((await send('appt','appointment_refunded',undefined,undefined,{...ctx,status})).reason,'refund_not_confirmed');
 paymentStatus='partially_refunded';assert.equal((await send('appt','appointment_refunded',undefined,undefined,ctx)).reason,'refund_not_confirmed');
 paymentStatus='refunded';queries.length=0;
 await send('appt','appointment_refunded',undefined,undefined,ctx);
 assert.equal(queries.length,3,'No extra DB queries for refund payload');
 assert.equal(requests[0].refundAmount,88);assert.equal(requests[0].refundAmountFormatted,'$88.00');
 assert.equal(requests[0].partnerId,'original');assert.equal(requests[0].serviceImageUrl,'https://example.invalid/actual-iv.png');
 assert.equal((await send('appt','appointment_refunded',undefined,undefined,ctx)).reason,'already_reserved');
 const notices=[];let transactionCommitted=false;
 async function apply(status,refunded,pending,already=false,assigned='original'){
  notices.length=0;transactionCommitted=false;
  const db={query:async(sql,v)=>{
   if(sql.includes('select payment.id::text')) return {rows:[{payment_id:'pay',appointment_id:'appt',amount:'88',currency:'USD',payment_status:already?'refunded':'paid',appointment_status:already?'refunded':'confirmed',partner_profile_id:assigned}]};
   if(sql.includes('coalesce(sum(amount)'))return {rows:[{refunded:String(refunded),pending_count:String(pending)}]};
   if(sql.includes("set status = 'refunded', partner_profile_id = null"))return {rows:already?[]:[{id:'appt'}]};
   if(sql==='commit')transactionCommitted=true;
   return {rows:[]};
  },release(){}};
  const lifecycle=load('stripePaymentLifecycle',{require:n=>{
   if(n.endsWith('bookingEngineSchema'))return {ensureBookingEngineSchema:async()=>{}};
   if(n.endsWith('/db'))return {getDbPool:()=>({...db,connect:async()=>db})};
   if(n.endsWith('appointmentCreatedWebhook'))return {sendAppointmentLifecycleWebhook:async(...args)=>{assert.equal(transactionCommitted,true);notices.push(args)}};
   if(n.endsWith('appointmentRefundNotifications'))return {sendAppointmentRefundNotification:async()=>{}};
   return {};
  }});
  return lifecycle.applyStripeRefundUpdate({stripeRefundId:'re_test',paymentIntentId:'pi_test',amountCents:4400,currency:'usd',status,actorId:'test'});
 }
 for(const status of ['pending','failed','requires_action','canceled']){await apply(status,0,status==='pending'?1:0);assert.equal(notices.length,0);}
 await apply('succeeded',44,0);assert.equal(notices.length,0,'Partial refund must not claim full refund');
 await apply('succeeded',88,0);assert.equal(notices.length,1);assert.equal(notices[0][4].totalRefundedAmount,88,'Use cumulative confirmed amount, not final installment');assert.equal(notices[0][4].partnerProfileId,'original');
 await apply('succeeded',88,0,true);assert.equal(notices.length,0,'Repeated processor event does not repeat notification');
 await apply('succeeded',88,0,false,null);assert.equal(notices[0][4].partnerProfileId,null,'Unassigned appointment still notifies customer/admin');
 console.log('PASS: confirmed full refund only, actual cumulative amount, original professional, no-assignment case, after-commit delivery, duplicate suppression, unchanged payload query count. No network, real DB, payments, or refunds.');
})().catch(e=>{console.error(e);process.exitCode=1});

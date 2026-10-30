const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path').resolve(__dirname, '..');
const ts = require(path + '/node_modules/typescript');
const source = fs.readFileSync(path + '/src/lib/appointmentCreatedWebhook.ts', 'utf8');
const reservations = new Set(), sent = [], queries = [];
const row = { id: 'appointment', organization_id: 'org', public_reference: 'MDN-TEST', currency: 'USD', starts_at: '2026-11-10T15:00:00Z', ends_at: '2026-11-10T16:00:00Z', timezone: 'America/New_York', created_at: '2026-10-01T00:00:00Z', partner_rescheduled_webhook_url: 'https://example.invalid/rescheduled', new_booking_webhook_url: 'https://example.invalid/new', customer_full_name: 'Test Patient', service_name: 'Test service', service_image_url: 'https://example.invalid/admin-product.png', service_price: 219, deposit_amount: 88 };
const pool = { query: async (sql, values) => {
 queries.push(sql);
 if(sql.includes('select a.id::text')) return {rows:[{...row}]};
 if(sql.startsWith('insert into app.appointment_webhook_events')) {
   const key = values[2]; if(reservations.has(key)) return {rows:[]};
   reservations.add(key); return {rows:[{id:key}]};
 }
 if(sql.startsWith('update app.appointment_webhook_events')) return {rows:[]};
 throw Error('Unexpected query');
}};
const moduleMock = {exports:{}};
const context = { module:moduleMock, exports:moduleMock.exports, URL, AbortController, setTimeout, clearTimeout, console, require(name) {
 if(name.endsWith('bookingEngineSchema')) return {ensureBookingEngineSchema:async()=>{}};
 if(name.endsWith('/db')) return {getDbPool:()=>pool};
 if(name.endsWith('ghlRoutingEnvelope')) return {ghlRoutingFieldsForEvent:()=>({}),ghlRoutingFieldsForPayload:()=>({})};
 throw Error(name);
},fetch:async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,status:200,text:async()=>''}}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
(async()=>{
 const send = moduleMock.exports.sendAppointmentLifecycleWebhook;
 const change = {eventId:'change1',previousStartsAt:'2026-10-31T14:00:00Z',previousEndsAt:'2026-10-31T15:00:00Z',previousTimezone:'America/New_York',startsAt:'2026-11-01T16:00:00Z',endsAt:'2026-11-01T17:00:00Z',timezone:'America/New_York'};
 assert.equal((await send('appointment','partner_rescheduled',change)).sent,true);
 assert.equal(queries.length,3);
 assert.match(sent[0].previousAppointmentDateTimeFormatted,/10:00 AM EDT/);
 assert.match(sent[0].appointmentDateTimeFormatted,/11:00 AM EST/);
 assert.equal(sent[0].appointment.startsAt,'2026-11-01T16:00:00.000Z');
 assert.equal(sent[0].appointment.rescheduledFrom.startsAt,'2026-10-31T14:00:00.000Z');
 assert.equal(sent[0].actionRequired,false);
 assert.equal(sent[0].serviceImageUrl,row.service_image_url);
 assert.equal(sent[0].appointment.service.imageUrl,row.service_image_url);
 assert.equal((await send('appointment','partner_rescheduled',change)).reason,'already_reserved');
 assert.equal(sent.length,1);
 await send('appointment','partner_rescheduled',{...change,eventId:'change2'});
 assert.equal(sent.length,2);
 assert.notEqual(sent[0].idempotencyKey,sent[1].idempotencyKey);
 await send('appointment','new_booking');
 assert.equal(sent[2].idempotencyKey,'appointment.new_booking:org:appointment');
 assert.equal(sent[2].previousAppointmentDateTimeFormatted,undefined);
 assert.equal(sent[2].actionRequired,true);
 console.log('PASS: repeated reschedules, duplicate suppression, committed date snapshot, EDT/EST, unchanged new_booking, 3 existing queries per delivery. No network or database used.');
})().catch(e=>{console.error(e);process.exitCode=1});

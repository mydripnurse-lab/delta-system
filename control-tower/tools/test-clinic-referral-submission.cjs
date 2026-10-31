/* Exercise real application submission with a fake SQL adapter. No network or DB. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../src/lib/publicStaffProvisioning.ts'),'utf8');
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let captured, resolved, eligible = 'clinic-server-validated';
const queries = [];
const db = {getDbPool:()=>({query:async(sql,args=[])=>{
  queries.push(sql);
  if(sql.includes('insert into app.staff_applications (')) { captured=args;return {rows:[{id:'fixture-application'}]}; }
  if(sql.includes('select id from app.partner_profiles')) return {rows:[{id:'existing-partner-referrer'}]};
  if(sql.includes('insert into app.partner_automation_deliveries')) return {rows:[{id:'fixture-delivery',status:'sent',event_name:'partner_application_received'}]};
  return {rows:[]};
}})};
const mocks={
 '@/lib/db':db,
 '@/lib/clinicAffiliate':{resolveClinicReferral:async(...args)=>{resolved=args;return eligible;}},
 '@/lib/ghlRoutingEnvelope':{ghlRoutingFieldsForEvent:()=>({}),ghlRoutingFieldsForPayload:()=>({})},
};
const testModule={exports:{}};
new Function('require','module','exports',code)(name=>mocks[name]||(name.startsWith('@/')?{}:require(name)),testModule,testModule.exports);
global.fetch=async()=>{throw new Error('This test must never send a webhook or access the network.');};
const input={firstName:'External',lastName:'Fixture',email:'external@example.invalid',phone:'+15555550123',company:'',publicTitle:'RN',professionalCredentials:'RN',biography:'Synthetic',profilePhotoUrl:'',profilePhotoFileId:'',profilePhotoLocationId:'',profileConsentAt:'',primaryLocationId:'local',countyKeys:['local'],submissionKey:'synthetic-submission',referralCode:'clinic:fixture-clinic',clinicReferralId:'attacker-supplied'};
const config={tenantId:'fixture-organization',adminBaseUrl:'https://example.invalid'};
(async()=>{
 await testModule.exports.submitStaffApplication({config,input,selected:[]});
 assert.deepEqual(resolved,['clinic:fixture-clinic','fixture-organization','external@example.invalid']);
 assert.equal(JSON.parse(captured[2]).clinicReferralId,'clinic-server-validated');
 assert.equal(captured[17],null,'Clinic attribution cannot also set a partner referrer');
 eligible=null;
 await testModule.exports.submitStaffApplication({config,input,selected:[]});
 assert(!Object.hasOwn(JSON.parse(captured[2]),'clinicReferralId'),'Existing or ineligible referrals must not gain clinic attribution');
 await testModule.exports.submitStaffApplication({config,input:{...input,referralCode:'legacy-code'},selected:[]});
 assert.equal(captured[17],'existing-partner-referrer');
 assert(!Object.hasOwn(JSON.parse(captured[2]),'clinicReferralId'),'Ordinary partner referrals remain unchanged');
 assert(queries.some(sql=>sql.includes('partner_affiliate_ledger')));
 console.log('PASS: real application submission stores only server-validated clinic attribution; existing partner flow preserved. No database, webhooks or network.');
})().catch(error=>{console.error(error);process.exitCode=1;});

/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real-module tests with fake DB. */
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), ts = require('typescript');
const root=path.join(__dirname,'../src'), cache={};
let identity=null, queries=[], connects=0, duplicate=false;
const mocks={
 'server-only':{},
 'next/cache':{unstable_cache:fn=>fn,revalidateTag:()=>{}},
 '@/lib/db':{getDbPool:()=>({connect:async()=>{connects++;return {release(){},query:async(sql,args=[])=>{queries.push({sql,args});if(sql.includes('select 1 from app.partner_profiles'))return {rows:duplicate?[{exists:1}]:[]};if(sql.includes('insert into app.clinics('))return {rows:[{id:'synthetic-clinic'}]};return {rows:[]};}};}})},
 '@/lib/myDripNurseServiceCatalog':{getMyDripNurseOrganizationId:async()=> 'synthetic-org'},
 '@/lib/password':{validatePasswordStrength:()=>'',hashPassword:async()=> 'synthetic-hash'},
 '@/lib/clinicAuth':{requireClinicsEnabled:()=>{},getClinicIdentity:async()=>identity},
 '@/lib/clinicAffiliate':{resolveNewClinicReferral:async()=>null},
 '@/lib/regionalPricingCatalog':{},
};
function load(file){
 if(cache[file])return cache[file];
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:name.startsWith('@/')?load(name.slice(2)+(name.endsWith('.json')?'':'.ts')):require(name),module,module.exports);
 return cache[file]=module.exports;
}
(async()=>{
 const geo=load('lib/clinicRegistrationLocation.ts');
 const florida=geo.clinicRegistrationLocations('FL'), pr=geo.clinicRegistrationLocations('Puerto Rico'), la=geo.clinicRegistrationLocations('LA');
 assert.equal(geo.clinicRegistrationLocations('').filter(r=>r.level==='state').length,52);
 assert.equal(pr.filter(r=>r.level==='city'&&r.state==='Puerto Rico').length,78);
 assert(!pr.some(r=>r.level==='county'&&r.state==='Puerto Rico'));
 assert(la.some(r=>r.level==='county'&&r.county==='Orleans'));
 assert(geo.clinicRegistrationLocations('DC').some(r=>r.city==='Washington'));
 const city=florida.find(r=>r.level==='city'), county=florida.find(r=>r.level==='county'), other=la.find(r=>r.level==='city');
 assert.deepEqual(geo.clinicRegistrationCoverage(city.id,[county.id,other.id,city.id]).map(r=>r.id),[city.id,county.id,other.id]);
 assert.throws(()=>geo.clinicRegistrationCoverage(county.id,[]));
 assert.throws(()=>geo.clinicRegistrationCoverage(city.id,['forged']));
 const {registerClinic}=load('lib/clinics.ts');
 const policy=load('lib/clinicAffiliatePolicy.ts');
 const input={name:'Synthetic Clinic',slug:'synthetic-clinic',description:'A synthetic clinic for local tests only.',fullName:'Test Owner',email:'owner@example.invalid',password:'SyntheticOnly123',contactEmail:'private@example.invalid',contactPhone:'+15555550123',locationId:city.id,coverageIds:[county.id,other.id],affiliatePolicyAccepted:true,affiliatePolicyVersion:policy.CLINIC_AFFILIATE_POLICY_VERSION,status:'approved',published:true};
 await assert.rejects(registerClinic({...input,locationId:'forged'}));
 await assert.rejects(registerClinic({...input,affiliatePolicyAccepted:false}));
 assert.equal(connects,0,'Invalid locations and missing consent must be rejected before connecting to DB');
 assert.equal(await registerClinic(input),'synthetic-clinic');
 const insert=queries.find(q=>q.sql.includes('insert into app.clinics('));
 assert(insert.sql.includes("'pending',false"),'Client cannot self-approve or publish');
 assert.deepEqual(JSON.parse(insert.args[7]).map(r=>r.id),[city.id,county.id,other.id]);
 assert(queries.some(q=>q.sql==='commit'));
 queries=[];identity={email:'existing@example.invalid',partnerId:'existing-nurse'};
 await registerClinic(input);
 assert(!queries.some(q=>q.sql.includes('insert into app.clinic_accounts')),'Existing nurses keep the same account');
 assert.equal(queries.find(q=>q.sql.includes('insert into app.clinic_memberships')).args[2],'existing-nurse');
 identity=null;duplicate=true;queries=[];
 await assert.rejects(registerClinic(input),/already exists/);
 assert(queries.some(q=>q.sql==='rollback'));
 assert(!queries.some(q=>q.sql.includes('insert into app.clinics(')));
 const api=load('app/api/public/clinic-locations/route.ts');
 const before=connects;
 const ok=await api.GET(new Request('https://example.invalid/api/public/clinic-locations?state=PR'));
 assert.equal(ok.status,200);assert.match(ok.headers.get('cache-control'),/s-maxage=604800/);
 assert.equal((await api.GET(new Request('https://example.invalid/api/public/clinic-locations?state=invalid'))).status,400);
 assert.equal(connects,before,'Public geography never connects to DB');
 console.log('PASS: all 52 states/territories, PR municipalities, Louisiana, DC, multi-state coverage, server validation, pending approval, existing-account reuse, duplicate rollback, cached geography without DB.');
})().catch(e=>{console.error(e);process.exitCode=1;});

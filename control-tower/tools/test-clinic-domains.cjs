/* Local-only integration checks. Provider/DNS and credentials are synthetic. */
global.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {Pool} = require('pg');
const url = new URL(process.env.CLINIC_TEST_DATABASE_URL || 'postgresql://axel@127.0.0.1:55487/mdn_clinic_test');
if(url.hostname !== '127.0.0.1' || url.pathname !== '/mdn_clinic_test') throw new Error('Dedicated local database required');
const pool = new Pool({connectionString:url.toString(),max:3});
const root = path.join(__dirname,'..');
const memo = new Map(), modules = new Map(), calls=[];
let identity, proofVisible=false, misconfigured=true, deleteFailure=false, configFailure=false, dbReads=0;
let tenant=null;
let partnerSession=null, clinicToken=null, revoked=0;
const query = pool.query.bind(pool);
pool.query=(...args)=>{dbReads++;return query(...args);};
const mocks={
 'server-only':{},
 '@/lib/clinicDomainRequest':{getRequestClinicTenant:async()=>tenant},
 'next/cache':{unstable_cache:(fn,keys)=>async(...args)=>{const key=JSON.stringify([keys,args]);if(!memo.has(key))memo.set(key,await fn(...args));return memo.get(key);},revalidateTag:()=>memo.clear()},
 'node:dns/promises':{Resolver:class{async resolveTxt(name){if(!proofVisible)return [];const {rows}=await query('select verification_token from app.clinic_domains where hostname=$1',[name.replace(/^_mdn-verify\./,'')]);return rows[0]?[['mdn-clinic=',rows[0].verification_token]]:[];}}},
 '@/lib/db':{getDbPool:()=>pool},
 '@/lib/clinicAuth':{requireClinicsEnabled:()=>{},requireClinicManager:async id=>{if(identity.id!==id||identity.role==='nurse')throw new Error('Denied');return {...identity,status:'approved'};},requireClinicOrigin:req=>{if(req.headers.get('origin')!==new URL(req.url).origin)throw new Error('Invalid origin');},loginClinicAccount:async()=>clinicToken,CLINIC_COOKIE:'mdn_clinic_session',clinicCookieOptions:()=>({httpOnly:true})},
 '@/lib/partnerPortalAuth':{createPartnerPortalPasswordSession:async()=>partnerSession,revokePartnerPortalSession:async()=>revoked++,PARTNER_PORTAL_COOKIE:'mdn_partner_portal_session',partnerPortalCookieOptions:()=>({httpOnly:true})},
 '@/lib/clinicRequestBudget':{consumeClinicRequestBudget:()=>true},
};
function load(relative){
 relative=path.normalize(relative);
 if(modules.has(relative))return modules.get(relative).exports;
 const module={exports:{}};modules.set(relative,module);
 const code=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  const normalized=name.startsWith('.')?path.normalize(path.join(path.dirname(relative),name)):name;
  const alias=normalized.startsWith('src/')?'@/'+normalized.slice(4):name;
  if(alias in mocks)return mocks[alias];
  if(name in mocks)return mocks[name];
  if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(normalized+'.ts');
  return require(name);
 },module,module.exports);return module.exports;
}
Object.assign(process.env,{CLINIC_PARTNERS_ENABLED:'true',CLINIC_CUSTOM_DOMAINS_ENABLED:'true',CLINIC_DOMAINS_VERCEL_TOKEN:'local-test-no-real-secret',CLINIC_DOMAINS_VERCEL_PROJECT_ID:'fixture-project',CLINIC_DOMAINS_VERCEL_TEAM_ID:'fixture-team'});
global.fetch=async(raw,options={})=>{
 const u=new URL(raw);assert.equal(u.origin,'https://api.vercel.com');assert.equal(u.searchParams.get('teamId'),'fixture-team');assert.equal(options.cache,'no-store');
 calls.push({path:u.pathname,method:options.method,body:options.body});
 if(options.method==='DELETE')return new Response(deleteFailure?'{}':null,{status:deleteFailure?500:404});
 if(u.pathname.endsWith('/config'))return new Response(JSON.stringify({misconfigured,recommendedCNAME:[{rank:2,value:'backup.vercel-dns.net'},{rank:1,value:'fixture-project.vercel-dns.net'}]}),{status:configFailure?503:200});
 const name=options.body?JSON.parse(options.body).name:u.pathname.split('/').at(-1)==='verify'?u.pathname.split('/').at(-2):u.pathname.split('/').at(-1);
 return Response.json({name,verified:true});
};
async function main(){
 const policy=load('src/lib/clinicDomainPolicy.ts'),routing=load('src/lib/clinicDomainRouting.ts');
 for(const host of ['mydripnurse.com','care.mydripnurse.com','a.vercel.app','localhost','127.0.0.1','https://care.someclinic.com','care.someclinic.com/path','*.someclinic.com','care.someclinic.com:443','care..com','-care.someclinic.com','care.someclinic.com@evil.com'])assert.throws(()=>policy.normalizeClinicDomain(host),host);
 assert.equal(policy.normalizeClinicDomain(' Care.SomeClinic.com. '),'care.someclinic.com');
 for(const p of ['/','/services','/services/alleviate','/become-a-partner','/login','/robots.txt','/sitemap.xml'])assert.equal(routing.clinicDomainPath(p),'public');
 assert.equal(routing.clinicDomainPath('/clinic-assets/wellness-lounge.webp'),'asset');
 assert.equal(routing.clinicDomainPath('/clinic-assets/mobile-iv-home.webp'),'asset');
 for(const p of ['/clinic-assets/private.json','/become-a-partner/admin','/clinics/other','/clinic-domain/other','/services/foo/book','/partner-admin','/login/reset','//login'])assert.equal(routing.clinicDomainPath(p),'deny');
 const {unstable_doesMiddlewareMatch}=require('next/experimental/testing/server');
 const proxy=load('src/proxy.ts');
 assert.equal(unstable_doesMiddlewareMatch({config:proxy.config,nextConfig:{},url:'https://care.someclinic.com/api/private'}),true);
 assert.equal(unstable_doesMiddlewareMatch({config:proxy.config,nextConfig:{},url:'https://care.mydripnurse.com/api/private'}),false,'No new middleware on existing MDN APIs');
 const {NextRequest}=require('next/server');
 const req=(host,p,method='GET')=>new NextRequest('https://'+host+p,{method,headers:{host}});
 assert.equal(proxy.proxy(req('care.someclinic.com','/api/clinics')).status,200);
 assert.equal(proxy.proxy(req('care.someclinic.com','/api/clinics','POST')).status,403);
 for(const [url,dest] of [['/portal','/partner-portal'],['/portal/appointments','/partner-portal/appointments'],['/portal/clinics/profile/branding','/clinic-portal/profile/branding'],['/nurses/jane/services/alleviate','/partner-site/jane/services/alleviate']])assert.equal(routing.clinicDomainDestination('care.someclinic.com',url),dest);
 const screens=load('src/lib/clinicPortalRoutes.ts');
 for(const key of Object.keys(screens.clinicScreens))assert.ok(screens.parseClinicScreen([key]));
 for(const parts of [['__proto__'],['profile','bad'],['team','branding'],['profile','branding','extra']])assert.equal(screens.parseClinicScreen(parts),null);
 assert.equal(proxy.proxy(req('care.someclinic.com','/','POST')).status,404);
 assert.ok(proxy.proxy(req('care.someclinic.com','/services/alleviate')).headers.get('x-middleware-rewrite').endsWith('/clinic-domain/care.someclinic.com/services/alleviate'));
 assert.equal(proxy.proxy(req('partners.mydripnurse.com','/clinic-domain/care.someclinic.com')).status,404);
 const migration=fs.readFileSync(path.join(root,'db/migrations/054_clinic_domains.sql'),'utf8');await query(migration);await query(migration);
 const {rows:[c]}=await query("select id,organization_id from app.clinics where slug='fixture-clinic'");
 assert.ok(c,'Run test-clinic-partners.cjs first');
 await query('delete from app.clinic_domains where clinic_id=$1',[c.id]);
 await query("update app.clinics set status='approved',published=true where id=$1",[c.id]);
 await query("update app.clinic_memberships set status='active',accepted_at=now(),authorized_at=now() where clinic_id=$1 and role='owner'",[c.id]);
 const owner=(await query("select email from app.clinic_memberships where clinic_id=$1 and role='owner'",[c.id])).rows[0];
 identity={id:c.id,email:owner.email,role:'owner'};
 const domains=load('src/lib/clinicDomains.ts'),login=load('src/lib/clinicLogin.ts');
 assert.equal((await login.clinicLoginDestination('fixture-clinic',owner.email)).redirectTo,`/portal/clinics?clinic=${c.id}`);
 assert.equal(await login.clinicLoginDestination('fixture-clinic','outsider@example.invalid'),null);
 const nurse=(await query("select email,partner_profile_id from app.clinic_memberships where clinic_id=$1 and role='nurse' and partner_profile_id is not null limit 1",[c.id])).rows[0];assert.ok(nurse);
 await query("update app.clinic_memberships set status='active',accepted_at=now(),authorized_at=now() where clinic_id=$1 and email=$2",[c.id,nurse.email]);
 assert.equal((await login.clinicLoginDestination('fixture-clinic',nurse.email)).redirectTo,'/portal');
 await query("update app.clinic_memberships set accepted_at=null where clinic_id=$1 and email=$2",[c.id,nurse.email]);assert.equal(await login.clinicLoginDestination('fixture-clinic',nurse.email),null);
 await query("update app.clinic_memberships set accepted_at=now(),status='suspended' where clinic_id=$1 and email=$2",[c.id,nurse.email]);assert.equal(await login.clinicLoginDestination('fixture-clinic',nurse.email),null);
 await query("update app.clinic_memberships set status='active' where clinic_id=$1 and email=$2",[c.id,nurse.email]);
 const post=load('src/app/api/public/partner-portal/login/route.ts').POST;
 const signIn=body=>post(new Request('https://partners.mydripnurse.com/api/public/partner-portal/login',{method:'POST',headers:{origin:'https://partners.mydripnurse.com','content-type':'application/json'},body:JSON.stringify(body)}));
 clinicToken='synthetic-clinic-cookie';
 assert.equal((await signIn(null)).status,400);
 tenant={slug:'other-clinic',clinicId:'other'};assert.equal((await signIn({clinicSlug:'fixture-clinic',email:owner.email,password:'synthetic'})).status,403);tenant=null;
 let response=await signIn({clinicSlug:'fixture-clinic',email:owner.email,password:'synthetic'});assert.equal(response.status,200);assert.equal((await response.json()).redirectTo,`/portal/clinics?clinic=${c.id}`);
 assert.equal((await signIn({clinicSlug:'fixture-clinic',email:'outsider@example.invalid',password:'synthetic'})).status,401);
 partnerSession={token:'synthetic-partner-cookie',profile:{id:nurse.partner_profile_id}};
 response=await signIn({clinicSlug:'fixture-clinic',email:nurse.email,password:'synthetic',role:'clinic'});assert.equal((await response.json()).redirectTo,'/portal','Submitted role cannot elevate nurse');
 partnerSession={token:'synthetic-partner-cookie',profile:{id:c.id}};assert.equal((await signIn({clinicSlug:'fixture-clinic',email:nurse.email,password:'synthetic'})).status,401);assert.equal(revoked,1);
 partnerSession=null;assert.equal((await signIn({clinicSlug:'fixture-clinic',email:nurse.email,password:'synthetic'})).status,401,'Clinic account must not substitute for nurse identity');
 partnerSession={token:'synthetic-partner-cookie',profile:{id:nurse.partner_profile_id}};
 assert.equal((await (await signIn({email:nurse.email,password:'synthetic',role:'nurse'})).json()).redirectTo,'/portal','Existing nurse login preserved');
 assert.equal((await (await signIn({email:owner.email,password:'synthetic',role:'clinic'})).json()).redirectTo,'/portal/clinics','Existing clinic login preserved');
 partnerSession=null;clinicToken=null;assert.equal((await signIn({clinicSlug:'fixture-clinic',email:owner.email,password:'wrong'})).status,401,'Membership never replaces password authentication');
 let result=await domains.changeClinicDomain(c.id,'connect','care.someclinic.com');assert.equal(result.domain.status,'pending');assert.equal(result.domain.records[1].value,'fixture-project.vercel-dns.net');assert.equal(calls.filter(c=>c.method==='POST').length,0,'No alias claim without clinic-specific ownership proof');assert.equal(await domains.clinicByDomain('care.someclinic.com'),null);
 await assert.rejects(()=>domains.changeClinicDomain(c.id,'connect','other.someclinic.com'),/Disconnect/);
 result=await domains.changeClinicDomain(c.id,'verify');assert.equal(result.domain.status,'pending');assert.equal(calls.filter(c=>c.method==='POST').length,0);
 await assert.rejects(()=>domains.changeClinicDomain(c.id,'verify'),/one minute/);
 proofVisible=true;misconfigured=false;await query('update app.clinic_domains set last_checked_at=null where clinic_id=$1',[c.id]);
 result=await domains.changeClinicDomain(c.id,'verify');assert.equal(result.domain.status,'active');assert.equal(calls.filter(c=>c.method==='POST').length,1);
 memo.clear();const before=dbReads;for(let i=0;i<20;i++)assert.equal((await domains.clinicByDomain('care.someclinic.com')).clinicId,c.id);assert.equal(dbReads-before,1,'20 visits share one bounded domain read');
 assert.equal((await domains.clinicSiteAddress({id:c.id,slug:'fixture-clinic'})).home,'https://care.someclinic.com');
 assert.equal('verification_token' in await domains.clinicByDomain('care.someclinic.com'),false);
 await query("update app.clinics set status='pending' where id=$1",[c.id]);memo.clear();assert.equal(await domains.clinicByDomain('care.someclinic.com'),null);assert.equal(await login.clinicLoginDestination('fixture-clinic',owner.email),null);
 await query("update app.clinics set status='approved',published=false where id=$1",[c.id]);memo.clear();assert.equal(await domains.clinicByDomain('care.someclinic.com'),null);
 await query('update app.clinics set published=true where id=$1',[c.id]);memo.clear();
 identity.role='nurse';await assert.rejects(()=>domains.clinicDomainSettings(c.id),/Denied/);await assert.rejects(()=>domains.changeClinicDomain(c.id,'disconnect'),/Denied/);identity.role='owner';
 deleteFailure=true;await assert.rejects(()=>domains.changeClinicDomain(c.id,'disconnect'),/hosting provider/);assert.equal(await domains.clinicByDomain('care.someclinic.com'),null,'Failed detach remains fail-closed');
 deleteFailure=false;result=await domains.changeClinicDomain(c.id,'disconnect');assert.equal(result.domain,null,'Provider 404 is an idempotent disconnect');
 assert.equal((await domains.clinicSiteAddress({id:c.id,slug:'fixture-clinic'})).home,'/clinics/fixture-clinic');
 await domains.changeClinicDomain(c.id,'connect','care.someclinic.com');configFailure=true;
 result=await domains.changeClinicDomain(c.id,'verify');assert.equal(result.domain.status,'pending');assert.equal((await query('select provider_attached from app.clinic_domains where clinic_id=$1',[c.id])).rows[0].provider_attached,true,'Retryable attachment survives failed configuration check');configFailure=false;
 await domains.changeClinicDomain(c.id,'disconnect');
 process.env.CLINIC_CUSTOM_DOMAINS_ENABLED='false';const reads=dbReads;assert.equal(await domains.clinicByDomain('care.someclinic.com'),null);assert.equal(dbReads,reads,'Disabled feature performs no routing queries');assert.equal(proxy.proxy(req('care.someclinic.com','/')).status,404);
 console.log('PASS: actual DNS target, proof-before-claim, verification cooldown, retry/disconnect, approval gates, private route isolation, shared cache, existing MDN API matcher, nurse/owner role detection and cross-role rejection. Local fixtures and mocked DNS/provider only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());

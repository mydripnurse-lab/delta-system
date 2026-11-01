/* Local database only. Blob uploads are mocked; no emails, bookings or external calls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {Pool}=require('pg');
const pool=new Pool({connectionString:'postgresql://axel@127.0.0.1:55487/mdn_clinic_test',max:2});
const root=path.join(__dirname,'../src'),memo=new Map(),modules=new Map();
let allowed=true,reads=0,uploads=0;
const query=pool.query.bind(pool);pool.query=(...args)=>{reads++;return query(...args);};
const mocks={
 'server-only':{},
 'next/cache':{unstable_cache:(fn,keys)=>async(...args)=>{const key=JSON.stringify([keys,args]);if(!memo.has(key))memo.set(key,await fn(...args));return memo.get(key);},revalidateTag:()=>memo.clear()},
 '@/lib/db':{getDbPool:()=>pool},
 '@/lib/clinicAuth':{requireClinicManager:async()=>{if(!allowed)throw Error('Denied');},requireClinicOrigin:()=>{}},
 '@/lib/clinicRequestBudget':{consumeClinicRequestBudget:()=>true},
 '@vercel/blob':{put:async(name,bytes,options)=>{uploads++;const meta=await require('sharp')(bytes).metadata();assert.equal(meta.format,'webp');assert(meta.width<=1600&&meta.height<=1600);assert.equal(options.access,'public');return {url:'https://fixture.public.blob.vercel-storage.com/'+name};}},
};
const real=new Set(['clinics','clinicWebsiteBrand','clinicPolicy','regionalPricing','clinicBooking']);
function load(file){if(modules.has(file))return modules.get(file);const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(n=>n in mocks?mocks[n]:n.startsWith('./')?load(path.join(path.dirname(file),n+'.ts')):n.startsWith('@/lib/')?(real.has(n.slice(6))?load(n.slice(2)+'.ts'):{}):require(n),m,m.exports);modules.set(file,m.exports);return m.exports;}
(async()=>{
 const migration=fs.readFileSync(path.join(__dirname,'../db/migrations/059_clinic_website_settings.sql'),'utf8');await query(migration);await query(migration);
 const {rows:[clinic]}=await query("select * from app.clinics where slug='calendar-fixture'");assert(clinic);
 const brand=load('lib/clinicWebsiteBrand.ts').clinicWebsiteBrand;
 assert.deepEqual(brand({primaryColor:'#ede5d8',accentColor:'#493e35'}),{primaryColor:'#493e35',accentColor:'#ede5d8',ink:'#ffffff',accentInk:'#000000'});
 assert.equal(brand({primaryColor:'#084f5e',accentColor:'#e9f3f7',websiteSettings:{primaryColor:'#fafafa',secondaryColor:'#101010'}}).primaryColor,'#101010');
 const lib=load('lib/clinics.ts'),input={heroImageUrl:'',primaryColor:'#493e35',secondaryColor:'#ede5d8'};
 try {
  allowed=false;await assert.rejects(lib.saveClinicWebsite(clinic.id,input),/Denied/);allowed=true;
  await assert.rejects(lib.saveClinicWebsite(clinic.id,{...input,heroImageUrl:'https://attacker.invalid/photo.png'}));
  await assert.rejects(lib.saveClinicWebsite(clinic.id,{...input,heroImageUrl:'https://fixture.public.blob.vercel-storage.com/clinics/other/hero-image.webp'}));
  await lib.saveClinicWebsite(clinic.id,input);
  const {rows:[after]}=await query('select * from app.clinics where id=$1',[clinic.id]);
  assert.deepEqual(after.website_settings,input);
  for(const key of ['primary_color','accent_color','logo_url','status','published','coverage','contact_email'])assert.deepEqual(after[key],clinic[key],key+' unchanged');
  const beforeReads=reads;const first=await lib.publicClinics(clinic.slug);await lib.publicClinics(clinic.slug);assert.equal(reads-beforeReads,1,'Public configuration remains cached');assert.deepEqual(first[0].websiteSettings,input);assert(!('contactEmail' in first[0]));
  const upload=load('app/api/clinics/hero-image/route.ts').POST;
  const image=await require('sharp')({create:{width:1900,height:1200,channels:3,background:'#ddd'}}).png().toBuffer();
  const request=(bytes=image)=>{const form=new FormData();form.set('clinicId',clinic.id);form.set('file',new File([bytes],'hero.png',{type:'image/png'}));return new Request('https://partners.mydripnurse.com/api/clinics/hero-image',{method:'POST',body:form});};
  allowed=false;assert.equal((await upload(request())).status,400);assert.equal(uploads,0);allowed=true;
  assert.equal((await upload(request(Buffer.from('not an image')))).status,400);assert.equal(uploads,0);
  assert.equal((await upload(request())).status,200);assert.equal(uploads,1);
  console.log('PASS: website-only saves, permission checks, image validation/optimization, default image, reversed colors, cache reuse, private contact exclusion. No external uploads.');
 } finally {allowed=true;await query('update app.clinics set website_settings=$2::jsonb where id=$1',[clinic.id,JSON.stringify(clinic.website_settings)]);}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());

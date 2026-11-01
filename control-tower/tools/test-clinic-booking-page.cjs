// Mocks only: no network, real payments or production data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.join(__dirname,'../src'),modules=new Map();
const clinicId='10000000-0000-4000-8000-000000000001',nurseId='10000000-0000-4000-8000-000000000002';
let enabled=true,clinic={id:clinicId,slug:'fixture',name:'Fixture Clinic',description:'Local mobile wellness team.',coverage:[{state:'Florida',county:'Orange',city:'Orlando'}],primaryColor:'#efe5d5',accentColor:'#453a30'},status='active',hasNurse=true,reads=0;
const service={id:'service',name:'Alleviate',publicKey:'calendar'};
const mocks={'server-only':{},react:{cache:f=>f},'./clinicFeature':{clinicBookingsEnabled:()=>enabled},'./clinics':{publicClinicById:async()=>{reads++;return clinic}},'./clinicBooking':{publicClinicServices:async(_id,nurse)=>nurse&&!hasNurse?[]:[{...service,availabilityStatus:status}],publicClinicTeam:async()=>hasNurse?[{id:nurseId,serviceIds:['service']}]:[]}};
function load(file){if(modules.has(file))return modules.get(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n in mocks?mocks[n]:n.startsWith('./')?load(path.join(path.dirname(file),n+'.ts')):n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n),m,m.exports);modules.set(file,m.exports);return m.exports;}
(async()=>{
 const page=load('lib/clinicBookingPage.ts').loadClinicBookingPage;
 enabled=false;assert.equal(await page(clinicId,'calendar'),null);assert.equal(reads,0);enabled=true;
 assert.equal(await page('invalid','calendar'),null);assert.equal(await page(clinicId,'calendar','foreign'),null);assert.equal(reads,0);
 assert.equal(await page(clinicId,'wrong'),null);
 status='out_of_stock';assert.equal(await page(clinicId,'calendar'),null);status='paused';assert.equal(await page(clinicId,'calendar'),null);status='active';
 assert.equal((await page(clinicId,'calendar',nurseId)).brand.primaryColor,'#453a30');
 hasNurse=false;assert.equal(await page(clinicId,'calendar',nurseId),null);hasNurse=true;
 const saved=clinic;clinic=null;assert.equal(await page(clinicId,'calendar'),null);clinic=saved;
 const seo=load('lib/providerSeo.ts');const intro=seo.clinicServiceIntroduction(clinic,service,[{name:'Fixture Nurse',credentials:'RN'}]);assert.match(intro.coverage,/Orlando/);assert.match(intro.team,/Fixture Nurse, RN/);assert.equal(intro.description,clinic.description);
 const meta=seo.publicProviderMetadata('Alleviate | Fixture Clinic','Local description','https://clinic.example/services/alleviate','',seo.clinicKeywords(clinic,['Alleviate']));assert.equal(meta.robots.index,true);assert(meta.keywords.includes('Alleviate'));assert.equal(meta.alternates.canonical,'https://clinic.example/services/alleviate');
 process.env.STRIPE_SECRET_KEY='sk_test_fixture_not_a_real_key';let posted;
 global.fetch=async(url,opts)=>{assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');posted=new URLSearchParams(opts.body);return new Response(JSON.stringify({id:'cs_fixture',status:'open'}),{status:200});};
 const stripe=load('lib/stripeCheckout.ts');
 const options={appointmentId:'fixture',publicReference:'fixture-ref',customerEmail:'synthetic@example.invalid',serviceName:'Alleviate',amountCents:9560,currency:'USD',calendarPublicKey:'calendar',embedded:true,returnUrl:`https://care.mydripnurse.com/booking/calendar?clinicId=${clinicId}&partnerId=${nurseId}`,clinicBrand:{name:'Fixture Clinic',primaryColor:'#453a30'}};
 await stripe.createStripeCheckoutSession(options);assert.equal(posted.get('branding_settings[button_color]'),'#453a30');assert.match(posted.get('branding_settings[display_name]'),/Fixture Clinic/);assert(posted.get('return_url').includes(clinicId));assert(posted.get('return_url').includes(nurseId));assert.equal(posted.get('line_items[0][price_data][unit_amount]'),'9560');
 await stripe.createStripeCheckoutSession({...options,clinicBrand:undefined});assert.equal(posted.get('branding_settings[button_color]'),'#066D79');assert.equal(posted.get('branding_settings[display_name]'),'My Drip Nurse Care');
 console.log('PASS: rollout/no reads, invalid IDs, unpublished clinics, foreign/paused/out-of-stock services, nurse isolation, contrast, clinic-specific content, metadata, Stripe branding and unchanged deposit/return context. Mock payment only.');
})().catch(e=>{console.error(e);process.exitCode=1;});

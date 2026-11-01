// Pure fixtures: no network, database, patient data or paid integrations.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '../src');
const modules = new Map();
const profile = { id:'nurse-one', slug:'alex-rivera', displayName:'Alex Rivera', publicTitle:'Registered Nurse', professionalCredentials:'RN', biography:'Mobile wellness professional.', profilePhotoUrl:'', serviceAreas:[{state:'Louisiana',county:'Orleans Parish',city:'New Orleans'}], services:[{name:'Alleviate',status:'active'},{name:'NAD+',status:'out_of_stock'},{name:'Hidden',status:'paused'}], clinicBrand:{id:'clinic-one',slug:'clinic-one'}, clinics:[] };
const clinic = {id:'clinic-one', name:'Clinic One', description:'Local wellness care', logoUrl:'', coverage:[{id:'county',state:'Louisiana',county:'Orleans Parish',city:''}], contactEmail:'private@example.com',contactPhone:'private'};
const service = {id:'service-one',slug:'alleviate',name:'Alleviate',description:'Description',imageUrl:'',price:219};
const mocks = {
 'react': {cache: f=>f},
 '@/lib/partnerProfiles': {getPartnerProfileForPublicPage:async()=>profile,listPublishedPartnerWebsites:async()=>[profile]},
 '@/lib/clinicFeature': {clinicsEnabled:()=>true},
 '@/lib/clinics': {publicClinics:async()=>[clinic]},
 '@/lib/clinicBooking': {publicClinicSitemapEntries:async()=>[],publicClinicServices:async(_id,nurse)=>nurse===profile.id?[service]:[],publicClinicTeam:async()=>[{id:profile.id,coverage:[{id:'city',state:'Louisiana',county:'Orleans Parish',city:'New Orleans'}]}]},
 '@/lib/clinicPolicy': {clinicCovers:(areas,r)=>areas.some(a=>a.state===r.state && (!a.county||a.county===r.county) && (!a.city||a.city===r.city))},
 '@/lib/myDripNurseServices': {definitionForCalendar:n=>n==='Alleviate'?{id:'alleviate',landingPath:'alleviate-mobile-iv-therapy'}:null,definitionForServiceSlug:s=>s==='alleviate-mobile-iv-therapy'?{id:'alleviate'}:null,partnerServiceSlug:d=>d.landingPath},
};
function load(file){if(modules.has(file))return modules.get(file);const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(n=>n in mocks?mocks[n]:n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n),m,m.exports);modules.set(file,m.exports);return m.exports;}
(async()=>{
 const seo=load('lib/providerSeo.ts'),partner=load('lib/partnerSeo.ts');
 const copy=load('lib/partnerPublicContent.ts');
 assert.equal(copy.nurseLocationContext([]),'');
 assert.equal(copy.nurseLocationContext([{state:'Puerto Rico',county:''}]),'Puerto Rico');
 assert.equal(copy.nurseLocationContext([...profile.serviceAreas,...profile.serviceAreas]),'New Orleans, Orleans Parish, Louisiana');
 assert.equal(copy.nurseLocationContext([{state:'Florida',county:'Orange'},{state:'Florida',county:'Brevard'}]),'selected areas of Florida');
 assert.equal(copy.nurseLocationContext([{state:'Florida',county:'Orange'},{state:'Georgia',county:'Fulton'}]),'selected areas of Florida and Georgia');
 assert.equal(copy.nurseIdentity({...profile,professionalCredentials:''}),'Alex Rivera');
 assert(!copy.nurseCareIntroduction(profile).includes('undefined'));
 const clinicProfile={...profile,clinicBrand:{...profile.clinicBrand,name:'Clinic One'}};
 assert(copy.nurseCareIntroduction(clinicProfile).includes("Alex Rivera (RN), part of Clinic One's care team"));
 assert.equal(partner.buildPartnerStructuredData(clinicProfile)['@graph'][0].affiliation.name,'Clinic One');
 assert.equal(partner.buildPartnerStructuredData({...profile,clinicBrand:undefined})['@graph'][0].affiliation,undefined);
 assert.deepEqual(seo.publishedServiceNames(profile.services),['Alleviate','NAD+']);
 const regions=seo.providerCoverage([...profile.serviceAreas,...profile.serviceAreas]);
 assert.equal(regions.length,1);assert.equal(regions[0].label,'New Orleans, Orleans Parish, Louisiana');
 assert.equal(regions[0].schema['@type'],'City');assert.equal(regions[0].schema.containedInPlace.name,'Orleans Parish');
 assert.equal(seo.coverageSummary([{state:'Puerto Rico',county:'',city:''}]),'Puerto Rico');
 assert.deepEqual(seo.providerCoverage([]),[]);
 const graph=partner.buildPartnerStructuredData(profile)['@graph'];
 assert.equal(graph.find(e=>e['@type']==='ProfilePage').mainEntity['@id'],graph[0]['@id']);
 assert.equal(graph[0].honorificSuffix,'RN');assert.equal(graph.filter(e=>e['@type']==='Service').length,2);
 assert(!JSON.stringify(graph).includes('parentOrganization'));assert(!JSON.stringify(graph).includes('Hidden'));
 const entity=seo.clinicEntity(clinic,'https://care.clinic.com');
 assert(!JSON.stringify(entity).includes('private'));assert(!('aggregateRating' in entity));
 const services=seo.clinicServiceEntities([service],'https://care.clinic.com',profile.serviceAreas);
 assert.equal(services[0].provider['@id'],entity['@id']);assert(!('offers' in services[0]),'No misleading universal price for regional services');
 const metadata=seo.publicProviderMetadata('Title','Description','https://care.clinic.com/services/alleviate');assert.equal(metadata.alternates.canonical,'https://care.clinic.com/services/alleviate');assert.equal(metadata.robots.index,true);
 assert.equal(partner.buildPartnerMetadata({profile,title:'Preview',description:'Preview',indexable:false}).robots.index,false);
 assert(!partner.serializeStructuredData({name:'</script><script>alert(1)</script>'}).includes('<'));
 const loader=load('lib/clinicNurseServicePage.ts').loadClinicNurseServicePage;
 const detail=await loader(profile.slug,'alleviate-mobile-iv-therapy');assert(detail);assert.equal(detail.profile.id,profile.id);assert.equal(detail.clinic.id,clinic.id);assert.equal(detail.service.price,219);assert.deepEqual(detail.coverage.map(r=>r.id),['city'],'City nurse coverage must not expand to the whole county');
 assert.equal(await loader(profile.slug,'unassigned-service'),null);assert.equal(await loader(profile.slug,'alleviate','preview-token'),null);
 profile.clinicBrand.services=[{name:'Alleviate',status:'active'},{name:'Hidden',status:'paused'}];
 const sitemap=await load('app/partner-seo/sitemap.xml/route.ts').GET();const xml=await sitemap.text();assert(xml.includes('/alex-rivera/services/alleviate-mobile-iv-therapy'));assert(!xml.includes('/services/Hidden'));
 console.log('PASS: public entity identity, credentials, exact geographic scope, active-service filtering, private-contact exclusion, canonical URLs, preview noindex, script escaping and clinic-nurse service/coverage isolation. No network or database.');
})().catch(e=>{console.error(e);process.exitCode=1;});

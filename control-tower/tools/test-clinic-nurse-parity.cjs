// Offline regression: no database, network, accounts, appointments or payments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const root = path.join(__dirname, '../src');
const modules = new Map();
let profile, rows = [], requests = [], independentReads = 0, bookingsOpen = true;
const mocks = {
 react: {...React, cache: fn => fn},
 '@/lib/db': {getDbPool() { throw Error('Database access forbidden'); }},
 '@/lib/bookingEngineSchema': {ensureBookingEngineSchema() { throw Error('Database access forbidden'); }},
 '@/lib/clinicBooking': {publicClinicServices: async (...args) => { requests.push(args); return rows; }},
 '@/lib/partnerProfiles': {getPartnerProfileForPublicPage: async () => profile},
 '@/lib/partnerServiceAreas': {loadPartnerCities: async () => []},
 '@/lib/clientPortalAuth': {getAuthenticatedClient: async () => null},
 '@/lib/clinicFeature': {clinicBookingsEnabled: () => bookingsOpen},
 '@/lib/partnerSeo': {buildPartnerMetadata: args => args},
 'next/navigation': {notFound() { throw Error('404'); }},
 'next/image': {__esModule: true, default: 'img'},
 'next/link': {__esModule: true, default: 'a'},
 '@/components/booking/BookingCalendarClient': {BookingCalendarClient: 'booking-calendar'},
 '@/components/booking/BookingIdentityPanel': {__esModule: true, default: 'booking-identity'},
 '@/components/partner/PartnerPublicHeader': {__esModule: true, default: 'public-header'},
};
function load(file) {
 if (modules.has(file)) return modules.get(file);
 const m = {exports:{}}; modules.set(file,m.exports);
 const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const req = n => {
  if(n in mocks) return mocks[n];
  if(n.endsWith('.css')) return {__esModule:true,default:new Proxy({}, {get:(_,k)=>String(k)})};
  if(n.startsWith('@/') || n.startsWith('.')) {
   const base=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);
   return load(fs.existsSync(path.join(root,base+'.ts'))?base+'.ts':base+'.tsx');
  }
  return require(n);
 };
 new Function('require','module','exports',code)(req,m,m.exports);
 modules.set(file,m.exports); return m.exports;
}
function find(node,type) {
 if(!node || typeof node!=='object') return [];
 if(Array.isArray(node)) return node.flatMap(x=>find(x,type));
 return [...(node.type===type?[node]:[]),...find(node.props?.children,type)];
}
function region(level,state,county='',city='') { return {id:load('lib/regionalPricing.ts').regionId(level,{state,county,city}),level,state,county,city,label:[city,county,state].filter(Boolean).join(', '),urls:[]}; }
(async()=>{
 const serviceLib=load('lib/myDripNurseServices.ts');
 const independentService={...serviceLib.definitionForCalendar('Alleviate'),price:'$219.00',calendarId:'independent-calendar'};
 serviceLib.loadPartnerCalendarServices=async()=>{independentReads++;return [independentService];};
 const state=region('state','Florida'),county=region('county','Florida','Orange'),city=region('city','Florida','Orange','Orlando');
 profile={id:'nurse-123',slug:'fixture-nurse',displayName:'Fixture Nurse',organizationId:'org',services:[],serviceAreas:[],clinicManaged:true,clinicBrand:{id:'clinic-456',slug:'fixture-clinic',name:'Fixture Clinic',logoUrl:'/fixture-logo.svg',primaryColor:'#493e35',accentColor:'#ede5d8',coverage:[state],clinicCoverage:[county]}};
 rows=[{id:'service-1',slug:'alleviate',name:'Alleviate',imageUrl:'/service.webp',description:'Fixture service',ingredients:['Calcium'],price:219,currency:'USD',clinicPrice:null,regionalPrices:[{region:state,price:229}],clinicRegions:[{region:city,price:239}],publicKey:'clinic-calendar',availabilityStatus:'active'}];
 const {loadClinicNurseCatalog,clinicNurseService}=load('lib/clinicNurseCatalog.ts');
 let catalog=await loadClinicNurseCatalog(profile);
 assert.deepEqual(catalog.coverage,[county]);
 assert.deepEqual(requests.at(-1),['clinic-456','nurse-123']);
 assert.equal(catalog.services[0].price,'From $229.00');
 assert.equal(catalog.services[0].calendarId,'clinic-calendar');
 assert.equal(catalog.services[0].imageUrl,'/service.webp');
 assert.equal(clinicNurseService({...rows[0],clinicPrice:249,clinicRegions:[]},[county]).price,'$249.00');
 assert.equal(clinicNurseService({...rows[0],clinicPrice:0,clinicRegions:[]},[county]).price,'$0.00');
 profile.clinicBrand.coverage=[city]; profile.clinicBrand.clinicCoverage=[state];
 assert.deepEqual((await loadClinicNurseCatalog(profile)).coverage,[city]);
 const pageData=load('lib/partnerServicePages.ts');
 const slug=serviceLib.partnerServiceSlug(catalog.services[0]);
 assert.equal((await pageData.loadPartnerServicePage(profile.slug,slug)).service.calendarId,'clinic-calendar');
 assert.equal((await pageData.loadPartnerServicePage(profile.slug,'alleviate')).service.id,'alleviate');
 assert.equal(await pageData.loadPartnerServicePage(profile.slug,'unassigned-service'),null);
 assert.equal(independentReads,0);
 const booking=load('app/partner-site/[slug]/services/[serviceSlug]/book/page.tsx');
 const props={params:Promise.resolve({slug:profile.slug,serviceSlug:slug}),searchParams:Promise.resolve({})};
 let tree=await booking.default(props);
 const calendar=find(tree,'booking-calendar')[0];
 assert(calendar); assert.equal(calendar.props.partnerId,profile.id); assert.equal(calendar.props.clinicId,profile.clinicBrand.id); assert.equal(calendar.props.publicKey,'clinic-calendar');
 assert.equal((await booking.generateMetadata(props)).indexable,false);
 const {PartnerExperience,PartnerFooter}=load('components/partner/PartnerBrand.tsx');
 const palette=load('lib/clinicWebsiteBrand.ts').clinicWebsiteBrand({...profile.clinicBrand,websiteSettings:{primaryColor:'#222d42',secondaryColor:'#e8ecf7'}});
 const wrapper=PartnerExperience({branding:palette,children:null});
 assert.equal(wrapper.props.style['--booking-primary'],'#222d42'); assert.equal(wrapper.props.style['--booking-ink'],'#ffffff');
 assert.equal(wrapper.props.style['--partner-ice'],'#e8ecf7');
 assert.equal(find(PartnerFooter({branding:profile.clinicBrand}),'img')[0].props.src,'/fixture-logo.svg');
 rows[0].availabilityStatus='out_of_stock';
 assert.equal(find(await booking.default(props),'booking-calendar').length,0);
 rows[0].availabilityStatus='active'; bookingsOpen=false;
 assert.equal(find(await booking.default(props),'booking-calendar').length,0);
 bookingsOpen=true;
 rows=[]; assert.equal(await pageData.loadPartnerServicePage(profile.slug,slug),null);
 profile.clinicBrand=undefined;
 assert.equal(await pageData.loadPartnerServicePage(profile.slug,slug),null); assert.equal(independentReads,0);
 profile.clinicManaged=false;
 assert.equal((await pageData.loadPartnerServicePage(profile.slug,slug)).service.calendarId,'independent-calendar');
 assert.equal(find(await booking.default(props),'booking-calendar')[0].props.clinicId,undefined);
 assert.equal(PartnerExperience({children:null}).props.style,undefined);
 assert.equal(find(PartnerFooter({}),'img')[0].props.src,'/mdn-logo.png');
 console.log('PASS: clinic/nurse catalog isolation, coverage intersection, regional/clinic/free prices, canonical and legacy URLs, original booking with clinic+nurse IDs, stock/feature gates, metadata, brand/contrast/footer, independent nurse unchanged. No database or network calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});

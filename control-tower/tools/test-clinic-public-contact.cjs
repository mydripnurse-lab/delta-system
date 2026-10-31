/* Render public pages with synthetic private contacts. No DB/network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const clinic = { id: 'fixture', slug: 'fixture-clinic', name: 'Fixture Clinic', description: 'Care in your area.', logoUrl: '', primaryColor: '#084f5e', accentColor: '#e9f3f7', coverage: [], contactEmail: 'private-clinic@example.invalid', contactPhone: '+15555550999' };
const services = [{ id: 'service', name: 'Fixture IV', price: 219, clinicPrice: null, regionalPrices: [], clinicRegions: [], publicKey: 'fixture-calendar', currency: 'USD', imageUrl: '', description: '' }];
let bookings = true;
const mocks = {
 'next/link': ({ children, prefetch, ...props }) => React.createElement('a', props, children),
 'next/image': ({ unoptimized, ...props }) => React.createElement('img', props),
 'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'),{url}); }, notFound: () => { throw new Error('not found'); } },
 '@/lib/clinicFeature': { clinicsEnabled: () => true, clinicBookingsEnabled: () => bookings },
 '@/components/partner/PartnerBrand': { PartnerExperience: ({children}) => children },
 '@/components/partner-network/NetworkNavigation': { NetworkHeader: () => null, DirectoryNavigation: () => null, NetworkFooter: () => null },
 '@/lib/clinicAuth': { clinicsEnabled: () => true },
 '@/lib/clinics': { publicClinics: async () => [clinic] },
 '@/lib/clinicBooking': { publicClinicServices: async () => services, publicClinicTeam: async () => [] },
};
function load(file) {
 const m = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
 new Function('require','module','exports',code)(name => name.endsWith('.css') ? {} : name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.slice(2)+'.ts') : require(name),m,m.exports);
 return m.exports;
}
(async () => {
 mocks['@/components/clinics/ClinicPublicServices'] = load('components/clinics/ClinicPublicServices.tsx');
 const page = load('app/clinics/[slug]/page.tsx');
 const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ slug: clinic.slug }) }));
 assert(!html.includes(clinic.contactEmail));
 assert(!html.includes(clinic.contactPhone));
 assert(!html.includes('tel:'));
 assert.match(html, /mailto:info@mydripnurse.com\?subject=Clinic%20inquiry/);
 assert.match(html, /https:\/\/care.mydripnurse.com\/booking\/fixture-calendar\?clinicId=fixture/);
 const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: clinic.slug }) });
 assert(!JSON.stringify(metadata).includes(clinic.contactEmail));
 assert(!JSON.stringify(metadata).includes(clinic.contactPhone));
 const directory = load('app/clinics/page.tsx');
 const directoryHtml = renderToStaticMarkup(await directory.default({ searchParams: Promise.resolve({}) }));
 assert(!directoryHtml.includes(clinic.contactEmail));
 assert(!directoryHtml.includes(clinic.contactPhone));
 bookings = false;
 const disabled = renderToStaticMarkup(await page.default({ params: Promise.resolve({slug:clinic.slug}) }));
 assert(!disabled.includes('/booking/fixture-calendar'));
 assert.match(disabled, /mailto:info@mydripnurse.com/);
 console.log('PASS: public website/directory/metadata omit private contacts; inquiries go to MDN; booking attribution and disabled-booking behavior preserved.');
})().catch(e => { console.error(e); process.exitCode=1; });

/* Access/navigation regression: synthetic identities only; no DB or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
let identity = null, clinics = [], enabled = true, listCalls = 0;
const redirect = url => { throw Object.assign(new Error('redirect'), { url }); };
const mocks = {
 'next/navigation': { redirect, notFound: () => { throw new Error('not found'); } },
 '@/lib/clinicFeature': { clinicBookingsEnabled: () => false },
 '@/lib/clinicAuth': { clinicsEnabled: () => enabled, requireClinicsEnabled: () => {}, getClinicIdentity: async () => identity },
 '@/lib/clinics': { listClinics: async () => { listCalls++; return clinics; }, clinicWorkspace: async id => ({ clinic: clinics.find(c => c.id === id), role: 'owner', members: [], appointments: [], services: [] }) },
 '@/components/clinics/ClinicPortal': { ClinicPortal: () => null },
 '@/lib/clinicRequestBudget': {}, '@/lib/regionalPricingCatalog': {},
 './clinic.module.css': {},
 '@/lib/clinicAffiliatePolicy': { CLINIC_AFFILIATE_POLICY_TEXT: 'Policy', CLINIC_AFFILIATE_POLICY_VERSION: 'test' },
};
function load(file) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
 new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), module, module.exports);
 return module.exports;
}
(async () => {
 const page = load('app/clinic-portal/page.tsx').default;
 await assert.rejects(page, error => error.url === '/login');
 assert.equal(listCalls, 0);
 identity = { email: 'fixture@example.invalid', name: 'Fixture Nurse', partnerId: 'fixture' };
 await assert.rejects(page, error => error.url === '/portal');
 const api = load('app/api/clinics/route.ts');
 let response = await api.GET(new Request('https://example.invalid/api/clinics'));
 assert.equal(response.status, 403);
 assert.equal((await response.json()).redirectTo, '/portal');
 response = await api.GET(new Request('https://example.invalid/api/clinics?regions=1'));
 assert.equal(response.status, 403);
 identity = { ...identity, partnerId: '' };
 await assert.rejects(page, error => error.url === '/clinics/register');
 clinics = [{ id: 'fixture-clinic', name: 'Accepted Clinic', role: 'owner', status: 'pending' }];
 listCalls = 0;
 const rendered = await page();
 assert.equal(listCalls, 1);
 assert.deepEqual(rendered.props.initialClinics, clinics);
 assert.deepEqual(rendered.props.initialIdentity, identity);
 assert.equal(rendered.props.initialWorkspace.clinic.id, 'fixture-clinic', 'Login opens clinic directly without Open clinic interstitial');
 response = await api.GET(new Request('https://example.invalid/api/clinics'));
 assert.equal(response.status, 200);
 const { renderToStaticMarkup } = require('react-dom/server');
 const { ClinicRegistration } = load('components/clinics/ClinicRegistration.tsx');
 const html = renderToStaticMarkup(require('react').createElement(ClinicRegistration, { signedIn: true }));
 assert.match(html, /href="\/portal">← Back to my portal/);
 assert(!html.includes('href="/portal/clinics"'), 'Incomplete registration must not link to the clinic workspace');
 assert.match(html, /<input[^>]*required=""[^>]*name="affiliatePolicyAccepted"/);
 enabled = false;
 await assert.rejects(page, /not found/);
 console.log('PASS: no clinic access before accepted membership; return goes to nurse portal; registered owner can prepare pending clinic; initial list reused; no DB/network.');
})().catch(error => { console.error(error); process.exitCode = 1; });

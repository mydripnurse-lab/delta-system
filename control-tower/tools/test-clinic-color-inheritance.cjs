// Isolated regression: no database, network calls or production mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const modules = new Map();
let allowed = true, writes = [], invalidations = 0;
const mocks = {
 'server-only': {},
 'next/cache': {unstable_cache: fn => fn, revalidateTag: () => invalidations++},
 '@/lib/db': {getDbPool: () => ({query: async (sql, params) => {writes.push({sql,params}); return {rows:[]};}})},
 '@/lib/clinicAuth': {requireClinicManager: async () => {if (!allowed) throw Error('Denied');}},
};
function load(file) {
 if (modules.has(file)) return modules.get(file);
 const m = {exports:{}};
 const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(n => n in mocks ? mocks[n] : n.startsWith('./') ? load(path.join(path.dirname(file),n+'.ts')) : n === '@/lib/clinicPolicy' ? load('lib/clinicPolicy.ts') : n.startsWith('@/') ? {} : require(n),m,m.exports);
 modules.set(file,m.exports);return m.exports;
}
(async () => {
 const resolve = load('lib/clinicWebsiteBrand.ts').clinicWebsiteBrand;
 const api = load('lib/clinics.ts');
 const defaults = {primaryColor:'#084f5e',accentColor:'#e9f3f7'};
 assert.equal(resolve(defaults).primaryColor,defaults.primaryColor);
 assert.equal(resolve(defaults).accentColor,defaults.accentColor);
 const inherited = {heroImageUrl:'',primaryColor:'',secondaryColor:''};
 await api.saveClinicWebsite('fixture', inherited);
 assert.deepEqual(JSON.parse(writes.at(-1).params[1]),inherited);
 const forest = {primaryColor:'#244c40',accentColor:'#e8f2eb',websiteSettings:inherited};
 assert.equal(resolve(forest).primaryColor,'#244c40');
 const independent = {heroImageUrl:'',primaryColor:'#222d42',secondaryColor:'#e8ecf7'};
 await api.saveClinicWebsite('fixture', independent);
 assert.equal(resolve({...forest,websiteSettings:independent}).primaryColor,'#222d42');
 await api.saveClinicBranding('fixture',{logoUrl:'',primaryColor:'#493e35',accentColor:'#ede5d8'});
 assert(!writes.at(-1).sql.includes('website_settings'),'White Label save preserves website overrides');
 await api.saveClinicWebsite('fixture',{heroImageUrl:''});
 assert.deepEqual(JSON.parse(writes.at(-1).params[1]),{heroImageUrl:''});
 await api.saveClinicWebsite('fixture',inherited);
 assert.equal(resolve({...forest,primaryColor:'#493e35',accentColor:'#ede5d8',websiteSettings:inherited}).primaryColor,'#493e35');
 const count = writes.length;
 await assert.rejects(api.saveClinicWebsite('fixture',{...independent,primaryColor:'invalid'}));
 allowed=false;await assert.rejects(api.saveClinicWebsite('fixture',inherited),/Denied/);
 assert.equal(writes.length,count);
 for(const w of writes.filter(w=>w.sql.includes('website_settings'))) assert(!/set primary_color|set accent_color/.test(w.sql));
 assert.equal(invalidations,count*2);
 const migration=fs.readFileSync(path.join(__dirname,'../db/migrations/048_clinic_partners.sql'),'utf8');
 assert(migration.includes("primary_color text not null default '#084f5e'"));
 assert(migration.includes("accent_color text not null default '#e9f3f7'"));
 console.log('PASS: default palette, inherited branding, photo-only saves, separate website palette, reset to White Label, validation, authorization, existing cache invalidation. No database calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});

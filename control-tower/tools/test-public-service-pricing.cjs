/* Offline tests: synthetic geography, no credentials, database or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(relative, mocks = {}) {
  const file = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/') && name.endsWith('.json')) return require(path.join(root, 'src', name.slice(2)));
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks);
    if (name.startsWith('./') || name.startsWith('../')) return load(path.join(path.dirname(relative), `${name}.ts`), mocks);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const pricing = load('src/lib/regionalPricing.ts');
function region(level, state, county = '', city = '', url = '') {
  const value = { level, state, county, city, label: [city, county, state].filter(Boolean).join(', '), urls: url ? [url] : [] };
  return { ...value, id: pricing.regionId(level, value) };
}

const pub = load('src/lib/publicServicePricing.ts');
const fl=region('state','Florida'), orange=region('county','Florida','Orange'), city=region('city','Florida','Orange','Orlando');
const pr=region('state','Puerto Rico'), ca=region('state','California');
const service={price:219,currency:'USD',regionalPrices:[{region:fl,price:229},{region:orange,price:239},{region:city,price:249},{region:pr,price:229},{region:ca,price:99}]};
assert.equal(pub.publicPriceSummary(service,[fl]).label,'From $229.00');
assert.equal(pub.publicPriceSummary(service,[fl],city).label,'$249.00');
assert.equal(pub.publicPriceSummary(service,[orange]).label,'From $239.00');
assert.equal(pub.publicPriceSummary(service,[pr]).label,'$229.00');
assert.equal(pub.publicPriceSummary({...service,regionalPrices:[{region:fl,price:229}]},[]).low,219);
assert.equal(pub.publicPriceSummary({...service,partnerOverride:199},[fl]).label,'$199.00');
assert.equal(pub.publicPriceSummary({...service,partnerOverride:0},[fl]).label,'$0.00');
assert.equal(pub.publicPriceSummary({...service,clinicPrice:280},[fl]).label,'$280.00');
assert.equal(pub.publicPriceSummary({...service,clinicPrice:null},[fl]).low,229);
const clinic={...service,clinicPrice:280,clinicRegions:[{region:orange,price:270},{region:city,price:290}]};
assert.equal(pub.publicPriceSummary(clinic,[fl]).label,'From $270.00');
assert.equal(pub.publicPriceSummary(clinic,[fl],city).label,'$290.00');
assert.equal(pub.publicPriceSummary(clinic,[fl],orange).high,290);
assert.equal(pub.publicPriceOffer(clinic,[fl],'https://example.test').lowPrice,270);
assert.equal(pub.publicPriceOffer(service,[pr],'https://example.test').price,229);
assert.equal(pub.publicPriceOffer(service,[city],'https://example.test',true).availability,'https://schema.org/OutOfStock');
const la=region('county','Louisiana','Orleans Parish');
assert.equal(pub.publicPriceSummary({...service,regionalPrices:[{region:region('county','LA','Orleans'),price:200}]},[la]).low,200);
assert.deepEqual(pub.pricingCoverage([{state:'FL',county:'Orange County',placeName:'Orlando'}]).map(r=>r.level),['city']);
assert.equal(pub.publicPriceChoices(service,[orange]).some(r=>r.state==='California'),false);
console.log('Public service prices: hierarchy, coverage, clinic/partner overrides, free services and schema passed.');

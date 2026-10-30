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
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const pricing = load('src/lib/regionalPricing.ts');
function region(level, state, county = '', city = '', url = '') {
  const value = { level, state, county, city, label: [city, county, state].filter(Boolean).join(', '), urls: url ? [url] : [] };
  return { ...value, id: pricing.regionId(level, value) };
}
const florida = region('state', 'Florida', '', '', 'https://florida.mydripnurse.com');
const orange = region('county', 'Florida', 'Orange', '', 'https://orange-county.mydripnurse.com');
const orlando = region('city', 'Florida', 'Orange', 'Orlando', 'https://orlando-city.mydripnurse.com');
const rules = [{ region: florida, price: 229 }, { region: orange, price: 239 }, { region: orlando, price: 249 }];
const resolve = (location, subset = rules, override) => pricing.resolveRegionalPrice(219, subset, location, override);
assert.equal(resolve().price, 219);
assert.equal(resolve({ state: 'FL' }).price, 229);
assert.equal(resolve({ state: 'Florida', county: 'Orange County' }).price, 239);
assert.equal(resolve({ state: 'FL', county: 'Orange County', city: 'Orlando city' }).price, 249);
assert.equal(resolve({ state: 'California', county: 'Orange', city: 'Orlando' }).price, 219);
assert.equal(resolve(orlando, rules.slice(0, 2)).price, 239);
assert.equal(resolve(orlando, rules, 180).price, 180);
assert.equal(resolve(orlando, rules, 0).price, 0);
assert.equal(resolve(orlando, [{ region: orlando, price: 0 }]).price, 0);
const shortCity = region('city', 'Florida', 'Test', 'Orange');
const fullCity = region('city', 'Florida', 'Test', 'Orange City');
assert.equal(resolve(fullCity, [{ region: shortCity, price: 199 }, { region: fullCity, price: 249 }]).price, 249);
const pr = region('city', 'Puerto Rico', '', 'San Juan');
assert.equal(resolve({ state: 'PR', county: 'San Juan Municipio', city: '' }, [{ region: pr, price: 199 }]).price, 199);
const la = region('county', 'Louisiana', 'Orleans');
assert.equal(resolve({ state: 'LA', county: 'Orleans Parish' }, [{ region: la, price: 209 }]).price, 209);
assert.equal(pricing.regionForHost([florida, orange, orlando], 'orlando-city.mydripnurse.com').id, orlando.id);
assert.equal(pricing.regionForHost([orlando, { ...orange, urls: orlando.urls }], orlando.urls[0]), null);
assert.equal(pricing.pricingHost('https://mydripnurse.com.attacker.example'), '');
assert.equal(pricing.pricingHost('javascript:alert(1)'), '');
assert.equal(pricing.pricingHost('https://user@florida.mydripnurse.com'), '');
assert.deepEqual(pricing.readRegionalPrices([{ price: -1, region: orlando }, { price: 1, region: { ...orlando, id: 'fake' } }]), []);

function cacheHarness() {
  const memo = new Map();
  return { unstable_cache(fn, keys, config) {
    const key = keys.join(':');
    return async (...args) => {
      const k = key + JSON.stringify(args);
      if (!memo.has(k)) memo.set(k, { value: fn(...args), tags: config.tags || [] });
      try { return await memo.get(k).value; } catch (e) { memo.delete(k); throw e; }
    };
  }, revalidateTag(tag) { for (const [key, value] of memo) if (value.tags.includes(tag)) memo.delete(key); } };
}
(async () => {
  const cache = cacheHarness();
  const headers = ['State', 'County', 'City', 'Status', 'Location Id', 'Domain Created', 'Domain', 'City Domain'];
  function tab(name, rows) { return { sheetName: name, headerMap: new Map(headers.map((h, i) => [h, i])), rows }; }
  let countyTab = tab('Counties', [
    ['Florida', 'Orange', '', true, 'loc1', true, orange.urls[0], ''],
    ['Florida', 'Inactive', '', false, 'loc2', true, 'https://inactive.mydripnurse.com', ''],
    ['California', 'Orange', '', true, 'loc3', false, 'https://orange-ca.mydripnurse.com', ''],
  ]);
  const cityTab = tab('Cities', [
    ['Florida', 'Orange', 'Orlando', true, 'loc4', true, '', orlando.urls[0]],
    ['Puerto Rico', 'Puerto Rico', 'San Juan', true, 'loc5', true, '', 'https://san-juan-city.mydripnurse.com'],
    ['Florida', 'Orange', 'Wrong domain', true, 'loc6', true, '', 'https://example.com'],
    ['Florida', 'Orange', 'Parent domain only', true, 'loc7', true, orange.urls[0], ''],
  ]);
  let stored = '', writes = 0, reads = 0;
  const db = { getDbPool: () => ({ query: async (sql, args) => {
    if (sql.startsWith('insert')) { stored = args[3]; writes++; return { rows: [] }; }
    if (sql.includes("module = 'search_builder_indexes'")) return { rows: [{ key_value: JSON.stringify({ items: [], states: [{ stateName: 'Florida', stateUrl: florida.urls[0] }] }) }] };
    reads++; return { rows: stored ? [{ key_value: stored }] : [] };
  } }) };
  const catalog = load('src/lib/regionalPricingCatalog.ts', {
    'next/cache': cache, '@/lib/db': db,
    '@/lib/myDripNurseServiceCatalog': { getMyDripNurseOrganizationId: async () => 'tenant-test' },
    '@/lib/tenantSheets': { getTenantSheetConfig: async () => ({ spreadsheetId: 'test', countyTab: 'Counties', cityTab: 'Cities' }), loadTenantSheetTabIndex: async args => args.sheetName === 'Counties' ? countyTab : cityTab },
  });
  const snapshot = await catalog.syncPricingRegions();
  assert(snapshot.regions.some(r => r.id === orlando.id));
  assert(snapshot.regions.some(r => r.city === 'San Juan' && r.county === ''));
  assert(!snapshot.regions.some(r => r.county === 'Inactive' || r.state === 'California' || r.city === 'Wrong domain' || r.city === 'Parent domain only'));
  assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(Buffer.from(stored, 'base64'))), snapshot);
  const first = await catalog.loadPricingRegions();
  const readCount = reads;
  await catalog.loadPricingRegions(); await catalog.loadPricingRegions();
  assert.equal(reads, readCount, 'Repeated reads must hit the shared cache, not Neon');
  assert.equal((await catalog.validateRegionalPrices([{ regionId: orlando.id, price: 249 }]))[0].region.urls[0], orlando.urls[0]);
  await assert.rejects(() => catalog.validateRegionalPrices([{ regionId: 'made-up', price: 1 }]));
  await assert.rejects(() => catalog.validateRegionalPrices([{ regionId: orlando.id, price: 1 }, { regionId: orlando.id, price: 2 }]));
  countyTab = { ...countyTab, headerMap: new Map() };
  await assert.rejects(() => catalog.syncPricingRegions(), /missing State/);
  assert.equal(writes, 1, 'A failed sync must preserve the last good catalog');
  assert.deepEqual(await catalog.loadPricingRegions(), first);

  let serviceReads = 0, regionReads = 0;
  const serviceCache = cacheHarness();
  class NextResponse extends Response { static json(data, init) { return new NextResponse(JSON.stringify(data), init); } }
  const route = load('src/app/api/public/service-media/route.ts', {
    'next/cache': serviceCache, 'next/server': { NextResponse },
    '@/lib/regionalPricingCatalog': { loadPricingRegions: async () => { regionReads++; return { regions: [florida, orange, orlando] }; } },
    '@/lib/myDripNurseServices': { loadCurrentMyDripNurseServiceMedia: async () => { serviceReads++; return [{ id: 'test', name: 'Test IV', imageUrl: '/image.png', landingPath: '/iv', price: '$219', basePrice: 219, currency: 'USD', regionalPrices: rules }]; } },
    '@/lib/publicRequestDiagnostics': { logPublicRequestDiagnostic: () => {} },
  });
  const response = await route.GET(new Request('https://care.mydripnurse.com/api/public/service-media?v=regional-v1&site=orlando-city.mydripnurse.com'));
  const data = await response.json();
  assert.equal(data.services[0].price, '$249.00');
  assert(!('regionalPrices' in data.services[0]), 'Do not send all pricing rules to every visitor');
  assert(!('basePrice' in data.services[0]));
  assert.match(response.headers.get('cache-control'), /s-maxage=300/);
  const national = await route.GET(new Request('https://care.mydripnurse.com/api/public/service-media?v=regional-v1&site=mydripnurse.com'));
  assert.equal((await national.json()).services[0].price, '$219.00');
  assert.equal(regionReads, 1, 'Nationwide pages do not need the region snapshot');
  const unknown = await route.GET(new Request('https://care.mydripnurse.com/api/public/service-media?v=regional-v1&site=unmapped.mydripnurse.com'));
  assert.equal((await unknown.json()).services[0].price, '', 'Never advertise an unverified regional price');
  assert.equal(serviceReads, 1, 'All hosts share a single cached catalog read');
  serviceCache.revalidateTag(pricing.SERVICE_PRICING_TAG);
  await route.GET(new Request('https://care.mydripnurse.com/api/public/service-media'));
  assert.equal(serviceReads, 2, 'A service save must invalidate the catalog');
  let availabilityQueries = 0;
  const available = load('src/lib/serviceBookingAvailability.ts', {
    '@/lib/db': { getDbPool: () => ({ query: async sql => {
      availabilityQueries++;
      return { rows: sql.includes('with calendar as') ? [{ public_key: 'test', service_slug: 'test', service_name: 'Test IV', duration_minutes: 60, currency: 'USD', price: '219', regional_prices: rules, deposit_type: 'percentage', deposit_value: '40', minimum_notice_minutes: 120, eligible_count: 2, slots: [
        { startsAt: '2027-01-01T12:00:00Z', endsAt: '2027-01-01T13:00:00Z', timezone: 'America/New_York', partnerId: 'one', partnerSlug: 'one', displayName: 'Synthetic one', businessName: '', profilePhotoUrl: '', loadScore: 0, priceOverride: null },
        { startsAt: '2027-01-01T12:00:00Z', endsAt: '2027-01-01T13:00:00Z', timezone: 'America/New_York', partnerId: 'two', partnerSlug: 'two', displayName: 'Synthetic two', businessName: '', profilePhotoUrl: '', loadScore: 1, priceOverride: 180 },
      ] }] : [] };
    } }) },
    '@/lib/bookingEngineSchema': { ensureBookingEngineSchema: async () => {} },
    '@/lib/bookingPolicy': { BOOKING_MINIMUM_NOTICE_MINUTES: 120 },
    '@/lib/canonicalGeography': {
      resolveCanonicalGeographyByCoordinates: async () => ({ stateName: 'Florida', countyName: 'Orange County', placeName: 'Orlando city', countyGeoid: '12095' }),
      resolveCanonicalCountyByName: async () => ({ stateName: 'Florida', countyName: 'Orange County', placeName: '', countyGeoid: '12095' }),
    },
  });
  const quote = await available.loadBookingAvailability({ publicKey: 'test', date: '2027-01-01', coverage: { state: 'Wrong', county: 'Wrong', latitude: 28.5, longitude: -81.3 } });
  assert.equal(quote.calendar.price, 249);
  assert.deepEqual(quote.slots[0].partners.map(partner => partner.price), [249, 180]);
  assert.equal(availabilityQueries, 2, 'Regional quotes reuse the existing expiration and availability queries');
  await assert.rejects(() => available.loadBookingAvailability({ publicKey: 'test', date: '2027-01-01', coverage: { state: 'FL', county: 'Orange' } }), /verify the complete/);
  // Exercise the real checkout function with a synthetic database and Stripe adapter.
  const calls = []; let charged = 0;
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  let facts = { service_id: 'service', calendar_id: 'calendar', organization_id: 'org', service_name: 'Test IV', service_slug: 'test', duration_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0, price: '219', price_override: null, regional_prices: rules, deposit_type: 'percentage', deposit_value: '40', currency: 'USD' };
  const query = async (sql, args = []) => {
    calls.push({ sql, args });
    if (sql.includes('select id') && sql.includes('from app.booking_customers')) return { rows: [{ id: 'customer' }] };
    if (sql.includes('select candidate.partner_profile_id')) return { rows: [{ partner_profile_id: 'partner' }] };
    if (sql.includes('s.id as service_id')) return { rows: [facts] };
    if (sql.includes('insert into app.appointments (')) return { rows: [{ id: 'appointment' }] };
    return { rows: [] };
  };
  const checkout = load('src/lib/appointmentBooking.ts', {
    '@/lib/db': { getDbPool: () => ({ query, connect: async () => ({ query, release() {} }) }) },
    '@/lib/bookingEngineSchema': { ensureBookingEngineSchema: async () => {} },
    '@/lib/serviceBookingAvailability': { loadBookingAvailability: async () => ({ calendar: { serviceName: 'Test IV', currency: 'USD' }, geography: { stateName: 'Florida', countyName: 'Orange County', placeName: 'Orlando city', stateFips: '12', countyFips: '095', countyGeoid: '12095', placeGeoid: '1253000', source: 'census_coordinates' }, coverageAvailable: true, slots: [{ startsAt, partners: [{ id: 'partner' }] }] }) },
    '@/lib/stripeCheckout': { getStripePublishableKey: () => 'pk_test', createStripeCheckoutSession: async args => { charged = args.amountCents; return { id: 'fake', status: 'open', url: 'https://example.test' }; } },
    '@/lib/bookingPolicy': { BOOKING_MINIMUM_NOTICE_MINUTES: 120 },
    '@/lib/stripePaymentLifecycle': { sendConfirmedAppointmentAutomations: async () => {} },
    '@/lib/clientRewards': {}, '@/lib/clientPortalAuth': { ensureClientPortalSchema: async () => {} },
    '@/lib/bookingAttribution': { attributionSessionSummary: async () => null },
  });
  const input = { publicKey: 'mdn-test', date: startsAt.slice(0,10), startsAt, timezone: 'America/New_York', customer: { fullName: 'Synthetic test', email: 'test@example.invalid', phone: '+15555555555' }, address: { addressLine1: 'Test address', state: 'CA', county: 'Wrong county', city: 'Wrong city', latitude: 28.5, longitude: -81.3 }, medicalScreening: { noneSelected: true, selected: ['none'] }, expectedPrice: 249 };
  await checkout.createAppointmentCheckout(input);
  assert.equal(charged, 9960, 'Deposit is 40% of verified-address price, not the source page or unverified address text');
  const inserted = calls.find(call => call.sql.includes('insert into app.appointments ('));
  assert.equal(inserted.args[27], 249, 'Appointment stores the agreed price snapshot');
  const metadata = calls.find(call => call.sql.includes('update app.appointments') && call.sql.includes('metadata = metadata'));
  assert.equal(JSON.parse(metadata.args[1]).pricing.regionId, orlando.id);
  charged = 0; calls.length = 0;
  facts = { ...facts, regional_prices: [{ region: orlando, price: 259 }] };
  await assert.rejects(() => checkout.createAppointmentCheckout(input), /price has changed/);
  assert.equal(charged, 0, 'Stale quotes must never start a charge');
  assert(calls.some(call => call.sql === 'rollback'));
  assert(!calls.some(call => call.sql.includes('insert into app.appointments (')));

  console.log('Regional pricing: hierarchy, address normalization, partner override, zero price, PR/LA, host safety, Sheet filters, failed sync preservation, validation and cache checks passed. No network, payments or production writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });

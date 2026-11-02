const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/clinicDnsDisplay.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const compiled = { exports: {} };
new Function('exports', 'module', outputText)(compiled.exports, compiled);
const { dnsHostForZone, isDnsZoneForHost } = compiled.exports;
assert.equal(dnsHostForZone('_mdn-verify.care.devasks.com', 'devasks.com'), '_mdn-verify.care');
assert.equal(dnsHostForZone('care.devasks.com', 'devasks.com'), 'care');
assert.equal(dnsHostForZone('_mdn-verify.care.clinic.co.uk', 'clinic.co.uk'), '_mdn-verify.care');
assert.equal(dnsHostForZone('care.team.clinic.com', 'clinic.com'), 'care.team');
assert.equal(dnsHostForZone('care.clinic.com', 'care.clinic.com'), '@');
assert.equal(dnsHostForZone('_mdn-verify.care.clinic.com', 'care.clinic.com'), '_mdn-verify');
assert.equal(dnsHostForZone('CARE.DEVASKS.COM.', ' DEVASKS.COM. '), 'care');
assert.equal(dnsHostForZone('_vercel.clinic.com', 'care.clinic.com'), '_vercel.clinic.com');
assert.equal(dnsHostForZone('care.otherdevasks.com', 'devasks.com'), 'care.otherdevasks.com');
for (const zone of ['', 'com', 'https://devasks.com', 'devasks.com/path', '.devasks.com', 'other.com']) {
    assert.equal(isDnsZoneForHost('care.devasks.com', zone), false, zone);
    assert.equal(dnsHostForZone('care.devasks.com', zone), 'care.devasks.com', zone);
}
console.log('Clinic DNS display checks passed: relative hosts, delegated zones, full-name fallback and domain boundaries.');

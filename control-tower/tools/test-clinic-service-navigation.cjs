const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/clinicServiceNavigation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = { exports: {} };new Function('exports', code)(m.exports);
const source = [
 { id: 'uuid-one', slug: 'alleviate', name: 'Alleviate', imageUrl: '', price: 219 },
 { id: 'uuid-two', slug: 'nad-plus', name: 'NAD+', imageUrl: '', price: 229 },
 { id: 'uuid-three', slug: 'nad-plus-boost', name: 'NAD+ Boost', imageUrl: '', price: 249 },
 { id: 'uuid-four', slug: 'vitamin-injections', name: 'Vitamin Injections', imageUrl: '', price: 89 },
];
const groups = m.exports.clinicServiceGroups(source);
assert.deepEqual(groups.map(g => [g.id, g.services.map(s => s.id)]), [['iv-therapy',['uuid-one']], ['nad',['uuid-two','uuid-three']], ['vitamins',['uuid-four']]]);
assert.equal(groups[1].services[0],source[1], 'Grouping preserves original prices and service data');
assert.deepEqual(m.exports.clinicServiceGroups([]), []);
assert.deepEqual(m.exports.clinicServiceGroups([source[1]]).map(g => g.id), ['nad'], 'No unavailable categories are invented');
console.log('PASS: UUID-backed catalog categorization, no duplicated services, original pricing retained, empty categories omitted. No network or database.');

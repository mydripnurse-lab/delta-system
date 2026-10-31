// Build a compact, names-only catalog. Template domains are intentionally omitted.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../../resources/statesFiles');
const result = {};
for (const file of fs.readdirSync(source).filter(f => f.endsWith('.json')).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(source, file), 'utf8'));
    result[file.slice(0, -5)] = (data.counties || []).filter(c => c.countyName)
        .map(c => [c.countyName, (c.cities || []).map(city => city.cityName).filter(Boolean)]);
}
fs.writeFileSync(path.resolve(__dirname, '../src/data/pricing-geography.json'), JSON.stringify(result) + '\n');
console.log(`Built geography for ${Object.keys(result).length} state/territory files, without querying Neon.`);

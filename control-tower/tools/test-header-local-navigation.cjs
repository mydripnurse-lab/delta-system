const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/embeds/mdn-seo-head.js'), 'utf8');
function run(page, urls, readyState = 'complete') {
  const nodes = urls.map(href => ({href, getAttribute() {return this.href;}, setAttribute(key,value) {assert.equal(key,'href');this.href=value;}}));
  const events = {};
  const document = {readyState, querySelectorAll(selector) {assert.equal(selector,'[data-mdn-ghl-header] a[href]');return nodes;}, addEventListener(name,fn) {events[name]=fn;}};
  const location = new URL(page);
  const window = {location, addEventListener(name,fn) {events[name]=fn;}};
  vm.runInNewContext(source, {window,document,location,URL});
  return {nodes,events};
}
const marketing = ['https://mydripnurse.com','https://www.mydripnurse.com/mobile-iv-therapy-alleviate?source=menu#price','//mydripnurse.com/select-your-mobile-iv-therapy'];
const untouched = ['https://care.mydripnurse.com/login','https://partners.mydripnurse.com/portal','tel:+13219896446','mailto:care@example.com','#details','/hydration-mobile-iv-therapy','https://example.com/','https://mydripnurse.com.evil.invalid/'];
for (const host of ['mydripnurse.com','orange-county.mydripnurse.com','puerto-rico.mydripnurse.com','clinic.example.com']) {
 const {nodes}=run(`https://${host}/services/nested`,[...marketing,...untouched]);
 assert.deepEqual(nodes.slice(0,3).map(n=>n.href),[`https://${host}/`,`https://${host}/mobile-iv-therapy-alleviate?source=menu#price`,`https://${host}/select-your-mobile-iv-therapy`]);
 assert.deepEqual(nodes.slice(3).map(n=>n.href),untouched);
}
for(const url of ['file:///tmp/header.html','https://care.mydripnurse.com/embeds/header','https://partners.mydripnurse.com/','https://app.devasks.com/preview','https://example.vercel.app/']) {
 assert.deepEqual(run(url,marketing).nodes.map(n=>n.href),marketing);
}
const later=run('https://orange-county.mydripnurse.com/',[],'loading');
later.nodes.push({href:marketing[1],getAttribute(){return this.href;},setAttribute(k,v){this.href=v;}});
later.events.DOMContentLoaded();
assert.equal(later.nodes[0].href,'https://orange-county.mydripnurse.com/mobile-iv-therapy-alleviate?source=menu#price');
later.nodes[0].href=marketing[1];
later.events.click({target:{closest:()=>true}});
assert.equal(later.nodes[0].href,'https://orange-county.mydripnurse.com/mobile-iv-therapy-alleviate?source=menu#price');
const html=fs.readFileSync(path.join(root,'public/embeds/ghl-site-header.html'),'utf8');
assert.ok((html.match(/href="\//g)||[]).length>90,'Desktop and mobile navigation use local paths');
assert.doesNotMatch(html,/href="https?:\/\/(www\.)?mydripnurse\.com/);
assert.match(html,/care&#46;mydripnurse&#46;com\/embed\/site-header\/account/);
assert.match(html,/cache:"force-cache"/);
console.log('PASS: regional/custom domains, desktop/mobile source links, nested paths, query/hash preservation, late GHL mount, central portals, preview exclusions. No database/network calls.');

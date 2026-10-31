/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CommonJS harness for transpiled route and client modules. */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const ts = require(path.join(root,'node_modules/typescript'));
const {NextRequest} = require(path.join(root,'node_modules/next/server'));
const src = ts.transpileModule(fs.readFileSync('src/proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',src)((n)=>n==='next/server'?require(path.join(root,'node_modules/next/server')):{deploymentSurface:()=> 'combined'},mod,mod.exports);
function response(url){return mod.exports.proxy(new NextRequest(url,{headers:{host:new URL(url).host}}));}
const h='https://partners.mydripnurse.com';
for(const [from,to] of [['/','/partner-network'],['/login?mode=apply','/partner-login?mode=apply'],['/portal','/partner-portal'],['/portal/clinics','/clinic-portal'],['/keishla?ref=directory&directoryPartnerId=abc','/partner-site/keishla?ref=directory&directoryPartnerId=abc'],['/keishla/services/alleviate/book?ref=directory','/partner-site/keishla/services/alleviate/book?ref=directory']]) assert.equal(response(h+from).headers.get('x-middleware-rewrite'),h+to);
for(const p of ['/directory','/directory/clinics','/clinics/register','/clinics/test','/api/public/partner-directory/events']) assert.equal(response(h+p).headers.get('x-middleware-next'),'1');
for(const [from,to] of [['/clinics?page=2','/directory/clinics?page=2'],['/partners-directory?preview=1','/directory?preview=1']]) {const r=response(h+from);assert.equal(r.status,308);assert.equal(r.headers.get('location'),h+to);}
assert.equal(response('https://care.mydripnurse.com/login').headers.get('x-middleware-rewrite'),'https://care.mydripnurse.com/client-login');
console.log('14 host-routing, legacy redirect and attribution-preservation checks passed.');
// Execute the actual attribution effect without network or database access.
const attrib=ts.transpileModule(fs.readFileSync('src/components/partner/PartnerDirectoryAttribution.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let callback,cleanup;const storage=new Map();const requests=[];
global.window={location:{search:'?ref=directory&directoryPartnerId=nurse-1'},sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null}};
global.document={addEventListener:(n,f)=>callback=f,removeEventListener:()=>{}};
global.Element=class{closest(){return {getAttribute:()=>'/keishla/services/alleviate/book'}}};
global.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:true}};
const am={exports:{}};new Function('require','module','exports',attrib)(()=>({useEffect:fn=>cleanup=fn()}),am,am.exports);
am.exports.PartnerDirectoryAttribution({partnerProfileId:'nurse-1'});
const key='mdn:directory-attribution';assert.equal(JSON.parse(storage.get(key)).partnerId,'nurse-1');
callback({target:new Element()});callback({target:new Element()});assert.equal(requests.length,1);assert.deepEqual(requests[0].body,{partnerProfileIds:['nurse-1'],event:'booking_click'});
for (const attribution of [{partnerId:'nurse-2',at:Date.now()},{partnerId:'nurse-1',at:Date.now()-25*3600000}]) {storage.set(key,JSON.stringify(attribution));callback({target:new Element()});}
assert.equal(requests.length,1);cleanup();console.log('Attribution records the matching nurse, avoids duplicates and rejects expired/other-nurse clicks. No external calls made.');

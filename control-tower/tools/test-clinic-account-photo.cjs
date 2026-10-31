/* Synthetic uploads only: no network, Blob writes or production database. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sharp = require('sharp');
let identity = null, originAllowed = true, budgetAllowed = true, queries = [], uploads = [];
const mocks = {
 'next/server': {NextResponse: {json: (body, init) => Response.json(body, init)}},
 '@vercel/blob': {put: async (key, bytes, options) => {uploads.push({key, bytes, options}); return {url:'https://example.invalid/avatar-unique.webp'};}},
 '@/lib/clinicAuth': {getClinicIdentity:async()=>identity, requireClinicOrigin:()=>{if(!originAllowed)throw Error('Origin');}},
 '@/lib/clinicRequestBudget': {consumeClinicRequestBudget:()=>budgetAllowed},
 '@/lib/db': {getDbPool:()=>({query:async(sql,args)=>{queries.push({sql,args});return {rowCount:1};}})},
};
const loaded = {exports:{}};
const source = fs.readFileSync(path.join(__dirname,'../src/app/api/clinics/account-photo/route.ts'),'utf8');
new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>name in mocks?mocks[name]:require(name),loaded,loaded.exports);
const request=(bytes,type='image/png',extra={})=>{const form=new FormData();form.set('file',new File([bytes],'fixture.png',{type}));form.set('email','someone-else@example.invalid');form.set('partnerId','other-person');return new Request('https://example.invalid/api/clinics/account-photo',{method:'POST',body:form,headers:extra});};
(async()=>{
 const photo=await sharp({create:{width:800,height:600,channels:4,background:'#084f5e'}}).png().toBuffer();
 assert.equal((await loaded.exports.POST(request(photo))).status,401);
 identity={email:'owner@example.invalid',partnerId:''};
 originAllowed=false;assert.equal((await loaded.exports.POST(request(photo))).status,400);originAllowed=true;
 budgetAllowed=false;assert.equal((await loaded.exports.POST(request(photo))).status,429);budgetAllowed=true;
 assert.equal((await loaded.exports.POST(request(photo,'image/png',{'content-length':String(4*1024*1024)}))).status,413);
 assert.equal((await loaded.exports.POST(request('fake png'))).status,400);
 assert.equal((await loaded.exports.POST(request('<svg/>','image/svg+xml'))).status,400);
 assert.equal((await loaded.exports.POST(request(Buffer.alloc(2*1024*1024+1)))).status,400);
 assert.equal(uploads.length,0);assert.equal(queries.length,0);
 let response=await loaded.exports.POST(request(photo));assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.match(queries[1].sql,/update app.clinic_accounts set profile_photo_url/);
 assert.equal(queries[1].args[0],identity.email,'Upload cannot target another account');
 const metadata=await sharp(uploads[0].bytes).metadata();assert.equal(metadata.width,400);assert.equal(metadata.height,400);assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);
 queries=[];identity={email:'nurse@example.invalid',partnerId:'own-nurse-profile'};
 response=await loaded.exports.POST(request(photo));assert.equal(response.status,200);
 assert.match(queries[1].sql,/update app.partner_profiles set clinic_avatar_url=/);
 assert(!queries[1].sql.includes('profile_photo_url'),'Public nurse photo remains unchanged');
 assert.equal(queries[1].args[0],identity.partnerId);
 assert(uploads.every(upload=>upload.options.addRandomSuffix),'Unique URLs prevent stale avatars');
 console.log('PASS: ownership, origin, request budget, size/format validation, image decoding/crop, private caching, independent nurse photo, unique avatar URLs. No external requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});

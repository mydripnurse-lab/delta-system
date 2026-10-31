/* Upload and image allowlist regression. Synthetic data; no DB/network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { hasRemoteMatch } = require('next/dist/shared/lib/match-remote-pattern');
const root = path.join(__dirname, '..');
function load(file, mocks={}) {
 const m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports','__dirname',code)(name=>name in mocks?mocks[name]:require(name),m,m.exports,root);
 return m.exports;
}
const loadedConfig=load('next.config.ts');
const config=loadedConfig.default || loadedConfig;
for (const host of ['fixture.public.blob.vercel-storage.com','another-store.public.blob.vercel-storage.com']) {
 assert(hasRemoteMatch([], config.images.remotePatterns, new URL(`https://${host}/partner-profile-photos/fixture/profile-new.jpg`)));
}
assert(!hasRemoteMatch([], config.images.remotePatterns,new URL('https://fixture.public.blob.vercel-storage.com/private/secret.jpg')));
assert(!hasRemoteMatch([], config.images.remotePatterns,new URL('https://untrusted.example/partner-profile-photos/fixture/profile.jpg')));
let saved=true, uploadCount=0, invalidations=[];
let profile={id:'fixture',displayName:'Fixture Nurse',businessName:'',publicTitle:'Registered Nurse',professionalCredentials:'RN',biography:'Existing professional biography.',profilePhotoUrl:'https://fixture.public.blob.vercel-storage.com/partner-profile-photos/fixture/profile-old.jpg'};
const mocks={
 'next/cache':{revalidateTag:(...args)=>invalidations.push(args)},
 '@/lib/clinicPolicy':{CLINIC_TEAM_CACHE_TAG:'clinic-public-team'},
 '@/lib/partnerPortalAuth':{getPartnerPortalSession:async()=>({profile_id:profile.id})},
 '@/lib/partnerProfiles':{getPartnerProfileForPortal:async()=>profile, updatePartnerPortalProfile:async(input)=>{if(saved && input.profilePhoto) profile={...profile,profilePhotoUrl:input.profilePhoto.url}; return saved;}},
 '@vercel/blob':{put:async(name,bytes,options)=>{uploadCount++;assert.equal(options.addRandomSuffix,true);assert.equal(options.access,'public');return {url:`https://fixture.public.blob.vercel-storage.com/partner-profile-photos/fixture/profile-${uploadCount}.jpg`,pathname:name};}},
};
const {PATCH}=load('src/app/api/partner-portal/profile/route.ts',mocks);
function request(withPhoto) {
 const form=new FormData();for(const key of ['displayName','businessName','publicTitle','professionalCredentials','biography'])form.set(key,profile[key]);
 if(withPhoto)form.set('profilePhoto',new File([new Uint8Array([255,216,255])],'fixture.jpg',{type:'image/jpeg'}));
 return new Request('https://partners.mydripnurse.com/api/partner-portal/profile',{method:'PATCH',headers:{Origin:'https://partners.mydripnurse.com'},body:form});
}
(async()=>{
 let r=await PATCH(request(true));assert.equal(r.status,200);
 const first=(await r.json()).profile.profilePhotoUrl;
 assert(first.endsWith('profile-1.jpg'));
 assert.deepEqual(invalidations,[['clinic-public-team',{expire:0}]]);
 invalidations=[];
 r=await PATCH(request(false));assert.equal(r.status,200);assert.equal((await r.json()).profile.profilePhotoUrl,first);assert.equal(uploadCount,1);assert.deepEqual(invalidations,[]);
 r=await PATCH(request(true));assert.equal(r.status,200);assert.notEqual((await r.json()).profile.profilePhotoUrl,first);
 saved=false;invalidations=[];r=await PATCH(request(true));assert.equal(r.status,404);assert.deepEqual(invalidations,[]);
 console.log('PASS: Blob photos allowed only on upload path; unique URLs refresh changed photos; missing photo preserves previous image; team cache expires only on successful photo save.');
})().catch(e=>{console.error(e);process.exitCode=1;});

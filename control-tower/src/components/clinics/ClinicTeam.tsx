'use client';
import { useEffect, useRef, useState } from 'react';
import type { Clinic } from '@/lib/clinics';
import type { ClinicTeamSummary, ClinicTeamMember } from '@/lib/clinicTeam';
import type { ClinicService } from './ClinicServiceCatalog';
import { ClinicMemberServices } from './ClinicMemberServices';
import { ClinicCoverage } from './ClinicCoverage';
import { ClinicNurseAvailability } from './ClinicOwnerAvailability';
import { CLINIC_AFFILIATE_POLICY_TEXT } from '@/lib/clinicAffiliatePolicy';
import styles from './clinic.module.css';
import team from './clinicTeam.module.css';

type Props={clinic:Clinic;services:ClinicService[];owner:boolean};
async function request(url:string,options?:RequestInit){
    const response=await fetch(url,options);const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Unable to complete this request.');return body;
}
const json=(body:unknown,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const roleLabel=(member:ClinicTeamSummary)=>member.role==='owner'?'Owner':member.role==='manager'?'Clinic administrator':member.canManage?'Nurse · Administrator':'Nurse';
export function ClinicTeam({clinic,services,owner}:Props){
    const [view,setView]=useState<string>('list'),[revision,setRevision]=useState(0),[notice,setNotice]=useState('');
    const dirty=useRef(false),heading=useRef<HTMLHeadingElement>(null);
    useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
    useEffect(()=>{heading.current?.focus();},[view]);
    function navigate(next:string){if(dirty.current&&!window.confirm('Discard unsaved changes?'))return;dirty.current=false;setView(next);}
    function changed(message:string){setRevision(n=>n+1);setNotice(message);}
    return <section className={styles.card}>
        <div className={team.heading}><div>{view!=='list'?<button type="button" className={team.back} onClick={()=>navigate('list')}>← Back to team</button>:null}<h2 ref={heading} tabIndex={-1}>{view==='list'?'Your team':view==='invite'?'Add team member':'Member profile'}</h2><p>{view==='list'?'People, availability and clinic access.':view==='invite'?'Invite someone to join your clinic with their own account.':'Manage this person’s role and nursing availability.'}</p></div>{view==='list'?<button className={styles.primary} disabled={clinic.status!=='approved'} onClick={()=>navigate('invite')}>+ Add team member</button>:null}</div>
        <div hidden={view!=='list'}><TeamList clinicId={clinic.id} revision={revision} onOpen={navigate}/></div>
        {view==='invite'?<TeamInvitation clinic={clinic} services={services} owner={owner} onCreated={()=>changed('Invitation created.')} onDirty={value=>{dirty.current=value;}}/>:view!=='list'?<TeamProfile key={view} clinic={clinic} services={services} owner={owner} memberId={view} onSaved={changed} onDirty={value=>{dirty.current=value;}}/>:null}
        {notice?<div className={styles.saveToast} role="status">✓ {notice}</div>:null}
    </section>;
}
function TeamList({clinicId,revision,onOpen}:{clinicId:string;revision:number;onOpen:(id:string)=>void}){
    const [draft,setDraft]=useState(''),[query,setQuery]=useState({search:'',offset:0}),[items,setItems]=useState<ClinicTeamSummary[]>([]),[more,setMore]=useState(false),[settled,setSettled]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
    const requestKey=JSON.stringify([clinicId,query,revision,retry]);
    const loading=settled!==requestKey;
    useEffect(()=>{
        const controller=new AbortController();
        void request(`/api/clinics/team?clinicId=${clinicId}&search=${encodeURIComponent(query.search)}&offset=${query.offset}`,{signal:controller.signal}).then(body=>{if(controller.signal.aborted)return;setItems(body.items);setMore(body.hasMore);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setSettled(requestKey);});
        return()=>controller.abort();
    },[clinicId,query,requestKey]);
    return <>
        <form className={team.search} onSubmit={e=>{e.preventDefault();setQuery({search:draft.trim(),offset:0});}}><label className={styles.field}>Find a team member<input type="search" maxLength={120} placeholder="Search by name or email" value={draft} onChange={e=>setDraft(e.target.value)}/></label><button className={styles.secondary} disabled={loading}>Search</button></form>
        {error&&!loading?<p role="alert" className={styles.error}>{error} <button onClick={()=>setRetry(n=>n+1)}>Try again</button></p>:null}
        {loading?<p role="status">Loading team…</p>:!error?<><ul className={team.list} aria-label="Clinic team">{items.map(member=><li key={member.id}><button className={team.person} onClick={()=>onOpen(member.id)}><span className={team.avatar} aria-hidden="true">{member.name.slice(0,1).toUpperCase()}</span><span className={team.identity}><strong>{member.name}</strong><small>{member.email}</small></span><span className={team.role}>{roleLabel(member)}</span><span className={styles.badge}>{member.status}</span><span className={team.arrow} aria-hidden="true">↗</span></button></li>)}</ul>{!items.length?<p className={styles.empty}>{query.search?'No team members match your search.':'Your team will appear here. Start by adding a team member.'}</p>:null}<div className={team.pagination}><span>Page {Math.floor(query.offset/25)+1} · {items.length} people</span><div className={styles.actions}><button className={styles.secondary} disabled={!query.offset} onClick={()=>setQuery({...query,offset:Math.max(0,query.offset-25)})}>Previous</button><button className={styles.secondary} disabled={!more} onClick={()=>setQuery({...query,offset:query.offset+25})}>Next</button></div></div></>:null}
        <details className={team.policy}><summary>Team invitations and referral policy</summary><p>Existing nurses keep their account, website, availability and history. Invitations must be accepted before clinic authorization.</p><p>{CLINIC_AFFILIATE_POLICY_TEXT}</p></details>
    </>;
}
function TeamInvitation({clinic,services,owner,onCreated,onDirty}:Props&{onCreated:()=>void;onDirty:(dirty:boolean)=>void}){
    const [role,setRole]=useState<'nurse'|'manager'>('nurse'),[email,setEmail]=useState(''),[selected,setSelected]=useState<string[]>([]),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
    async function submit(){setBusy(true);setError('');try{const body=await request('/api/clinics',json({action:'invite',clinicId:clinic.id,email,role,serviceIds:role==='nurse'?selected:undefined}));setUrl(body.inviteUrl);onDirty(false);onCreated();}catch(e){setError(e instanceof Error?e.message:'Unable to create invitation.');}finally{setBusy(false);}}
    return <>{error?<p className={styles.error} role="alert">{error}</p>:null}{url?<div className={team.invitation}><h3>Invitation ready</h3><p>Share this private link only with {email}. It expires in 7 days.</p><label className={styles.field}>Private invitation link<input readOnly value={url}/></label><button className={styles.secondary} onClick={()=>void navigator.clipboard.writeText(url).then(()=>setCopied(true)).catch(()=>setError('Copy the invitation link from the field above.'))}>{copied?'Copied':'Copy invitation link'}</button></div>:<form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={busy} className={team.fieldset}><div className={styles.grid}><label className={styles.field}>Email address<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>{setEmail(e.target.value);onDirty(true);}}/></label><label className={styles.field}>Team role<select value={role} onChange={e=>{setRole(e.target.value as 'nurse'|'manager');onDirty(true);}}><option value="nurse">Nurse</option>{owner?<option value="manager">Clinic administrator · Non-clinical</option>:null}</select></label></div>{role==='nurse'?<><p className={styles.muted}>The owner can add administrator access from this nurse’s profile after activation.</p><ClinicMemberServices services={services} value={selected} onChange={ids=>{setSelected(ids);onDirty(true);}}/></>:<p>This person can manage the clinic. This role alone does not make them available for patient appointments.</p>}<button className={styles.primary} disabled={clinic.status!=='approved'}>{busy?'Creating invitation…':'Create invitation'}</button></fieldset></form>}</>;
}
function TeamProfile({clinic,services,owner,memberId,onSaved,onDirty}:Props&{memberId:string;onSaved:(message:string)=>void;onDirty:(dirty:boolean)=>void}){
    const [member,setMember]=useState<ClinicTeamMember|null>(null),[tab,setTab]=useState('profile'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[admin,setAdmin]=useState(false);
    const dirty=useRef(false);
    function markDirty(value:boolean){dirty.current=value;onDirty(value);}
    useEffect(()=>{const controller=new AbortController();void request(`/api/clinics/team?clinicId=${clinic.id}&memberId=${memberId}`,{signal:controller.signal}).then(body=>{if(controller.signal.aborted)return;setMember(body.member);setAdmin(body.member.canManage);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[clinic.id,memberId,retry]);
    function changeTab(next:string){if(dirty.current&&!window.confirm('Discard unsaved changes?'))return;if(dirty.current){setRetry(n=>n+1);markDirty(false);}setTab(next);}
    async function save(status:string){if(!member)return;setBusy(true);setError('');try{
        if(tab==='access')await request('/api/clinics/team',json({clinicId:clinic.id,memberId,enabled:admin},'PATCH'));
        else await request('/api/clinics',json({action:'member',clinicId:clinic.id,id:memberId,status,coverageIds:member.coverage.map(r=>r.id),serviceIds:member.serviceIds===null?undefined:member.serviceIds.filter(id=>services.some(s=>s.id===id&&s.canOffer&&s.configured))}));
        markDirty(false);setRetry(n=>n+1);onSaved('Changes saved.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to save profile.');}finally{setBusy(false);}}
    if(!member)return error?<p role="alert" className={styles.error}>{error} <button onClick={()=>setRetry(n=>n+1)}>Try again</button></p>:<p role="status">Loading member profile…</p>;
    const editable=member.role!=='owner'&&(owner||!member.canManage);
    const scheduleReady=member.hasPractice&&!!member.partnerId&&member.status==='active'&&!!member.acceptedAt&&!!member.authorizedAt;
    return <>
        <div className={team.profile}><span className={team.avatar} aria-hidden="true">{member.name.slice(0,1).toUpperCase()}</span><div><h3>{member.name}</h3><p>{member.email}</p><span className={styles.badge}>{roleLabel(member)} · {member.status}</span></div></div>
        <nav className={team.tabs} aria-label="Team member sections">{[['profile','Profile'],...(member.hasPractice?[['services','Services'],['coverage','Coverage'],['schedule','Availability']]:[]),['access','Access']].map(([value,label])=><button type="button" key={value} disabled={busy} aria-pressed={tab===value} onClick={()=>changeTab(value)}>{label}</button>)}</nav>
        {error?<p className={styles.error} role="alert">{error}</p>:null}
        <fieldset className={team.fieldset} disabled={busy}>
        {tab==='profile'?<><dl className={team.facts}><div><dt>Professional credentials</dt><dd>{member.credentials||'Not provided'}</dd></div><div><dt>Invitation</dt><dd>{member.acceptedAt?'Accepted':'Awaiting acceptance'}</dd></div><div><dt>Website & directory</dt><dd>{member.hasPractice?(member.publicationReady&&clinic.published?'Published':'Pending activation or publication'):'Not applicable'}</dd></div></dl>{member.publicationReady&&clinic.published&&member.profileSlug?<a href={`/${encodeURIComponent(member.profileSlug)}`} target="_blank" rel="noreferrer" className={styles.secondary}>View nurse website ↗</a>:null}{member.role==='owner'?<p className={styles.muted}>The owner manages their nursing enrollment in Clinic profile → My nursing practice.</p>:null}{editable&&member.acceptedAt?<div className={team.footer}>{member.status!=='active'?<button className={styles.primary} onClick={()=>void save('active')}>Authorize & activate</button>:<button className={styles.secondary} onClick={()=>{if(window.confirm('Suspend this person’s clinic membership? Open appointments must be resolved first.'))void save('suspended');}}>Suspend membership</button>}</div>:null}{!member.acceptedAt?<p className={styles.muted}>This person must accept their invitation before you can activate their profile.</p>:null}</>:null}
        {tab==='services'?<ClinicMemberServices services={services} value={member.serviceIds} disabled={!editable} onChange={serviceIds=>{setMember({...member,serviceIds});markDirty(true);}}/>:null}
        {tab==='coverage'?<fieldset disabled={!editable} className={team.fieldset}><ClinicCoverage value={member.coverage} onChange={coverage=>{setMember({...member,coverage});markDirty(true);}}/></fieldset>:null}
        {tab==='schedule'?(scheduleReady?<ClinicNurseAvailability key={`${memberId}:${retry}`} endpoint={`/api/clinics/team/availability?clinicId=${clinic.id}&memberId=${memberId}`} onDirtyChange={markDirty}/>:<p className={styles.notice}>Activate this nursing profile to manage its schedule here.</p>):null}
        {tab==='access'?<div className={team.access}><h3>Clinic administrator</h3><p>Manage the team, appointments, availability, website, services and clinic reports. Nursing responsibilities and the nurse’s own portal remain available.</p><label><input type="checkbox" checked={admin} disabled={!owner||member.role!=='nurse'} onChange={e=>{setAdmin(e.target.checked);markDirty(true);}}/><span>Allow this person to administer the clinic</span></label><p className={styles.muted}>{member.role==='owner'?'The owner always retains full access.':member.role==='manager'?'This non-clinical account has administrator access. Suspend its membership to remove clinic access.':'Only the clinic owner can grant or revoke administrator access. Activate the nurse first.'}</p>{owner&&member.role==='nurse'?<button className={styles.primary} disabled={admin&&member.status!=='active'} onClick={()=>void save(member.status)}>Save access</button>:null}</div>:null}
        {(tab==='services'||tab==='coverage')&&editable?<div className={team.footer}><button className={styles.primary} disabled={!member.acceptedAt} onClick={()=>void save(member.status==='pending'?'active':member.status==='active'?'active':'suspended')}>{busy?'Saving…':member.status==='pending'?'Authorize & save':'Save changes'}</button></div>:null}
        </fieldset>
    </>;
}

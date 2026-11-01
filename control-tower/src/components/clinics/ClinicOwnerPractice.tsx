'use client';
import { useEffect, useState } from 'react';
import type { OwnerPractice } from '@/lib/clinicOwnerPractice';
import type { ClinicService } from './ClinicServiceCatalog';
import { ClinicMemberServices } from './ClinicMemberServices';
import { ClinicOwnerAvailability } from './ClinicOwnerAvailability';
import { ClinicCoverage } from './ClinicCoverage';
import styles from './clinic.module.css';
import practice from './clinicOwnerPractice.module.css';

export function ClinicOwnerPractice({clinicId,approved,bookingsEnabled,services,onAppointments}:{clinicId:string;approved:boolean;bookingsEnabled:boolean;services:ClinicService[];onAppointments:(partnerId:string)=>void}) {
    const [showAvailability,setShowAvailability]=useState(false);
    const [data,setData]=useState<OwnerPractice|null>(null);
    const [activated,setActivated]=useState(false);
    const [error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
    useEffect(()=>{
        const controller=new AbortController();
        setData(null);setActivated(false);setShowAvailability(false);setError('');
        void fetch(`/api/clinics/practice?clinicId=${clinicId}`,{signal:controller.signal}).then(async r=>{
            const body=await r.json();if(!r.ok)throw new Error(body.error);
            setData(body.data);setActivated(body.data.eligible);
        }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load your nursing profile.');});
        return()=>controller.abort();
    },[clinicId]);
    useEffect(()=>{if(!saved)return;const timer=setTimeout(()=>setSaved(false),4000);return()=>clearTimeout(timer);},[saved]);
    async function save(event:React.FormEvent<HTMLFormElement>){
        event.preventDefault();
        if(!data)return;setBusy(true);setError('');setSaved(false);
        try{
            const r=await fetch('/api/clinics/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                clinicId,enabled:data.enabled,serviceIds:data.serviceIds,coverageIds:data.coverage.map(r=>r.id),
                ...(!data.eligible&&data.enabled?{nursingProfile:{name:data.name,credentials:data.credentials,phone:data.phone,publicProfileConsent:data.publicProfileConsent}}:{})
            })});
            const body=await r.json();if(!r.ok)throw new Error(body.error);
            setData(body.data);setActivated(body.data.eligible);setSaved(true);
            if(body.data.enabled)setShowAvailability(true);
        }catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}
    }
    return <section className={`${styles.card} ${practice.panel}`} aria-labelledby="owner-practice-heading">
        <header className={practice.intro}>
        <h2 id="owner-practice-heading">My nursing practice</h2>
        <p>Provide care and manage your clinic with one account. Set up your nursing profile, choose your services and set your hours here.</p>
        </header>
        {error?<p className={styles.error} role="alert">{error}</p>:null}
        {!data&&!error?<p role="status">Loading your nursing profile…</p>:null}
        {data?<>
            <p className={styles.notice}>{data.partnerId?'Your nursing profile is linked. Your website address, availability and appointment history stay with you.':'Activating your practice creates your nursing website and directory profile with your clinic’s branding. No additional account is needed.'}</p>
            <form onSubmit={save}>
                <fieldset disabled={busy||!approved} className={practice.formBody}>
                    <label className={practice.enableOption} data-checked={data.enabled}>
                        <input type="checkbox" aria-describedby="practice-enable-help" checked={data.enabled} onChange={e=>setData({...data,enabled:e.target.checked})}/>
                        <span><strong>I also provide nursing services</strong><span id="practice-enable-help">Include me in my clinic’s care team.</span></span>
                    </label>
                    {data.enabled?<div className={practice.details}>
                        {!data.eligible?<>
                            <section className={practice.profileFields} aria-labelledby="practice-profile-heading">
                            <h3 id="practice-profile-heading">Your nursing profile</h3>
                            <div className={`${styles.grid} ${practice.fields}`}>
                                <label className={styles.field}>Professional name<input autoComplete="name" required minLength={2} maxLength={120} value={data.name||''} onChange={e=>setData({...data,name:e.target.value})}/></label>
                                <label className={styles.field}>Professional credentials<input required maxLength={250} placeholder="Your nursing credentials" value={data.credentials} onChange={e=>setData({...data,credentials:e.target.value})}/></label>
                                <label className={styles.field}>Mobile number<input type="tel" autoComplete="tel" required maxLength={16} pattern="\+[1-9][0-9]{7,14}" placeholder="+1…" value={data.phone} onChange={e=>setData({...data,phone:e.target.value})}/></label>
                            </div>
                            <label className={styles.policyConsent}><input type="checkbox" required checked={data.publicProfileConsent} onChange={e=>setData({...data,publicProfileConsent:e.target.checked})}/><span>I confirm my nursing credentials and authorize publication of my professional profile in the directory and on my clinic-branded website.</span></label>
                            </section>
                        </>:null}
                        <ClinicMemberServices services={services} value={data.serviceIds} onChange={serviceIds=>setData({...data,serviceIds:serviceIds||[]})} disabled={busy}/>
                        <section className={practice.coverage} aria-labelledby="practice-coverage-heading">
                        <h3 id="practice-coverage-heading">Your service areas</h3>
                        <ClinicCoverage value={data.coverage} onChange={coverage=>setData({...data,coverage})}/>
                        </section>
                    </div>:null}
                    <div className={practice.saveActions}>
                    <button type="submit" className={styles.primary} disabled={busy||data.enabled&&(!data.serviceIds.length||!data.coverage.length)}>{busy?'Saving…':!activated&&data.enabled?'Activate & set my hours →':'Save nursing practice'}</button>
                    </div>
                </fieldset>
            </form>
            {!approved?<p className={styles.notice}>Your clinic must be approved before you enable your nursing practice.</p>:null}
            {activated?<div className={practice.management}>
                <p>Accept or decline your visits in the clinic calendar, or reassign to an available nurse. Your clinic collects the remaining balance and any voluntary tip.</p>
                <div className={styles.actions}>
                    <button type="button" disabled={!approved} className={styles.secondary} onClick={()=>data.partnerId&&onAppointments(data.partnerId)}>View my appointments →</button>
                    <button type="button" className={styles.secondary} disabled={!approved} aria-expanded={showAvailability} onClick={()=>setShowAvailability(value=>!value)}>Manage my availability</button>
                    {data.slug?<a className={styles.secondary} href={`https://partners.mydripnurse.com/${data.slug}`} target="_blank" rel="noreferrer">My nursing website ↗</a>:null}
                </div>
                {showAvailability&&approved?<ClinicOwnerAvailability clinicId={clinicId}/>:null}
                {!data.hasAvailability&&!showAvailability?<p className={styles.notice}>Set your availability before clients can find appointment times with you.</p>:null}
                {!bookingsEnabled?<p className={styles.notice}>Online clinic booking is not enabled yet. You can prepare your profile and schedule now.</p>:null}
            </div>:null}
        </>:null}
        {saved?<div className={styles.saveToast} role="status" aria-live="polite"><span className={styles.saveToastIcon} aria-hidden="true">✓</span>Changes saved.</div>:null}
    </section>;
}

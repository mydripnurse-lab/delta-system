'use client';
import { useEffect, useState } from 'react';
import type { OwnerPractice } from '@/lib/clinicOwnerPractice';
import type { ClinicService } from './ClinicServiceCatalog';
import { ClinicMemberServices } from './ClinicMemberServices';
import { ClinicOwnerAvailability } from './ClinicOwnerAvailability';
import { ClinicCoverage } from './ClinicCoverage';
import styles from './clinic.module.css';

export function ClinicOwnerPractice({clinicId,approved,bookingsEnabled,services,onAppointments}:{clinicId:string;approved:boolean;bookingsEnabled:boolean;services:ClinicService[];onAppointments:(partnerId:string)=>void}) {
    const [showAvailability,setShowAvailability]=useState(false);
    const [data,setData]=useState<OwnerPractice|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
    useEffect(()=>{
        const controller=new AbortController();
        void fetch(`/api/clinics/practice?clinicId=${clinicId}`,{signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);setData(body.data);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load your nursing profile.');});
        return()=>controller.abort();
    },[clinicId]);
    useEffect(()=>{if(!saved)return;const timer=setTimeout(()=>setSaved(false),4000);return()=>clearTimeout(timer);},[saved]);
    async function save(){
        if(!data)return;setBusy(true);setError('');setSaved(false);
        try{
            const r=await fetch('/api/clinics/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clinicId,enabled:data.enabled,serviceIds:data.serviceIds,coverageIds:data.coverage.map(r=>r.id)})});
            const body=await r.json();if(!r.ok)throw new Error(body.error);
            setSaved(true);
        }catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}
    }
    return <section className={styles.card} aria-labelledby="owner-practice-heading">
        <h2 id="owner-practice-heading">My nursing practice</h2>
        <p>Manage your clinic and provide care with the same account. Clients book an available nurse based on their address, service and appointment time.</p>
        {error?<p className={styles.error} role="alert">{error}</p>:null}
        {!data&&!error?<p role="status">Loading your nursing profile…</p>:null}
        {data?<><p className={styles.notice}>{data.eligible?`Your existing nursing profile${data.name?' · '+data.name:''} is linked. Your website, availability and appointment history stay with you.`:'A nursing profile reviewed by My Drip Nurse is required before you can receive appointments. Clinic ownership alone does not activate clinical services.'}</p>
        {!data.eligible?<div className={styles.actions}>{!data.partnerId?<a className={styles.primary} href="/partner-login?mode=apply">Complete nurse application →</a>:null}<a className={styles.secondary} href="mailto:info@mydripnurse.com">Request profile review</a></div>:<>
        <fieldset disabled={busy||!approved} style={{border:0,padding:0,margin:0}}>
            <label className={styles.row}><span><strong>I also provide nursing services</strong><br/><span className={styles.muted}>Include me in my clinic’s care team.</span></span><input type="checkbox" checked={data.enabled} onChange={e=>setData({...data,enabled:e.target.checked})}/></label>
            {data.enabled?<><ClinicMemberServices services={services} value={data.serviceIds} onChange={serviceIds=>setData({...data,serviceIds:serviceIds||[]})} disabled={busy}/><ClinicCoverage value={data.coverage} onChange={coverage=>setData({...data,coverage})}/></>:null}
            <button type="button" className={styles.primary} disabled={busy||data.enabled&&(!data.serviceIds.length||!data.coverage.length)} onClick={()=>void save()}>{busy?'Saving…':'Save nursing practice'}</button>
        </fieldset>
        {!approved?<p className={styles.notice}>Your clinic must be approved before you enable your nursing practice.</p>:null}
        <p>Accept or decline your assigned visits in the clinic calendar. If you need another nurse, choose an available team member with Reassign. Your clinic collects the remaining balance and any voluntary tip.</p>
        <div className={styles.actions}><button type="button" disabled={!approved} className={styles.secondary} onClick={()=>data.partnerId&&onAppointments(data.partnerId)}>View my appointments →</button><button type="button" className={styles.secondary} disabled={!approved} aria-expanded={showAvailability} onClick={()=>setShowAvailability(value=>!value)}>Manage my availability</button>{data.slug?<a className={styles.secondary} href={`https://partners.mydripnurse.com/${data.slug}`} target="_blank" rel="noreferrer">My nursing website ↗</a>:null}</div>
        {showAvailability&&approved?<ClinicOwnerAvailability clinicId={clinicId}/>:null}
        {!data.hasAvailability&&!showAvailability?<p className={styles.notice}>Set your availability before clients can find appointment times with you.</p>:null}
        {!bookingsEnabled?<p className={styles.notice}>Online clinic booking is not enabled yet. Enabling your nursing practice does not open bookings by itself.</p>:null}
        </>}</>:null}
        {saved?<div className={styles.saveToast} role="status" aria-live="polite"><span className={styles.saveToastIcon} aria-hidden="true">✓</span>Changes saved.</div>:null}
    </section>;
}

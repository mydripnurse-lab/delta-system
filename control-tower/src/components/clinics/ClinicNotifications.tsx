'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClinicInboxItem } from '@/lib/clinicPortalNotifications';
import styles from './clinicCalendar.module.css';
const labels: Record<string,string>={partner_declined:'A nurse declined an appointment',deposit_refund_failed:'Deposit refund needs review',appointment_created:'New reservation',appointment_confirmed:'Awaiting nurse acceptance',appointment_partner_acknowledged:'Appointment accepted',appointment_in_progress:'Visit started',appointment_completed:'Visit completed',appointment_cancelled:'Appointment cancelled',appointment_refunded:'Appointment refunded',appointment_failed:'Appointment failed',appointment_reassigned:'Nurse assignment changed',appointment_rescheduled:'Appointment rescheduled',appointment_payment_pending:'Deposit pending'};
export function ClinicNotifications({clinicId,onAppointment,revision=0}:{clinicId:string;onAppointment:(id:string)=>void;revision?:number}) {
    const [items,setItems]=useState<ClinicInboxItem[]>([]),[next,setNext]=useState<string|null>(null),[unread,setUnread]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
    const panel=useRef<HTMLDetailsElement>(null),controller=useRef<AbortController|null>(null);
    const load=useCallback(async(cursor?:string)=>{
        controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
        try {const r=await fetch(`/api/clinics/notifications?${new URLSearchParams({clinicId,...(cursor?{cursor}:{})})}`,{signal:abort.signal});const body=await r.json();if(!r.ok)throw new Error(body.error);
            setItems(old=>cursor?[...old,...body.data.items]:body.data.items);setNext(body.data.next);setUnread(body.data.unread);
        } catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Unable to load notifications.');}finally{if(!abort.signal.aborted)setBusy(false);}
    },[clinicId]);
    useEffect(()=>{void load();return()=>controller.current?.abort();},[load,revision]);
    async function read(ids:string[]) {
        if(!ids.length)return;setBusy(true);setError('');
        try {const r=await fetch('/api/clinics/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clinicId,ids})});if(!r.ok)throw new Error('Unable to mark notifications as read.');await load();}
        catch(e){setError(e instanceof Error?e.message:'Please try again.');setBusy(false);}
    }
    return <details ref={panel} className={styles.inbox} onToggle={e=>{const expanded=e.currentTarget.open;setOpen(expanded);if(expanded)void load();}} onKeyDown={e=>{if(e.key==='Escape'&&panel.current){panel.current.open=false;panel.current.querySelector('summary')?.focus();}}}>
        <summary aria-label={`Notifications, ${unread>=100?'99+':unread} unread`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21h4" /></svg><span>Notifications</span>{unread>0?<b className={styles.count}>{unread>=100?'99+':unread}</b>:null}</summary>
        {open?<section className={styles.inboxPanel} aria-label="Clinic notifications"><header><strong>Team activity</strong><button type="button" disabled={busy} onClick={()=>void load()}>Refresh</button></header><p className={styles.muted}>Updates for appointments managed by your clinic.</p>
        {error?<p role="alert" className={styles.error}>{error}</p>:null}
        {!items.length?<p className={styles.empty}>{busy?'Loading updates…':'You’re all caught up. New appointment updates will appear here.'}</p>:items.map(item=><button type="button" key={item.id} className={`${styles.inboxItem} ${!item.read?styles.unread:''}`} onClick={()=>{void read([item.id]);if(panel.current)panel.current.open=false;onAppointment(item.appointmentId);}}><strong>{labels[item.eventType]||'Appointment updated'}</strong><span>{item.reference} · {item.serviceName}</span><small>Current nurse: {item.nurseName}</small><time>{new Date(item.createdAt).toLocaleString('en-US')}</time></button>)}
        <footer>{next?<button type="button" disabled={busy} onClick={()=>void load(next)}>Older updates</button>:null}<button type="button" disabled={busy||!items.some(i=>!i.read)} onClick={()=>void read(items.filter(i=>!i.read).map(i=>i.id))}>Mark displayed as read</button></footer></section>:null}
    </details>;
}

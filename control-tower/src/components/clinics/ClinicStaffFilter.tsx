'use client';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { staffSelected, toggleStaff, type StaffSelection } from '@/lib/clinicStaffSelection';
import styles from './clinicCalendar.module.css';
export type CalendarStaff = { id:string; name:string };
export function ClinicStaffFilter({clinicId,selection,onChange,colors,onStaffLoaded}:{clinicId:string;selection:StaffSelection;onChange:(next:StaffSelection)=>void;colors:Record<string,string>;onStaffLoaded:(items:CalendarStaff[])=>void}) {
    const [search,setSearch]=useState(''),[items,setItems]=useState<CalendarStaff[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const controller=useRef<AbortController|null>(null);
    const cache=useRef(new Map<string,{items:CalendarStaff[];next:string|null}>());
    async function load(cursor?:string,signal?:AbortSignal){
        const key=JSON.stringify([clinicId,search,cursor]);setBusy(true);setError('');
        try{
            let data=cache.current.get(key);
            if(!data){const response=await fetch(`/api/clinics/appointments?${new URLSearchParams({clinicId,mode:'staff',search,...(cursor?{cursor}:{})})}`,{signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'Unable to load staff.');data=body.data;if(data){if(cache.current.size>=30)cache.current.clear();cache.current.set(key,data);}}
            if(signal?.aborted||!data)return;
            setItems(old=>cursor?[...old,...data.items]:data.items);setNext(data.next);onStaffLoaded(data.items);
        }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Unable to load staff.');}
        finally{if(!signal?.aborted)setBusy(false);}
    }
    // Search is debounced; the roster is loaded in pages of 50, not with every calendar view.
    useEffect(()=>{controller.current?.abort();const abort=new AbortController();controller.current=abort;setItems([]);setNext(null);setBusy(true);const timer=setTimeout(()=>void load(undefined,abort.signal),250);return()=>{clearTimeout(timer);controller.current?.abort();}; // load intentionally follows only search and clinic, not selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[clinicId,search]);
    function toggle(id:string){const value=toggleStaff(selection,id);if(value.ids.filter(x=>x!=='unassigned').length>200){setError('You can filter up to 200 individual nurses. Choose All staff to include the entire team.');return;}onChange(value);}
    const row=(person:CalendarStaff)=><label key={person.id} className={styles.staffCheck} style={{'--staff-color':colors[person.id]||'#64748b'} as CSSProperties}><input type="checkbox" checked={staffSelected(selection,person.id)} onChange={()=>toggle(person.id)}/><span className={styles.staffDot} aria-hidden="true"/><span>{person.name}</span></label>;
    return <aside className={styles.staffPanel} aria-label="Staff calendar filters"><header><h3>Your team</h3><span>{selection.mode==='all'?'All staff':selection.mode==='include'?`${selection.ids.length} selected`:`All except ${selection.ids.length}`}</span></header><label className={styles.staffSearch}>Search staff<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a nurse" /></label><div className={styles.staffControls}><button type="button" onClick={()=>{setError('');onChange({mode:'all',ids:[]});}}>Select all</button><button type="button" onClick={()=>{setError('');onChange({mode:'include',ids:[]});}}>Clear</button></div><p className={styles.staffHint}>Selection includes staff on other pages. Colors identify nurses; appointment labels show their names.</p><div className={styles.staffRows}>{!search?row({id:'unassigned',name:'Unassigned visits'}):null}{items.map(row)}</div>{busy?<p role="status" className={styles.muted}>Loading staff…</p>:null}{!busy&&!items.length&&!error?<p className={styles.muted}>No nurses match your search.</p>:null}{error?<p role="alert" className={styles.error}>{error}</p>:null}{next?<button type="button" className={styles.staffLoadMore} disabled={busy} onClick={()=>{controller.current?.abort();const abort=new AbortController();controller.current=abort;void load(next,abort.signal);}}>Load more nurses</button>:null}</aside>;
}

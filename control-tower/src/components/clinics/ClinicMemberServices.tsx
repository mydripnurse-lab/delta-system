'use client';
import { useId, useState } from 'react';
import type { ClinicService } from './ClinicServiceCatalog';
import styles from './clinicServices.module.css';

export function ClinicMemberServices({ services, value, onChange, disabled = false }: {
    services: ClinicService[]; value: string[] | null; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
    const [search, setSearch] = useState('');
    const searchId = useId();
    const available = services.filter(s => s.configured && s.canOffer);
    const selected = value ?? available.map(s => s.id);
    const visible = available.filter(s => s.name.toLowerCase().includes(search.trim().toLowerCase()));
    return <fieldset disabled={disabled} className={styles.selection}>
        <legend>Assigned services</legend>
        <p>Choose what this nurse can provide for your clinic. These services appear on their website and service pages while offered by the clinic. Existing appointments stay unchanged.</p>
        <div className={styles.selectionHeading}><label htmlFor={searchId}>Find a service</label><span>{available.filter(s => selected.includes(s.id)).length} selected</span></div>
        <input id={searchId} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clinic services" />
        <div className={styles.options}>{visible.map(s => <label key={s.id} className={styles.option}>
            <input type="checkbox" checked={selected.includes(s.id)} onChange={e => onChange(e.target.checked ? [...new Set([...selected, s.id])] : selected.filter(id => id !== s.id))} />
            <span>{s.name}<small>{s.availabilityStatus === 'paused' ? 'Paused by clinic · Hidden from websites' : s.availabilityStatus === 'out_of_stock' ? 'Out of stock · Booking unavailable' : 'Offered by clinic'}</small></span>
        </label>)}</div>
        {!visible.length ? <p>{available.length ? 'No services match your search.' : 'Offer services in your clinic’s Services tab before assigning them to a nurse.'}</p> : null}
        <small>Nurse stock and availability also apply. Changes are saved with the invitation or member profile.</small>
    </fieldset>;
}

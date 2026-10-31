'use client';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import styles from './clinic.module.css';
import catalog from './clinicServices.module.css';

export type ClinicService = {
    id: string; name: string; imageUrl: string | null; description: string | null;
    ingredients: string[] | null; availabilityStatus: 'active' | 'paused' | 'out_of_stock';
    defaultPrice: string; clinicPrice: string | null; currency: string;
};
export function ClinicServiceCatalog({ clinicId, services, onRefresh }: {
    clinicId: string; services: ClinicService[]; onRefresh: () => Promise<void>;
}) {
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    async function send(body: Record<string, unknown>) {
        const response = await fetch('/api/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, clinicId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to save. Please try again.');
    }
    async function change(serviceId: string, status: ClinicService['availabilityStatus']) {
        setBusy(true); setError(''); setNotice('');
        try { await send({ action: 'service', serviceId, status }); await onRefresh(); setNotice('Service availability updated.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'Unable to update service.'); }
        finally { setBusy(false); }
    }
    async function suggest(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        setBusy(true); setError(''); setNotice('');
        try {
            await send({ action: 'suggest_service', type: data.get('type'), name: data.get('name'), details: data.get('details'), ingredients: String(data.get('ingredients') || '').split('\n').map(s => s.trim()).filter(Boolean) });
            form.reset(); setNotice('Your suggestion was sent to My Drip Nurse for review.');
        } catch (e) { setError(e instanceof Error ? e.message : 'Unable to send suggestion.'); }
        finally { setBusy(false); }
    }
    const filtered = services.filter(s => s.name.toLowerCase().includes(search.toLowerCase().trim()));
    return <section className={styles.card}>
        <div className={catalog.heading}><div><h2>Services</h2><p>Manage the services your clinic offers.</p></div><span>{services.filter(s => s.availabilityStatus === 'active').length} offered · {services.length} available</span></div>
        <p>My Drip Nurse manages your catalog and regional prices. Pause hides a service from your clinic website. Out of stock keeps its page visible but prevents new bookings. Existing appointments stay unchanged.</p>
        <label className={styles.field}>Find a service<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services" /></label>
        {error ? <p role="alert" className={styles.notice}>{error}</p> : null}
        {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
        <div aria-busy={busy}>{filtered.map(s => <article key={s.id} className={catalog.service}>
            {s.imageUrl ? <Image unoptimized width={80} height={80} className={catalog.image} src={s.imageUrl} alt={s.name} /> : <div className={catalog.placeholder} aria-hidden="true">✦</div>}
            <div className={catalog.description}><div className={catalog.title}><h3>{s.name}</h3><span className={catalog.status}>{s.availabilityStatus === 'active' ? 'Offered' : s.availabilityStatus === 'paused' ? 'Paused' : 'Out of stock'}</span></div><p>{s.description}</p>
                <small>{s.clinicPrice === null ? 'Uses My Drip Nurse regional pricing' : `Clinic default: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency }).format(Number(s.clinicPrice))}`} · Final price depends on the service address.</small>
                {s.ingredients?.length ? <p className={catalog.ingredients}>{s.ingredients.join(' · ')}</p> : null}
            </div>
            <div className={catalog.actions}>{s.availabilityStatus === 'paused' ? <button disabled={busy} className={styles.primary} onClick={() => change(s.id, 'active')}>Offer service</button> : <><button disabled={busy} className={styles.secondary} onClick={() => change(s.id, 'paused')}>Pause</button><button disabled={busy} className={styles.secondary} onClick={() => change(s.id, s.availabilityStatus === 'out_of_stock' ? 'active' : 'out_of_stock')}>{s.availabilityStatus === 'out_of_stock' ? 'Back in stock' : 'Out of stock'}</button></>}</div>
        </article>)}</div>
        {!filtered.length ? <p className={styles.empty}>{services.length ? 'No services match your search.' : 'My Drip Nurse has not enabled any services for your clinic yet. You can suggest one below.'}</p> : null}
        <details className={catalog.suggestions}><summary>Suggest a service or recipe</summary><p>Send an idea to the My Drip Nurse team. Suggestions do not change your live catalog or pricing.</p>
            <form onSubmit={suggest}><fieldset disabled={busy} className={catalog.form}><div className={styles.grid}>
                <label className={styles.field}>Suggestion type<select name="type"><option value="service">New service</option><option value="recipe">Recipe</option><option value="other">Other</option></select></label>
                <label className={styles.field}>Name<input required minLength={2} maxLength={160} name="name" /></label>
            </div><label className={styles.field}>Ingredients <small>Optional · One per line</small><textarea name="ingredients" rows={3} maxLength={8000} /></label>
                <label className={styles.field}>Details<textarea name="details" rows={4} maxLength={4000} /></label>
                <button className={styles.primary} type="submit">{busy ? 'Saving…' : 'Send suggestion'}</button>
            </fieldset></form>
        </details>
    </section>;
}

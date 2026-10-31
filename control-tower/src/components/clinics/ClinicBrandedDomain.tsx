'use client';
import { useEffect, useState } from 'react';
import type { ClinicDomainSettings } from '@/lib/clinicDomainPolicy';
import styles from './clinicDomain.module.css';

export function ClinicBrandedDomain({ clinicId, approved }: { clinicId: string; approved: boolean }) {
    const [settings, setSettings] = useState<ClinicDomainSettings | null>(null);
    const [hostname, setHostname] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirmRemove, setConfirmRemove] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/clinics/domain?clinicId=${encodeURIComponent(clinicId)}`, { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error('Unable to load domain settings.'); setSettings(await r.json()); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
        return () => controller.abort();
    }, [clinicId]);
    async function change(action: 'connect' | 'verify' | 'disconnect') {
        setBusy(true); setError(''); setNotice('');
        try {
            const response = await fetch('/api/clinics/domain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, action, hostname }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Unable to update the connection.');
            setSettings(payload); setNotice(payload.notice); setConfirmRemove(false); setHostname('');
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update the connection.'); }
        finally { setBusy(false); }
    }
    const domain = settings?.domain;
    const ready = settings?.enabled && settings.configured && approved;
    return <section className={styles.card} aria-labelledby="clinic-domain-title" aria-busy={busy}>
        <header><div><span className={styles.eyebrow}>Your website address</span><h2 id="clinic-domain-title">Branded domain</h2><p>Your clinic website, on a subdomain you own. One secure login for your clinic and nursing team.</p></div><span className={styles.badge}>{domain?.status === 'active' ? 'DNS verified' : domain ? 'Awaiting connection' : 'Not connected'}</span></header>
        {!settings && !error ? <p>Loading connection…</p> : null}
        {settings && !ready ? <p className={styles.notice}>{!approved ? 'My Drip Nurse must approve your clinic before you can connect a domain.' : 'Custom domain connections are being enabled by My Drip Nurse. Your existing website address remains available.'}</p> : null}
        {domain ? <><div className={styles.address}><strong>{domain.hostname}</strong>{domain.status === 'active' ? <a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer">Open website ↗</a> : null}</div><ol className={styles.steps}><li>Open DNS settings at the provider where you manage your domain.</li><li>Add these records exactly. Some providers append your root domain automatically. Keep your email and other DNS records unchanged.</li><li>Use DNS-only mode for the CNAME while connecting, then select “Verify connection”. DNS changes can take time to propagate.</li></ol><div className={styles.records}>{domain.records.map((record, index) => <div className={styles.record} key={`${record.type}-${index}`}><span className={styles.type}>{record.type}</span><div><small>{record.purpose}</small><label>Name<code>{record.name}</code></label><label>Value<code>{record.value}</code></label></div><button type="button" disabled={busy} onClick={() => void navigator.clipboard.writeText(record.value).then(() => setNotice('DNS value copied.')).catch(() => setError('Copy the DNS value manually.'))} aria-label={`Copy ${record.purpose} value`}>Copy value</button></div>)}</div><p className={styles.note}>HTTPS is provisioned automatically after verification. The website becomes public only after My Drip Nurse approves and publishes it. Login opens the secure My Drip Nurse portal and detects your team role.</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={!ready || busy || domain.status === 'disconnecting'} onClick={() => void change('verify')}>{busy ? 'Working…' : 'Verify connection'}</button><button type="button" disabled={!ready || busy} onClick={() => setConfirmRemove(true)}>Disconnect</button></div>{confirmRemove ? <div className={styles.confirm} role="alert"><p>Disconnect this domain? The branded address will stop serving your website. Your My Drip Nurse address and all appointments stay available.</p><button type="button" disabled={busy} onClick={() => void change('disconnect')}>Confirm disconnect</button><button type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep domain</button></div> : null}</> : <form className={styles.form} onSubmit={event => { event.preventDefault(); void change('connect'); }}><label>Website subdomain<input autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="care.yourclinic.com" value={hostname} onChange={e => setHostname(e.target.value)} disabled={!ready || busy} required maxLength={253}/></label><button className={styles.primary} disabled={!ready || busy || !hostname.trim()}>{busy ? 'Preparing…' : 'Connect domain →'}</button><p className={styles.note}>Use an existing domain you own. This does not purchase a domain or change your email settings.</p></form>}
        {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}{error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </section>;
}

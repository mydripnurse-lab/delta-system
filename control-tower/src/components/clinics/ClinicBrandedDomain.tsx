'use client';
import { useEffect, useState } from 'react';
import type { ClinicDomainSettings, ClinicDomainStatus } from '@/lib/clinicDomainPolicy';
import { dnsHostForZone, isDnsZoneForHost } from '@/lib/clinicDnsDisplay';
import styles from './clinicDomain.module.css';

type DomainAction = 'connect' | 'verify' | 'disconnect';

function CopyField({ label, value, recordLabel }: { label: string; value: string; recordLabel: string }) {
    const [feedback, setFeedback] = useState<'copied' | 'error' | null>(null);
    useEffect(() => {
        if (!feedback) return;
        const timeout = setTimeout(() => setFeedback(null), 2500);
        return () => clearTimeout(timeout);
    }, [feedback]);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setFeedback('copied');
        } catch {
            setFeedback('error');
        }
    }
    return <div className={styles.field}>
        <span className={styles.fieldLabel}>{label}</span>
        <div className={styles.fieldValue}>
            <code>{value}</code>
            <button type="button" className={styles.copy} onClick={() => void copy()} aria-label={`Copy ${recordLabel} ${label}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    {feedback === 'copied' ? <path d="m5 12 4 4L19 6"/> : <><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></>}
                </svg>
                {feedback === 'copied' ? 'Copied' : 'Copy'}
            </button>
        </div>
        <span role="status" className={feedback === 'error' ? styles.copyError : styles.srOnly}>{feedback === 'copied' ? `${recordLabel} ${label} copied.` : feedback === 'error' ? 'Copy unavailable. Select the text above and copy it manually.' : ''}</span>
    </div>;
}

function DnsRecords({ domain }: { domain: ClinicDomainStatus }) {
    // This is the parent DNS zone, not a guess at the registrable domain.
    // A delegated or nested subdomain can use a different zone below.
    const [zoneInput, setZoneInput] = useState(() => domain.hostname.split('.').slice(1).join('.'));
    const [fullNames, setFullNames] = useState(false);
    const zone = zoneInput.trim().toLowerCase().replace(/\.$/, '');
    const validZone = isDnsZoneForHost(domain.hostname, zone);
    return <>
        <div className={styles.zoneSummary}>
            <strong>Add these records in {validZone ? zone : 'your domain'} DNS settings</strong>
            <p>{fullNames ? 'Full record names are shown below.' : validZone ? `Name / Host contains only the part before .${zone}. Copy it as shown; do not add the domain again.` : 'Choose a valid DNS domain below. Full record names are shown until then.'}</p>
            <details className={styles.dnsOptions}>
                <summary>My provider uses a different DNS domain or full names</summary>
                <div className={styles.dnsOptionsFields}>
                    <label className={styles.zoneLabel}>Domain selected at your DNS provider
                        <input value={zoneInput} onChange={event => setZoneInput(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!validZone} aria-describedby="clinic-dns-zone-help"/>
                    </label>
                    <p id="clinic-dns-zone-help">Use the domain whose DNS records you are editing. This changes the instructions only.</p>
                    {!validZone ? <p role="alert" className={styles.error}>Enter {domain.hostname} or one of its parent domains, without https:// or a path.</p> : null}
                    <label className={styles.nameMode}><input type="checkbox" checked={fullNames} onChange={event => setFullNames(event.target.checked)}/><span>My provider requires the full record name</span></label>
                </div>
            </details>
        </div>
            <div className={styles.records}>
                {domain.records.map((record, index) => {
                    const recordLabel = `record ${index + 1} ${record.type}`;
                    return <article className={styles.record} key={`${record.type}-${record.name}-${record.value}`} aria-label={record.purpose}>
                        <div className={styles.recordHeader}>
                            <span className={styles.recordNumber}>{String(index + 1).padStart(2, '0')}</span>
                            <div><h3>{record.purpose === 'Clinic ownership verification' ? 'Verify domain ownership' : record.type === 'CNAME' ? 'Connect your website' : record.purpose}</h3><p>{record.type === 'TXT' ? 'A verification record to confirm you control this domain.' : 'Points your web address to your clinic website.'}</p></div>
                        </div>
                        <div className={styles.recordFields}>
                            <CopyField label="Type" value={record.type} recordLabel={recordLabel}/>
                            <CopyField label="Name / Host" value={fullNames || !validZone ? record.name : dnsHostForZone(record.name, zone)} recordLabel={recordLabel}/>
                            <CopyField label={record.type === 'CNAME' ? 'Value / Target' : 'Value / Content'} value={record.value} recordLabel={recordLabel}/>
                        </div>
                        {validZone && !isDnsZoneForHost(record.name, zone) ? <p className={styles.recordHint}>Add this record in the DNS settings for its own domain. The full name is shown.</p> : null}
                    </article>;
                })}
            </div>
        <details className={styles.help}>
            <summary>Help with values and other DNS settings</summary>
            <div><p><strong>Name / Host:</strong> Use the name shown in each card. An @ means the domain selected above itself. If your provider requires full names, enable that option above.</p>
                <p><strong>Value / Target:</strong> Paste the entire value exactly as shown. For TTL, keep your provider’s default or choose “Auto”.</p>
                <p>For a CNAME, use “DNS only” if your provider offers a proxy setting. Keep your email and unrelated DNS records unchanged.</p></div>
        </details>
    </>;
}

export function ClinicBrandedDomain({ clinicId, approved }: { clinicId: string; approved: boolean }) {
    const [settings, setSettings] = useState<ClinicDomainSettings | null>(null);
    const [hostname, setHostname] = useState('');
    const [action, setAction] = useState<DomainAction | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmRemove, setConfirmRemove] = useState(false);
    const busy = action !== null;
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/clinics/domain?clinicId=${encodeURIComponent(clinicId)}`, { signal: controller.signal })
            .then(async response => {
                if (!response.ok) throw new Error('Unable to load domain settings. Refresh this page to try again.');
                setSettings(await response.json());
            })
            .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
        return () => controller.abort();
    }, [clinicId]);
    async function change(nextAction: DomainAction) {
        setAction(nextAction); setError(''); setNotice('');
        try {
            const response = await fetch('/api/clinics/domain', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, action: nextAction, hostname }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Unable to update the connection.');
            setSettings(payload); setNotice(payload.notice || ''); setConfirmRemove(false); setHostname('');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to update the connection.');
        } finally { setAction(null); }
    }
    const domain = settings?.domain;
    const ready = Boolean(settings?.enabled && settings.configured && approved);
    const verified = domain?.status === 'active';
    const lastChecked = domain?.lastCheckedAt ? new Date(domain.lastCheckedAt) : null;
    const checkedLabel = lastChecked && !Number.isNaN(lastChecked.getTime()) ? lastChecked.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : null;

    return <section className={styles.card} aria-labelledby="clinic-domain-title">
        <header className={styles.header}>
            <div><span className={styles.eyebrow}>Your website address</span><h2 id="clinic-domain-title">Branded domain</h2><p>Connect your own web address to your clinic website and team portal.</p></div>
            <span className={styles.badge} data-verified={verified}>{verified ? 'DNS verified' : domain?.status === 'disconnecting' ? 'Disconnecting' : domain ? 'Setup in progress' : 'Not connected'}</span>
        </header>
        {!settings && !error ? <p role="status">Loading connection…</p> : null}
        {settings && !ready ? <p className={styles.notice}>{!approved ? 'My Drip Nurse must approve your clinic before you can connect a domain.' : 'Custom domain connections are being enabled by My Drip Nurse. Your existing website address remains available.'}</p> : null}
        {domain ? <>
            <div className={styles.address}>
                <div><span className={styles.fieldLabel}>Your branded address</span><strong>{domain.hostname}</strong></div>
                {verified ? <a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer">Open website ↗</a> : null}
            </div>
            <ol className={styles.steps}>
                <li><span aria-hidden="true">1</span><div><strong>Open your domain settings</strong><p>Sign in where you manage your domain and find “DNS” or “DNS records”.</p></div></li>
                <li><span aria-hidden="true">2</span><div><strong>Add the records below</strong><p>Create one record per card. Copy each field into the matching box at your provider.</p></div></li>
                <li><span aria-hidden="true">3</span><div><strong>Save, then verify</strong><p>Save the records at your provider, then return here and select “Verify connection”.</p></div></li>
            </ol>
            <DnsRecords key={domain.hostname} domain={domain}/>
            <div className={styles.verification} aria-busy={action === 'verify'}>
                <div className={styles.verificationHeading}>
                    <div><h3>{verified ? 'Your DNS is verified' : domain.status === 'disconnecting' ? 'Disconnection in progress' : 'Ready to check your connection?'}</h3><p>{verified ? 'HTTPS may take a few minutes to become available. Your website also needs to be published by My Drip Nurse.' : domain.status === 'disconnecting' ? 'Complete the disconnection before reconnecting this address.' : 'DNS changes can take time to appear. If a record is not found yet, check the fields and try again later.'}</p></div>
                    <button type="button" className={styles.primary} disabled={!ready || busy || domain.status === 'disconnecting'} onClick={() => void change('verify')}>{action === 'verify' ? 'Checking connection…' : 'Verify connection'}</button>
                </div>
                {checkedLabel ? <p className={styles.lastChecked}>Last checked <time dateTime={domain.lastCheckedAt!}>{checkedLabel}</time></p> : null}
                {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
            </div>
            <div className={styles.disconnect}><button type="button" disabled={!ready || busy} onClick={() => setConfirmRemove(true)}>Disconnect domain</button></div>
            {confirmRemove ? <div className={styles.confirm} role="alert"><h3>Disconnect {domain.hostname}?</h3><p>This branded address will stop serving your website. Your My Drip Nurse address and all appointments stay available.</p><div className={styles.actions}><button type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep domain</button><button type="button" disabled={busy} onClick={() => void change('disconnect')}>{action === 'disconnect' ? 'Disconnecting…' : 'Confirm disconnect'}</button></div></div> : null}
        </> : settings ? <>
            <form className={styles.form} onSubmit={event => { event.preventDefault(); void change('connect'); }}>
                <label>Website subdomain<input autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="care.yourclinic.com" value={hostname} onChange={event => setHostname(event.target.value)} disabled={!ready || busy} required maxLength={253} aria-describedby="clinic-domain-help"/></label>
                <button className={styles.primary} disabled={!ready || busy || !hostname.trim()}>{action === 'connect' ? 'Preparing records…' : 'Get connection records →'}</button>
                <p className={styles.note} id="clinic-domain-help">Use a domain you already own, such as care.yourclinic.com. You’ll receive the records to add at your domain provider.</p>
            </form>
            {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
        </> : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </section>;
}

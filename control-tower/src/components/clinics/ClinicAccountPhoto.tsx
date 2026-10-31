'use client';
import Image from 'next/image';
import { useState } from 'react';
import styles from './clinicBranding.module.css';
export function ClinicAccountPhoto({ name, photoUrl, onSaved }: { name: string; photoUrl: string; onSaved: (url: string) => void }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [failedUrl, setFailedUrl] = useState('');
    async function upload(file?: File) {
        if (!file) return;
        setError(''); setNotice('');
        if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG or WebP photo under 2 MB.'); return; }
        setBusy(true);
        try {
            const form = new FormData(); form.set('file', file);
            const response = await fetch('/api/clinics/account-photo', { method: 'POST', body: form });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Unable to save photo.');
            onSaved(payload.photoUrl); setNotice('Your personal photo has been updated.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save photo.'); }
        finally { setBusy(false); }
    }
    return <section className={styles.card}><header className={styles.heading}><div><span className={styles.eyebrow}>Your account</span><h2>Your personal profile.</h2><p>Your photo identifies you in the clinic portal. It does not replace the clinic logo or your public nurse photo.</p></div></header><div className={styles.accountRow}>{photoUrl && photoUrl !== failedUrl ? <Image unoptimized src={photoUrl} alt={`${name} profile`} className={styles.personalPhoto} width={88} height={88} onError={() => setFailedUrl(photoUrl)} /> : <span className={styles.personalPhoto}>{name.slice(0, 1).toUpperCase()}</span>}<div><h3>{name}</h3><p>Recommended: 400 × 400 px. PNG, JPG or WebP, up to 2 MB.<br />Photos are cropped to a square. Uploading saves your photo immediately.</p><label className={styles.fileButton}>{busy ? 'Saving photo…' : 'Upload personal photo'}<input aria-label="Upload personal photo" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label></div></div>{error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p className={styles.previewNote} role="status">{notice}</p> : null}</section>;
}

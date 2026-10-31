'use client';

import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import type { Clinic } from '@/lib/clinics';
import { brandTextColor } from '@/lib/clinicPolicy';
import styles from './clinicBranding.module.css';

type Brand = Pick<Clinic, 'logoUrl' | 'primaryColor' | 'accentColor'>;
const presets = [
    { name: 'Ocean', primaryColor: '#084f5e', accentColor: '#e9f3f7' },
    { name: 'Forest', primaryColor: '#244c40', accentColor: '#e8f2eb' },
    { name: 'Midnight', primaryColor: '#222d42', accentColor: '#e8ecf7' },
    { name: 'Sand', primaryColor: '#ede5d8', accentColor: '#493e35' },
];
function validLogo(value: string) { if (!value) return true; try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } }
export function ClinicWhiteLabel({ clinic, busy, onSave }: { clinic: Clinic; busy: boolean; onSave: (brand: Brand) => Promise<boolean> }) {
    const [brand, setBrand] = useState<Brand>(() => ({ logoUrl: clinic.logoUrl, primaryColor: clinic.primaryColor, accentColor: clinic.accentColor }));
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState('portal');
    const [failedLogo, setFailedLogo] = useState('');
    const dirty = brand.logoUrl !== clinic.logoUrl || brand.primaryColor !== clinic.primaryColor || brand.accentColor !== clinic.accentColor;
    const ink = brandTextColor(brand.primaryColor), accentInk = brandTextColor(brand.accentColor);
    const theme = { '--brand-primary': brand.primaryColor, '--brand-accent': brand.accentColor, '--brand-ink': ink, '--brand-accent-ink': accentInk } as CSSProperties;
    const logo = validLogo(brand.logoUrl) && brand.logoUrl && brand.logoUrl !== failedLogo ? <Image src={brand.logoUrl} alt={`${clinic.name} logo preview`} width={160} height={60} unoptimized onError={() => setFailedLogo(brand.logoUrl)} /> : <strong>{clinic.name}</strong>;
    async function upload(file?: File) {
        if (!file) return;
        setError('');
        if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG or WebP under 2 MB.'); return; }
        setUploading(true);
        try {
            const form = new FormData(); form.set('clinicId', clinic.id); form.set('file', file);
            const response = await fetch('/api/clinics/logo', { method: 'POST', body: form });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Unable to upload logo.');
            setBrand(current => ({ ...current, logoUrl: payload.url }));
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to upload logo.'); }
        finally { setUploading(false); }
    }
    return <section className={styles.card} style={theme} aria-label="White Label settings">
        <header className={styles.heading}><div><span className={styles.eyebrow}>Your brand</span><h2>Make it yours.</h2><p>One identity for your clinic portal and website. Your personal photo stays separate.</p></div><span className={styles.tag}>{dirty ? 'Unsaved changes' : 'Saved branding'}</span></header>
        <div className={styles.grid}><div className={styles.settings}>
            <section className={styles.group}><h3>Clinic logo</h3><p>Recommended: 640 × 240 px. Transparent PNG or WebP works best. JPG is also supported. Maximum 2 MB.</p><div className={styles.upload}><div className={styles.logoBox}>{logo}</div><label className={styles.fileButton}>{uploading ? 'Uploading…' : 'Upload logo'}<input aria-label="Upload clinic logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>{brand.logoUrl ? <button type="button" className={styles.textButton} disabled={busy || uploading} onClick={() => setBrand(current => ({ ...current, logoUrl: '' }))}>Remove logo</button> : null}</div><details className={styles.advanced}><summary>Use an existing image URL</summary><label>HTTPS logo URL<input type="url" value={brand.logoUrl} disabled={busy || uploading} onChange={event => { setError(''); setBrand(current => ({ ...current, logoUrl: event.target.value })); }} /></label></details>{!validLogo(brand.logoUrl) ? <p role="alert" className={styles.error}>Enter a valid HTTPS image URL.</p> : null}</section>
            <section className={styles.group}><h3>Brand colors</h3><p>Choose a palette or customize each color.</p><div className={styles.presets}>{presets.map(preset => <button type="button" disabled={busy || uploading} key={preset.name} aria-label={`Use ${preset.name} palette`} aria-pressed={brand.primaryColor === preset.primaryColor && brand.accentColor === preset.accentColor} onClick={() => setBrand(current => ({ ...current, primaryColor: preset.primaryColor, accentColor: preset.accentColor }))}><span style={{ background: preset.primaryColor }} /><span style={{ background: preset.accentColor }} />{preset.name}</button>)}</div>{(['primaryColor', 'accentColor'] as const).map((key, index) => <label className={styles.colorRow} key={key}><input type="color" aria-label={index ? 'Highlight color' : 'Menu and button color'} value={brand[key]} disabled={busy || uploading} onChange={event => setBrand(current => ({ ...current, [key]: event.target.value }))} /><span><strong>{index ? 'Highlights & selection' : 'Menu & buttons'}</strong><small>{index ? 'Selected menu items and website feature sections' : 'Portal sidebar and primary website buttons'}</small></span><code>{brand[key].toUpperCase()}</code></label>)}<div className={styles.contrast}><span aria-hidden="true">Aa</span><p><strong>Automatic text contrast</strong><br />Menu text: {ink === '#ffffff' ? 'white' : 'black'}. Highlight text: {accentInk === '#ffffff' ? 'white' : 'black'}. We choose the more readable option for each background.</p></div></section>
        </div><aside className={styles.previewColumn}><div className={styles.previewHeading}><span className={styles.eyebrow}>Live preview</span><div className={styles.switcher} aria-label="Preview type">{['portal', 'website'].map(value => <button type="button" key={value} aria-pressed={preview === value} onClick={() => setPreview(value)}>{value === 'portal' ? 'Portal' : 'Website'}</button>)}</div></div><div className={styles.preview}>
            {preview === 'portal' ? <div className={styles.portalPreview}><div className={styles.previewSidebar}><div className={styles.previewLogo}>{logo}</div><span className={styles.selected}>Overview</span><span>Appointments</span><span>My team</span><span>Clinic profile</span><small>Powered by My Drip Nurse</small></div><div className={styles.previewMain}><span className={styles.miniHeader}>Clinic workspace <i aria-hidden="true">○</i></span><h3>Welcome back.</h3><p>Your team, at a glance.</p><div className={styles.skeleton} /><div className={styles.skeleton} /><span className={styles.previewButton}>View appointments →</span></div></div> : <div className={styles.websitePreview}><header>{logo}</header><div className={styles.websiteHero}><span>Mobile wellness</span><h3>{clinic.name}</h3><p>Personalized care, wherever you are.</p><span className={styles.previewButton}>Explore services →</span></div><p className={styles.powered}>Powered by My Drip Nurse</p></div>}
        </div><p className={styles.previewNote}>Preview only. Save to update your portal and the branding used by your website. Public pages follow the existing cache refresh.</p></aside></div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}<footer className={styles.footer}><p>{dirty ? 'Your changes are ready to review.' : 'Your branding is up to date.'}</p><div><button type="button" className={styles.secondary} disabled={!dirty || busy || uploading} onClick={() => { setBrand({ logoUrl: clinic.logoUrl, primaryColor: clinic.primaryColor, accentColor: clinic.accentColor }); setError(''); }}>Discard changes</button><button type="button" className={styles.primary} disabled={!dirty || busy || uploading || !validLogo(brand.logoUrl)} onClick={() => void onSave(brand)}>{busy ? 'Saving…' : 'Save branding'}</button></div></footer>
    </section>;
}

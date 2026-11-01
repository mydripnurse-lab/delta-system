'use client';
import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import type { Clinic } from '@/lib/clinics';
import { clinicWebsiteBrand, DEFAULT_CLINIC_HERO, type ClinicWebsiteSettings } from '@/lib/clinicWebsiteBrand';
import styles from './clinicWebsiteEditor.module.css';

export function ClinicWebsiteEditor({ clinic, busy, onSave }: { clinic: Clinic; busy: boolean; onSave: (settings: ClinicWebsiteSettings) => Promise<boolean> }) {
    const saved = { heroImageUrl: clinic.websiteSettings?.heroImageUrl || '', primaryColor: clinic.websiteSettings?.primaryColor || '', secondaryColor: clinic.websiteSettings?.secondaryColor || '' };
    const [draft, setDraft] = useState(saved);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const brand = clinicWebsiteBrand({ ...clinic, websiteSettings: draft });
    const customColors = Boolean(draft.primaryColor || draft.secondaryColor);
    const dirty = draft.heroImageUrl !== saved.heroImageUrl || draft.primaryColor !== saved.primaryColor || draft.secondaryColor !== saved.secondaryColor;
    const theme = { '--website-primary': brand.primaryColor, '--website-secondary': brand.accentColor, '--website-ink': brand.ink, '--website-hero-ink': brand.accentInk } as CSSProperties;
    async function upload(file?: File) {
        if (!file) return;
        setError('');
        if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG or WebP image under 2 MB.'); return; }
        setUploading(true);
        try {
            const form = new FormData(); form.set('clinicId', clinic.id); form.set('file', file);
            const response = await fetch('/api/clinics/hero-image', { method: 'POST', body: form });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unable to upload image.');
            setDraft(current => ({ ...current, heroImageUrl: result.url }));
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to upload image.'); }
        finally { setUploading(false); }
    }
    return <section className={styles.editor} style={theme} aria-labelledby="clinic-website-editor">
        <header className={styles.heading}><div><h2 id="clinic-website-editor">Your clinic website</h2><p>A welcoming first impression, in your colors.</p></div>{clinic.published && clinic.status === 'approved' ? <a className={styles.secondary} href={`/clinics/${clinic.slug}`} target="_blank" rel="noreferrer">View website ↗</a> : null}</header>
        <div className={styles.layout}><div className={styles.settings}>
            <section><h3>Hero image</h3><p>Recommended: 1600 × 1067 px (3:2 landscape). Use a welcoming clinic or wellness photo with the subject near the center. JPG, PNG or WebP, up to 2 MB.</p>
                <div className={styles.uploadActions}><label className={styles.secondary}>{uploading ? 'Uploading…' : 'Upload hero image'}<input aria-label="Upload hero image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/></label>{draft.heroImageUrl ? <button type="button" className={styles.textButton} disabled={busy || uploading} onClick={() => setDraft(current => ({ ...current, heroImageUrl: '' }))}>Use default image</button> : null}</div><p className={styles.hint}>The My Drip Nurse image is used until you choose your own. Uploads are optimized for the website. Save to publish your selection.</p>
            </section>
            <section><h3>Website colors</h3><p>Start with your White Label palette, or choose colors just for your website.</p>
                <fieldset className={styles.colorMode}><legend>Color source</legend>
                    <label><input type="radio" name="website-color-source" checked={!customColors} disabled={busy || uploading} onChange={() => setDraft(current => ({ ...current, primaryColor: '', secondaryColor: '' }))}/><span><strong>Use White Label colors</strong><small>Automatically follow your clinic branding.</small></span></label>
                    <label><input type="radio" name="website-color-source" checked={customColors} disabled={busy || uploading} onChange={() => setDraft(current => ({ ...current, primaryColor: brand.primaryColor, secondaryColor: brand.accentColor }))}/><span><strong>Customize website colors</strong><small>Keep a separate palette for your website.</small></span></label>
                </fieldset>
                {(['primaryColor', 'secondaryColor'] as const).map((key, index) => <label key={key} className={styles.color}><input type="color" aria-label={index ? 'Secondary website color' : 'Primary website color'} disabled={!customColors || busy || uploading} value={draft[key] || (key === 'primaryColor' ? brand.primaryColor : brand.accentColor)} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/><span><strong>{index ? 'Secondary · Hero background' : 'Primary · Call to action'}</strong><small>{(draft[key] || (key === 'primaryColor' ? brand.primaryColor : brand.accentColor)).toUpperCase()}</small></span></label>)}
                <p className={styles.hint}>The darker color is used for buttons and the lighter color for the hero. Text contrast adjusts automatically. Custom website colors do not change your portal.</p>
            </section>
        </div><aside className={styles.previewColumn} aria-label="Website preview"><span className={styles.eyebrow}>Live preview</span><div className={styles.preview}><div><span>{clinic.name}</span><h3>Personalized care.<br/>Your local team.</h3><span className={styles.previewAction}>Explore services →</span></div><Image unoptimized src={draft.heroImageUrl || DEFAULT_CLINIC_HERO} width={600} height={400} alt="Clinic hero preview"/></div><p className={styles.hint}>Images are cropped to fit desktop and mobile layouts. Your public team profiles appear automatically with their professional credentials and website links.</p></aside></div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <footer className={styles.footer}><p>{clinic.published && clinic.status === 'approved' ? 'Save to update your published website.' : 'My Drip Nurse reviews and publishes your website.'}</p><div><button type="button" className={styles.secondary} disabled={!dirty || busy || uploading} onClick={() => { setDraft(saved); setError(''); }}>Discard changes</button><button type="button" className={styles.primary} disabled={!dirty || busy || uploading} onClick={async () => { const settings = { ...draft, primaryColor: customColors ? brand.primaryColor : '', secondaryColor: customColors ? brand.accentColor : '' }; if (await onSave(settings)) setDraft(settings); }}>{busy ? 'Saving…' : 'Save website'}</button></div></footer>
    </section>;
}

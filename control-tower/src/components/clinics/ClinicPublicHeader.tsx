'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { clinicServiceGroups, type ClinicNavigationService } from '@/lib/clinicServiceNavigation';
import { PARTNER_ORIGIN } from '@/lib/clinicDomainPolicy';
import styles from './clinicPublicHeader.module.css';

export function ClinicPublicHeader({ name, slug, logoUrl, home, services }: { name: string; slug: string; logoUrl: string | null; home: string; services: ClinicNavigationService[] }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const header = useRef<HTMLElement>(null);
    const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
    const mobileTrigger = useRef<HTMLButtonElement>(null);
    const groups = clinicServiceGroups(services);
    const close = () => { setOpen(null); setMobileOpen(false); };
    useEffect(() => {
        const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) { setOpen(null); setMobileOpen(false); } };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, []);
    return <header ref={header} className={styles.header} onKeyDown={event => {
        if (event.key === 'Escape') {
            if (open) { triggers.current[open]?.focus(); setOpen(null); }
            else { setMobileOpen(false); mobileTrigger.current?.focus(); }
        }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
        <Link href={home} className={styles.brand} onClick={close} aria-label={`${name} home`}>{logoUrl ? <Image src={logoUrl} alt={name} width={200} height={48} unoptimized priority/> : <strong>{name}</strong>}</Link>
        <button ref={mobileTrigger} className={styles.mobileToggle} aria-expanded={mobileOpen} aria-controls="clinic-navigation" onClick={() => { setMobileOpen(!mobileOpen); setOpen(null); }}>{mobileOpen ? 'Close' : 'Menu'} <span aria-hidden="true">{mobileOpen ? '×' : '☰'}</span></button>
        <nav id="clinic-navigation" className={styles.nav} data-open={mobileOpen} aria-label="Clinic navigation">
            {groups.map(group => <div key={group.id} className={styles.dropdown} data-compact={group.services.length <= 2}>
                <button ref={node => { triggers.current[group.id] = node; }} className={styles.trigger} aria-expanded={open === group.id} aria-controls={`clinic-menu-${group.id}`} onClick={() => setOpen(open === group.id ? null : group.id)}>{group.label}<svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
                <div id={`clinic-menu-${group.id}`} className={styles.panel} hidden={open !== group.id} aria-label={`${group.label} services`} data-compact={group.services.length <= 2}>
                    <ul>{group.services.map(service => <li key={service.id}><Link prefetch={false} href={`${home}/services/${encodeURIComponent(service.slug)}`} onClick={close}>
                        <span className={styles.thumbnail}>{service.imageUrl ? <Image unoptimized src={service.imageUrl} alt="" width={64} height={64}/> : <span aria-hidden="true">✦</span>}</span><span>{service.name}</span><svg className={styles.serviceArrow} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
                    </Link></li>)}</ul>
                </div>
            </div>)}
            {!groups.length ? <Link href={`${home}/services`} onClick={close}>Services</Link> : null}
            <Link href={`${home}#team`} onClick={close}>Our team</Link>
            <Link href={`${PARTNER_ORIGIN}/directory/clinics`} onClick={close}>Directory</Link>
            <Link href={`${home}/become-a-partner`} onClick={close}>Become a Partner</Link>
            <a className={styles.login} href={`${PARTNER_ORIGIN}/clinic-login/${slug}`}>Log in <span aria-hidden="true">↗</span></a>
            <a className={styles.care} href="https://care.mydripnurse.com">My Care →</a>
        </nav>
    </header>;
}

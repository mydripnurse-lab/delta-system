'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { PartnerExperience } from '@/components/partner/PartnerBrand';
import { PortalIcon, type PortalIconName } from '@/components/portal/PortalIcon';
import type { Clinic } from '@/lib/clinics';
import styles from './clinicPortalShell.module.css';

const sections = [
    ['Overview', 'home'], ['Appointments', 'calendar'], ['Profile', 'user'],
    ['Website', 'website'], ['Directory', 'directory'], ['Services', 'services'],
    ['Affiliates', 'affiliates'], ['Rewards', 'rewards'], ['Products', 'products'],
    ['Team', 'affiliates'], ['Coverage', 'website'], ['Support', 'support'],
] as const satisfies ReadonlyArray<readonly [string, PortalIconName]>;
export type ClinicSection = typeof sections[number][0];

type Props = {
    clinic?: Clinic;
    theme?: CSSProperties;
    section: ClinicSection;
    onSection: (section: ClinicSection) => void;
    onAllClinics: () => void;
    onSignOut: () => void;
    owner: boolean;
    hasPractice: boolean;
    accountName?: string;
    busy: boolean;
    children: ReactNode;
};

export function ClinicPortalShell({ clinic, theme, section, onSection, onAllClinics, onSignOut, owner, hasPractice, accountName, busy, children }: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    const title = clinic?.name || 'Clinic workspace';
    function select(next: ClinicSection) { onSection(next); setMenuOpen(false); }
    return <PartnerExperience><div className={styles.layout} style={theme}>
        <aside id="clinic-navigation" className={`${styles.sidebar} ${menuOpen ? styles.open : ''}`}>
            <div className={styles.brand}>
                {clinic?.logoUrl ? <Image unoptimized width={160} height={64} src={clinic.logoUrl} alt={title} /> : clinic ? <span className={styles.monogram}>{title.slice(0, 2).toUpperCase()}</span> : <Image width={160} height={34} src="/mdn-logo.png" alt="My Drip Nurse" className={styles.defaultLogo} />}
                {clinic ? <strong>{title}</strong> : null}
            </div>
            <nav className={styles.navigation} aria-label="Clinic portal">
                {sections.filter(([name]) => name !== 'Affiliates' || owner).map(([name, icon]) => <button key={name} type="button" disabled={busy || (!clinic && name !== 'Overview' && name !== 'Support')} aria-current={section === name ? 'page' : undefined} onClick={() => select(name)}>
                    <PortalIcon name={icon} /><span>{name === 'Profile' ? 'Clinic profile' : name === 'Website' ? 'Clinic website' : name === 'Team' ? 'My team' : name}</span>
                    {name === 'Products' || name === 'Rewards' ? <small>Coming soon</small> : null}
                </button>)}
            </nav>
            <div className={styles.sidebarFooter}>
                {clinic ? <button disabled={busy} type="button" onClick={() => { onAllClinics(); setMenuOpen(false); }}>Switch clinic <span aria-hidden="true">↗</span></button> : null}
                {hasPractice ? <Link prefetch={false} href="/portal">My nurse portal <span aria-hidden="true">↗</span></Link> : null}
                <span>Powered by My Drip Nurse</span>
            </div>
        </aside>
        <div className={styles.main}>
            <header className={styles.topbar}>
                <button type="button" className={styles.menuToggle} aria-controls="clinic-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close menu' : 'Menu'} <span aria-hidden="true">☰</span></button>
                <div className={styles.workspace}><small>Clinic workspace</small><strong>{title}</strong></div>
                <details className={styles.account}>
                    <summary><span className={styles.avatar}>{(accountName || title).slice(0, 1).toUpperCase()}</span><span><strong>{accountName || 'Your account'}</strong><small>{clinic ? owner ? 'Clinic owner' : 'Clinic manager' : 'Clinic partner'}</small></span><span aria-hidden="true">⌄</span></summary>
                    <div className={styles.accountMenu}>
                        {clinic ? <button type="button" onClick={() => select('Profile')}>Clinic profile</button> : null}
                        <Link prefetch={false} href="/clinics/register">Register a clinic</Link>
                        {hasPractice ? <Link prefetch={false} href="/portal/profile">My professional profile</Link> : null}
                        <button type="button" onClick={onSignOut}>Sign out</button>
                    </div>
                </details>
            </header>
            <main className={styles.content} id="clinic-content">
                <div className={styles.pageHeading}><div><span>YOUR CLINIC</span><h1>{clinic ? section === 'Profile' ? 'Clinic profile' : section === 'Website' ? 'Clinic website' : section : section === 'Support' ? 'Support' : 'Your clinics'}</h1></div>{clinic ? <span className={styles.status}>{clinic.status}</span> : <Link prefetch={false} href="/clinics/register">Register a clinic <span aria-hidden="true">→</span></Link>}</div>
                {children}
            </main>
        </div>
    </div></PartnerExperience>;
}

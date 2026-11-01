'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { resolveClinicPrice, clinicCovers } from '@/lib/clinicPolicy';
import { readRegionalPrices, type PricingRegion } from '@/lib/regionalPricing';
import type { publicClinicServices } from '@/lib/clinicBooking';
import styles from './clinicWebsite.module.css';
import { clinicServiceGroups } from '@/lib/clinicServiceNavigation';

export function ClinicPublicServices({ clinicId, clinicSlug, clinicHome, coverage, services, partnerId, nurseServiceLinks, bookingsEnabled = false }: {
    clinicId: string; clinicSlug?: string; clinicHome?: string; nurseServiceLinks?: Record<string, string>; bookingsEnabled?: boolean; partnerId?: string;
    coverage: PricingRegion[]; services: Awaited<ReturnType<typeof publicClinicServices>>;
}) {
    const [region, setRegion] = useState('');
    const groups = clinicServiceGroups<(typeof services)[number]>(services);
    const choices = [...new Map([...coverage, ...services.flatMap(s => [...readRegionalPrices(s.clinicRegions), ...(s.clinicPrice === null ? readRegionalPrices(s.regionalPrices) : [])].map(rule => rule.region).filter(r => clinicCovers(coverage, r)))].map(r => [r.id, r])).values()].sort((a, b) => a.label.localeCompare(b.label));
    const location = choices.find(r => r.id === region);
    return <div>
        <div className={styles.catalogHeading}><div><span className={styles.eyebrow}>Designed around your visit</span><h2>{clinicSlug ? 'Find your care.' : 'Your service. Your area.'}</h2><p>Explore available services and local pricing. Your final price and deposit are confirmed using your service address before payment.</p></div>
            {choices.length ? <label className={styles.regionLabel}>Your service area<select value={region} onChange={e => setRegion(e.target.value)}><option value="">Choose your area</option>{choices.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label> : null}
        </div>
        {groups.length > 1 ? <nav className={styles.categoryTabs} aria-label="Service categories">{groups.map(group => <a key={group.id} href={`#${group.id}`}>{group.label}</a>)}</nav> : null}
        {groups.map(group => <section id={group.id} className={styles.serviceGroup} key={group.id} aria-label={group.label}>{groups.length > 1 ? <h3>{group.label}</h3> : null}<div className={`${styles.services} ${services.length === 1 ? styles.singleService : ''}`}>{group.services.map(s => {
            const rules = readRegionalPrices(s.clinicRegions), general = readRegionalPrices(s.regionalPrices);
            const quote = resolveClinicPrice(s.price, general, { price: s.clinicPrice, regionalPrices: rules }, location);
            const variable = rules.length > 0 || (s.clinicPrice === null && general.length > 0);
            return <article className={styles.serviceCard} key={s.id}>
                <div className={styles.serviceVisual}>{s.imageUrl ? <Image unoptimized width={400} height={400} loading="lazy" src={s.imageUrl} alt={s.name}/> : <span aria-hidden="true">✦</span>}</div>
                <div className={styles.serviceBody}><h3>{s.name}</h3><p>{s.description}</p>
                    <p className={styles.price}>{!location && variable ? 'Local pricing' : new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency }).format(quote.price)}<small>{!location && variable ? 'Choose your service area to see the price.' : 'Per visit · Final price confirmed by address'}</small></p>
                    <div className={styles.serviceActions}>{clinicSlug ? <Link className={styles.textLink} href={nurseServiceLinks?.[s.id] || `${clinicHome || `/clinics/${clinicSlug}`}/services/${encodeURIComponent(s.slug)}${partnerId ? `?nurse=${encodeURIComponent(partnerId)}` : ''}`}>Explore service →</Link> : null}
                        {s.availabilityStatus === 'out_of_stock' ? <span className={styles.stock}>Temporarily out of stock. Booking is unavailable.</span> : bookingsEnabled ? <a className={styles.action} href={`https://care.mydripnurse.com/booking/${encodeURIComponent(s.publicKey)}?clinicId=${encodeURIComponent(clinicId)}${partnerId ? `&partnerId=${encodeURIComponent(partnerId)}` : ''}`}>Check availability →</a> : <span className={styles.stock}>Online booking coming soon.</span>}
                    </div>
                </div>
            </article>;
        })}</div></section>)}
        {!services.length ? <p className={styles.empty}>Services are being prepared. <a className={styles.textLink} href="mailto:info@mydripnurse.com">Contact My Drip Nurse</a> for information.</p> : <p className={styles.note}>The clinic collects the remaining balance and any voluntary tip directly. Eligible My Drip Nurse-funded rewards have separate terms. Treatment suitability is reviewed by a qualified healthcare professional.</p>}
    </div>;
}

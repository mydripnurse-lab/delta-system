'use client';
import Image from "next/image";
import { useState } from 'react';
import { resolveClinicPrice, clinicCovers } from '@/lib/clinicPolicy';
import { readRegionalPrices, type PricingRegion } from '@/lib/regionalPricing';
import type { publicClinicServices } from '@/lib/clinicBooking';
import styles from './clinic.module.css';
export function ClinicPublicServices({ clinicId, coverage, services, partnerId, bookingsEnabled = false }: {
    clinicId: string;
    bookingsEnabled?: boolean;
    partnerId?: string;
    coverage: PricingRegion[];
    services: Awaited<ReturnType<typeof publicClinicServices>>;
}) {
    const [region, setRegion] = useState('');
    const choices = [...new Map([...coverage, ...services.flatMap(s => [...readRegionalPrices(s.clinicRegions), ...(s.clinicPrice === null ? readRegionalPrices(s.regionalPrices) : [])].map(rule => rule.region).filter(r => clinicCovers(coverage, r)))].map(r => [r.id, r])).values()].sort((a, b) => a.label.localeCompare(b.label));
    const location = choices.find(r => r.id === region);
    return <section className={styles.card}><h2>Services for your area</h2><label className={styles.field}>Service area<select value={region} onChange={e => setRegion(e.target.value)}><option value="">Choose your area</option>{choices.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label><p>Prices are confirmed using your service address before the deposit is charged. The clinic collects the remaining balance and any voluntary tip.</p><div className={styles.grid}>{services.map(s => { const rules = readRegionalPrices(s.clinicRegions), general = readRegionalPrices(s.regionalPrices); const quote = resolveClinicPrice(s.price, general, { price: s.clinicPrice, regionalPrices: rules }, location); const variable = rules.length > 0 || (s.clinicPrice === null && general.length > 0); return <article className={styles.card} key={s.id}>{s.imageUrl ? <Image unoptimized width={120} height={120} loading="lazy" className={styles.image} src={s.imageUrl} alt={s.name}/> : null}<h2>{s.name}</h2><p>{s.description}</p><p className={styles.price}>{!location && variable ? 'Price varies by service address' : new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency }).format(quote.price)}</p>{bookingsEnabled ? <a className={styles.primary} href={`https://care.mydripnurse.com/booking/${encodeURIComponent(s.publicKey)}?clinicId=${clinicId}${partnerId ? `&partnerId=${encodeURIComponent(partnerId)}` : ''}`}>Check availability →</a> : <p className={styles.notice}>Online booking coming soon.</p>}</article>; })}</div>{!services.length ? <p className={styles.empty}>Services are being prepared. Please contact My Drip Nurse for information.</p> : null}</section>;
}

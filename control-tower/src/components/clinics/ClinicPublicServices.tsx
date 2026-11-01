'use client';
import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import catalog from './clinicPublicCatalog.module.css';
import Link from 'next/link';
import { usePriceRegion } from './ClinicServicePrice';
import { publicPriceChoices, publicPriceSummary } from '@/lib/publicServicePricing';
import { type PricingRegion } from '@/lib/regionalPricing';
import type { publicClinicServices } from '@/lib/clinicBooking';
import styles from './clinicWebsite.module.css';
import { clinicServiceGroups } from '@/lib/clinicServiceNavigation';

export function ClinicPublicServices({ clinicId, clinicSlug, clinicHome, coverage, services, partnerId, nurseServiceLinks, bookingsEnabled = false }: {
    clinicId: string; clinicSlug?: string; clinicHome?: string; nurseServiceLinks?: Record<string, string>; bookingsEnabled?: boolean; partnerId?: string;
    coverage: PricingRegion[]; services: Awaited<ReturnType<typeof publicClinicServices>>;
}) {
    const { region, setRegion } = usePriceRegion();
    const groups = clinicServiceGroups<(typeof services)[number]>(services);
    const [selection, setSelection] = useState({ category: 'all', page: 1 });
    const resultsId = useId();
    const resultsHeading = useRef<HTMLHeadingElement>(null);
    const group = groups.find(item => item.id === selection.category);
    const filtered = group ? group.services : services;
    const pageCount = Math.ceil(filtered.length / 6);
    const page = Math.min(selection.page, Math.max(1, pageCount));
    const visible = filtered.slice((page - 1) * 6, page * 6);
    const categoryIds = groups.map(item => item.id).join(',');
    useEffect(() => {
        const syncCategory = () => {
            const hash = window.location.hash.slice(1);
            if (hash === 'all' || categoryIds.split(',').includes(hash)) {
                setSelection({ category: hash, page: 1 });
                resultsHeading.current?.scrollIntoView({ block: 'start' });
            }
        };
        const frame = window.requestAnimationFrame(syncCategory);
        window.addEventListener('hashchange', syncCategory);
        return () => { window.cancelAnimationFrame(frame); window.removeEventListener('hashchange', syncCategory); };
    }, [categoryIds]);
    function changePage(next: number) {
        setSelection(current => ({ ...current, page: next }));
        window.requestAnimationFrame(() => {
            const heading = resultsHeading.current;
            heading?.focus({ preventScroll: true });
            if (heading && heading.getBoundingClientRect().top < 0) heading.scrollIntoView({ block: 'start' });
        });
    }
    const choices = [...new Map<string, PricingRegion>(services.flatMap(s => publicPriceChoices(s, coverage)).map(r => [r.id, r] as [string, PricingRegion])).values()].sort((a, b) => a.label.localeCompare(b.label));
    const location = choices.find(r => r.id === region);
    return <div>
        <div className={styles.catalogHeading}><div><span className={styles.eyebrow}>Designed around your visit</span><h2>{clinicSlug ? 'Find your care.' : 'Your service. Your area.'}</h2><p>Explore available services and local pricing. Your final price and deposit are confirmed using your service address before payment.</p></div>
            {choices.length ? <label className={styles.regionLabel}>Your service area<select aria-label="Your service area" value={region} onChange={e => setRegion(e.target.value)}><option value="">Choose your area</option>{choices.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label> : null}
        </div>
        {services.length > 1 ? <>
            <nav className={catalog.filters} aria-label="Service categories">
                {[{ id: 'all', label: 'All services', count: services.length }, ...groups.map(item => ({ id: item.id, label: item.label, count: item.services.length }))].map(item =>
                    <a key={item.id} href={`#${item.id}`} aria-current={(group?.id || 'all') === item.id ? 'true' : undefined} aria-controls={resultsId} onClick={event => {
                        event.preventDefault();
                        setSelection({ category: item.id, page: 1 });
                        window.history.replaceState(window.history.state, '', `#${item.id}`);
                    }}>{item.label}<span>{item.count}</span></a>
                )}
            </nav>
            <div className={catalog.resultsHeading}>
                <h3 ref={resultsHeading} tabIndex={-1}>{group?.label || 'All services'}</h3>
                <p role="status" aria-live="polite">{filtered.length ? `${(page - 1) * 6 + 1}–${Math.min(page * 6, filtered.length)} of ${filtered.length} services` : 'No services available'}</p>
            </div>
        </> : null}
        <div id={resultsId} className={`${styles.services} ${services.length === 1 ? styles.singleService : ''}`}>{visible.map(s => {
            const category = groups.find(item => item.services.some(service => service.id === s.id));
            const quote = publicPriceSummary(s, coverage, location);
            return <article className={styles.serviceCard} key={s.id}>
                <div className={styles.serviceVisual}>{s.imageUrl ? <Image unoptimized width={400} height={400} loading="lazy" src={s.imageUrl} alt={s.name}/> : <span aria-hidden="true">✦</span>}</div>
                <div className={styles.serviceBody}>{services.length > 1 ? <span className={catalog.categoryLabel}>{category?.label}</span> : null}<h3>{s.name}</h3><p>{s.description}</p>
                    <p className={styles.price}>{quote.label}<small>{quote.variable ? 'Per visit · Price varies by service address' : 'Per visit · Final price confirmed by address'}</small></p>
                    <div className={styles.serviceActions}>{clinicSlug ? <Link prefetch={false} className={styles.textLink} href={nurseServiceLinks?.[s.id] || `${clinicHome || `/clinics/${clinicSlug}`}/services/${encodeURIComponent(s.slug)}${partnerId ? `?nurse=${encodeURIComponent(partnerId)}` : ''}`}>Explore service →</Link> : null}
                        {s.availabilityStatus === 'out_of_stock' ? <span className={styles.stock}>Temporarily out of stock. Booking is unavailable.</span> : bookingsEnabled ? <a className={styles.action} href={`https://care.mydripnurse.com/booking/${encodeURIComponent(s.publicKey)}?clinicId=${encodeURIComponent(clinicId)}${partnerId ? `&partnerId=${encodeURIComponent(partnerId)}` : ''}`}>Check availability →</a> : <span className={styles.stock}>Online booking coming soon.</span>}
                    </div>
                </div>
            </article>;
        })}</div>
        {pageCount > 1 ? <nav className={catalog.pagination} aria-label="Service pages">
            <button type="button" aria-label="Previous service page" disabled={page === 1} onClick={() => changePage(page - 1)}><span aria-hidden="true">←</span><span className={catalog.direction}>Previous</span></button>
            <div className={catalog.pageNumbers}>{Array.from({ length: pageCount }, (_, i) => i + 1).map(number => <button type="button" key={number} aria-label={`Service page ${number}`} aria-current={page === number ? 'page' : undefined} onClick={() => changePage(number)}>{number}</button>)}</div>
            <button type="button" aria-label="Next service page" disabled={page === pageCount} onClick={() => changePage(page + 1)}><span className={catalog.direction}>Next</span><span aria-hidden="true">→</span></button>
        </nav> : null}
        {!services.length ? <p className={styles.empty}>Services are being prepared. <a className={styles.textLink} href="mailto:info@mydripnurse.com">Contact My Drip Nurse</a> for information.</p> : <p className={styles.note}>The clinic collects the remaining balance and any voluntary tip directly. Eligible My Drip Nurse-funded rewards have separate terms. Treatment suitability is reviewed by a qualified healthcare professional.</p>}
    </div>;
}

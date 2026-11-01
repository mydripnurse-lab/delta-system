'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PricingRegion } from '@/lib/regionalPricing';
import { publicPriceChoices, publicPriceSummary, type PublicPrice } from '@/lib/publicServicePricing';
import styles from './clinicWebsite.module.css';
const PriceRegion = createContext<{ region: string; setRegion: (id: string) => void } | null>(null);
export function ClinicPricingProvider({ children }: { children: ReactNode }) {
    const [region, setRegion] = useState('');
    return <PriceRegion.Provider value={{ region, setRegion }}>{children}</PriceRegion.Provider>;
}
export function usePriceRegion() {
    const shared = useContext(PriceRegion);
    const [region, setRegion] = useState('');
    return shared || { region, setRegion };
}
export function ClinicServicePrice({ service, coverage }: { service: PublicPrice; coverage: PricingRegion[] }) {
    const { region, setRegion } = usePriceRegion();
    const choices = publicPriceChoices(service, coverage);
    const selected = choices.find(r => r.id === region);
    const price = publicPriceSummary(service, coverage, selected);
    return <div className={styles.heroPrice}>
        <span>Per visit</span><strong aria-live="polite">{price.label}</strong>
        <small>{price.variable ? 'Price varies by service area' : 'Service price'} · Your address confirms the total and deposit before payment.</small>
        {choices.length > 1 || price.variable ? <label>Your service area<select aria-label="Your service area" value={region} onChange={e => setRegion(e.target.value)}><option value="">All service areas</option>{choices.map(r => <option value={r.id} key={r.id}>{r.label}</option>)}</select></label> : null}
    </div>;
}

import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ClinicPublicWebsite } from '@/components/clinics/ClinicPublicWebsite';
import { clinicSiteAddress } from '@/lib/clinicDomains';
import type { loadClinicBookingPage } from '@/lib/clinicBookingPage';
import { publicPriceSummary } from '@/lib/publicServicePricing';
import styles from '@/app/partner-site/[slug]/partnerSite.module.css';
import brandStyles from './clinicBookingBrand.module.css';

type BookingData = NonNullable<Awaited<ReturnType<typeof loadClinicBookingPage>>>;

export async function ClinicBookingExperience({ data, style, children }: {
    data: BookingData; style?: CSSProperties; children: ReactNode;
}) {
    const { clinic, service, nurse, coverage } = data;
    const site = await clinicSiteAddress(clinic);
    const price = publicPriceSummary(service, coverage);
    const nurseQuery = nurse ? `?nurse=${encodeURIComponent(nurse.id)}` : '';
    const details = `${site.canonicalHome}/services/${encodeURIComponent(service.slug)}${nurseQuery}`;
    return <ClinicPublicWebsite clinic={clinic} absoluteNavigation>
        <main id="clinic-content" data-clinic-booking="true" className={brandStyles.page} style={style}>
            <section className={styles.bookingPageHero}>
                <div className={styles.shell}>
                    <div className={styles.bookingHeroCopy}>
                        <span className={styles.eyebrow}>Secure service booking</span>
                        <h1>Book {service.name}<br /><em>with {nurse?.name || clinic.name}.</em></h1>
                        <p>{nurse ? `Receive care from ${nurse.name} through ${clinic.name}.` : `Bring ${clinic.name}’s care to your home, hotel or workplace.`} Enter your service address to check coverage and available appointment times.</p>
                        <div className={styles.bookingSummary}>
                            <span>Service</span><strong>{service.name}</strong>
                            <span>{price.variable ? 'Starting price' : 'Service price'}</span><strong>{price.label}</strong>
                        </div>
                        <p className={brandStyles.priceNote}>Your address confirms the total and deposit before payment. {clinic.name} collects the remaining balance directly at your visit.</p>
                    </div>
                    {service.imageUrl ? <div className={`${styles.bookingServiceVisual} ${brandStyles.serviceVisual}`}>
                        <Image unoptimized src={service.imageUrl} alt={service.name} width={720} height={640} priority sizes="(max-width: 900px) 85vw, 38vw" />
                    </div> : null}
                </div>
            </section>
            <section className={styles.dedicatedBookingSection} aria-label="Book your appointment">
                <div className={styles.shell}>
                    <div className={styles.calendarFrame}>{children}</div>
                    <div className={styles.bookingPageFooterActions}>
                        <Link className={styles.backLink} href={details}>← Review service details</Link>
                        <Link className={styles.backLink} href={`${site.canonicalHome}/services${nurseQuery}`}>View all services →</Link>
                    </div>
                </div>
            </section>
        </main>
    </ClinicPublicWebsite>;
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingCalendarClient } from "@/components/booking/BookingCalendarClient";
import BookingIdentityPanel from "@/components/booking/BookingIdentityPanel";
import {
  PartnerExperience,
  PartnerFooter,
  PartnerHeader,
} from "@/components/partner/PartnerBrand";
import { loadPartnerServicePage } from "@/lib/partnerServicePages";
import { buildPartnerMetadata } from "@/lib/partnerSeo";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

import styles from "../../../partnerSite.module.css";

type Props = {
  params: Promise<{ slug: string; serviceSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, serviceSlug } = await params;
  const { preview = "" } = await searchParams;
  const data = await loadPartnerServicePage(slug, serviceSlug, preview);
  if (!data) return { title: "Secure Booking | My Drip Nurse", robots: { index: false, follow: false } };
  return buildPartnerMetadata({
    profile: data.profile,
    pathname: `services/${serviceSlug}/book`,
    title: `Book ${data.service.name} with ${data.profile.displayName}`,
    description: `View secure appointment availability for ${data.service.name} with ${data.profile.displayName}.`,
    indexable: false,
  });
}

export default async function PartnerServiceBookingPage({ params, searchParams }: Props) {
  const { slug, serviceSlug } = await params;
  const { preview = "" } = await searchParams;
  const [data, clientAccount] = await Promise.all([
    loadPartnerServicePage(slug, serviceSlug, preview),
    getAuthenticatedClient(),
  ]);
  if (!data) notFound();
  const { profile, service, cities } = data;
  const outOfStock = service.availabilityStatus === "out_of_stock";
  const coverageCities = cities.slice(0, 3).map((city) => city.name);
  const coverageLabel = coverageCities.length
    ? coverageCities.length === 1
      ? coverageCities[0]
      : coverageCities.length === 2
        ? `${coverageCities[0]} and ${coverageCities[1]}`
        : `${coverageCities[0]}, ${coverageCities[1]}, and ${coverageCities[2]}`
    : "the listed service area";
  const coverageMore = Math.max(0, cities.length - coverageCities.length);
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;
  const bookingReturnUrl = `https://partners.mydripnurse.com/${profile.slug}/services/${serviceSlug}/book`;

  return (
    <PartnerExperience>
      <main className={styles.page}>
        {preview ? <div role="status" className={styles.previewBanner}>Private website preview · Booking pages remain hidden from search engines</div> : null}
        <PartnerHeader
          navItems={[
            { href: partnerHref(), label: "Home" },
            { href: partnerHref("/services"), label: "Services" },
          ]}
          action={{ href: partnerHref(`/services/${serviceSlug}`), label: "Service details" }}
        />

        <section className={styles.bookingPageHero}>
          <div className={styles.shell}>
            <div className={styles.bookingHeroCopy}>
              <span className={styles.eyebrow}>Secure service booking</span>
              <h1>Book {service.name}<br /><em>with {profile.displayName}.</em></h1>
              <p>
                Live availability for {profile.displayName}. Current coverage includes {coverageLabel}
                {coverageMore ? ` and ${coverageMore} more area${coverageMore === 1 ? "" : "s"}` : ""}.
                If coverage was confirmed directly for another nearby location, you can continue with your booking.
              </p>
              <div className={styles.bookingSummary}>
                <span>Service</span><strong>{service.name}</strong>
                <span>Current price</span><strong>{service.price || "Shown during booking"}</strong>
              </div>
            </div>
            <div className={styles.bookingServiceVisual}>
              <Image src={service.imageUrl} alt={`${service.name} mobile IV therapy`} title={`${service.name} mobile IV therapy`} width={720} height={640} priority sizes="(max-width: 900px) 100vw, 38vw" />
            </div>
          </div>
        </section>

        <section className={styles.dedicatedBookingSection}>
          <div className={styles.shell}>
            {outOfStock ? (
              <div className={`${styles.calendarPending} ${styles.calendarOutOfStock}`}>
                <strong>{service.name} is currently out of stock.</strong>
                <p>This Partner is temporarily unable to accept appointments for this service. Review the service page or check again after inventory has been restored.</p>
              </div>
            ) : service.calendarId && !service.calendarId.startsWith("preview-") ? (
              <div className={styles.calendarFrame}>
                <BookingIdentityPanel
                  connectedName={clientAccount?.fullName.split(/\s+/)[0] || ""}
                  returnTo={bookingReturnUrl}
                  serviceName={service.name}
                >
                  <BookingCalendarClient
                    publicKey={service.calendarId}
                    partnerId={profile.id}
                    partnerView
                    initialProfile={clientAccount ? {
                      fullName: clientAccount.fullName,
                      email: clientAccount.email,
                      phone: clientAccount.phone,
                      dateOfBirth: clientAccount.dateOfBirth,
                      addressLine1: clientAccount.addressLine1,
                      addressLine2: clientAccount.addressLine2,
                      city: clientAccount.city,
                      county: clientAccount.county,
                      state: clientAccount.state,
                      postalCode: clientAccount.postalCode,
                      countryCode: clientAccount.countryCode,
                      addressVerifiedLabel: clientAccount.addressVerifiedLabel,
                      weightPounds: clientAccount.weightPounds,
                      heightInchesTotal: clientAccount.heightInches,
                      genderIdentity: clientAccount.genderIdentity,
                      accountConnected: true,
                      screeningSelections: clientAccount.screeningSelections,
                      savedAddresses: clientAccount.addresses,
                    } : undefined}
                  />
                </BookingIdentityPanel>
              </div>
            ) : (
              <div className={styles.calendarPending}>
                <strong>{preview ? "Calendar preview placeholder" : "Online booking is being prepared."}</strong>
                <p>{preview
                  ? "The service-specific calendar will appear here after this page is activated."
                  : "This service calendar is not currently available. Please return shortly or contact My Drip Nurse support."}</p>
              </div>
            )}
            <div className={styles.bookingPageFooterActions}>
              <Link href={partnerHref(`/services/${serviceSlug}`)} className={styles.backLink}>← Review service details</Link>
              <Link href={partnerHref("/services")} className={styles.backLink}>View all services →</Link>
            </div>
          </div>
        </section>
        <PartnerFooter />
      </main>
    </PartnerExperience>
  );
}

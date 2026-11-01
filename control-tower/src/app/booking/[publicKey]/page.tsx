import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { loadClinicBookingPage } from "@/lib/clinicBookingPage";
import { clinicSiteAddress } from "@/lib/clinicDomains";
import brandStyles from "@/components/booking/clinicBookingBrand.module.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BookingCalendarClient } from "@/components/booking/BookingCalendarClient";
import BookingIdentityPanel from "@/components/booking/BookingIdentityPanel";
import { getAuthenticatedClient, safeClientReturnUrl } from "@/lib/clientPortalAuth";
import { loadPublicBookingCalendarSummary } from "@/lib/serviceBookingAvailability";

export const dynamic = "force-dynamic";

const bookingMetadata: Metadata = {
  robots: { index: false, follow: true },
  title: "Book Mobile IV Therapy | My Drip Nurse",
  icons: { icon: "https://sitemaps.mydripnurse.com/favicon.ico" },
};

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ publicKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { publicKey } = await params, query = await searchParams;
  const data = typeof query.clinicId === 'string' ? await loadClinicBookingPage(query.clinicId, publicKey, typeof query.partnerId === 'string' ? query.partnerId : '') : null;
  return { ...bookingMetadata, ...(data ? { title: `Book ${data.service.name} | ${data.clinic.name}`, description: `Request an appointment with ${data.clinic.name}. Choose an available nurse for your service address and review your price before payment.` } : {}) };
}

export default async function BookingCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { publicKey } = await params;
  const query = await searchParams;
  const requestHeaders = await headers();
  const hostname = (requestHeaders.get("host") || "").split(":")[0].toLowerCase();
  if (hostname === "partners.mydripnurse.com") {
    const destination = new URL(`https://care.mydripnurse.com/booking/${encodeURIComponent(publicKey)}`);
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((item) => destination.searchParams.append(key, item));
      else if (value) destination.searchParams.set(key, value);
    });
    redirect(destination.toString());
  }
  const clinicId = typeof query.clinicId === 'string' ? query.clinicId : '';
  const nurseId = typeof query.partnerId === 'string' ? query.partnerId : '';
  const clinicBooking = clinicId ? await loadClinicBookingPage(clinicId, publicKey, nurseId) : null;
  if (query.clinicId !== undefined && !clinicBooking) notFound();
  const site = clinicBooking ? await clinicSiteAddress(clinicBooking.clinic) : null;
  const brandStyle = clinicBooking ? {
    '--booking-primary': clinicBooking.brand.primaryColor,
    '--booking-soft': clinicBooking.brand.accentColor,
    '--booking-ink': clinicBooking.brand.ink,
    '--booking-soft-ink': clinicBooking.brand.accentInk,
  } as CSSProperties : undefined;
  const [clientAccount, calendarSummary] = await Promise.all([
    getAuthenticatedClient(),
    clinicBooking ? Promise.resolve({ serviceName: clinicBooking.service.name, serviceImageUrl: clinicBooking.service.imageUrl, serviceImageAlt: clinicBooking.service.name }) : loadPublicBookingCalendarSummary(publicKey).catch(() => null),
  ]);
  const embedded = query.embed === "1";
  const requestedReturnTo = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  const bookingReturnUrl = new URL(`https://care.mydripnurse.com/booking/${encodeURIComponent(publicKey)}`);
  if (typeof query.clinicId === 'string') {
    bookingReturnUrl.searchParams.set('clinicId', query.clinicId);
    if (typeof query.partnerId === 'string') bookingReturnUrl.searchParams.set('partnerId', query.partnerId);
  }
  const bookingReturnTo = bookingReturnUrl.toString();
  const returnTo = embedded ? safeClientReturnUrl(requestedReturnTo) || bookingReturnTo : bookingReturnTo;
  return (
    <div data-clinic-booking={clinicBooking ? "true" : undefined} className={clinicBooking ? brandStyles.page : undefined} style={brandStyle}>
    {clinicBooking ? <header className={brandStyles.header}>
      <Link href={site!.canonicalHome} className={brandStyles.logo} aria-label={`Back to ${clinicBooking.clinic.name}`}>
        {clinicBooking.clinic.logoUrl ? <Image unoptimized src={clinicBooking.clinic.logoUrl} alt={clinicBooking.clinic.name} width={200} height={64}/> : clinicBooking.clinic.name}
      </Link>
      <div><strong>{clinicBooking.clinic.name}</strong><span>Secure booking · Powered by My Drip Nurse</span></div>
      <Link href={`${site!.canonicalHome}/services/${clinicBooking.service.slug}`} className={brandStyles.back}>← Back to service</Link>
    </header> : null}
    <BookingIdentityPanel
      connectedName={clientAccount?.fullName.split(/\s+/)[0] || ""}
      embedded={embedded}
      returnTo={returnTo}
      serviceName={calendarSummary?.serviceName || "mobile wellness"}
    >
      <BookingCalendarClient
        embedMode={embedded}
        publicKey={publicKey}
        clinicId={typeof query.clinicId === "string" ? query.clinicId : ""}
        partnerId={typeof query.clinicId === "string" && typeof query.partnerId === "string" ? query.partnerId : ""}
        partnerView={typeof query.clinicId === "string" && typeof query.partnerId === "string"}
        serviceName={calendarSummary?.serviceName || ""}
        serviceImageUrl={calendarSummary?.serviceImageUrl || ""}
        serviceImageAlt={calendarSummary?.serviceImageAlt || ""}
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
  );
}

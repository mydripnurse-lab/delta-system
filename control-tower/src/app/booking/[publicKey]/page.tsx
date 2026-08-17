import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BookingCalendarClient } from "@/components/booking/BookingCalendarClient";
import BookingIdentityPanel from "@/components/booking/BookingIdentityPanel";
import { getAuthenticatedClient, safeClientReturnUrl } from "@/lib/clientPortalAuth";
import { loadPublicBookingCalendarSummary } from "@/lib/serviceBookingAvailability";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book Mobile IV Therapy | My Drip Nurse",
  icons: { icon: "https://sitemaps.mydripnurse.com/favicon.ico" },
};

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
  const [clientAccount, calendarSummary] = await Promise.all([
    getAuthenticatedClient(),
    loadPublicBookingCalendarSummary(publicKey).catch(() => null),
  ]);
  const embedded = query.embed === "1";
  const requestedReturnTo = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  const bookingReturnTo = `https://care.mydripnurse.com/booking/${encodeURIComponent(publicKey)}`;
  const returnTo = embedded ? safeClientReturnUrl(requestedReturnTo) || bookingReturnTo : bookingReturnTo;
  return (
    <BookingIdentityPanel
      connectedName={clientAccount?.fullName.split(/\s+/)[0] || ""}
      embedded={embedded}
      returnTo={returnTo}
      serviceName={calendarSummary?.serviceName || "mobile wellness"}
    >
      <BookingCalendarClient
        embedMode={embedded}
        publicKey={publicKey}
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
  );
}

import type { Metadata } from "next";

import { BookingCalendarClient } from "@/components/booking/BookingCalendarClient";
import BookingIdentityPanel from "@/components/booking/BookingIdentityPanel";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book Mobile IV Therapy | My Drip Nurse",
  icons: { icon: "https://sitemaps.mydripnurse.com/favicon.ico" },
};

export default async function BookingCalendarPage({
  params,
}: {
  params: Promise<{ publicKey: string }>;
}) {
  const { publicKey } = await params;
  const clientAccount = await getAuthenticatedClient();
  const returnTo = `https://care.mydripnurse.com/booking/${encodeURIComponent(publicKey)}`;
  return (
    <BookingIdentityPanel
      connectedName={clientAccount?.fullName.split(/\s+/)[0] || ""}
      returnTo={returnTo}
      serviceName="mobile wellness"
    >
      <BookingCalendarClient
        publicKey={publicKey}
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

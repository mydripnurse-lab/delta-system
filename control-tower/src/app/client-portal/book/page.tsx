import { redirect } from "next/navigation";

import ClientBookingFlow from "@/components/client/ClientBookingFlow";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientServices } from "@/lib/clientPortalData";

const PARTNER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_SLUG_PATTERN = /^[a-z0-9-]+$/i;

export default async function ClientBookPage({ searchParams }: { searchParams: Promise<{ service?: string; partner?: string }> }) {
  const query = await searchParams;
  const [account, services] = await Promise.all([getAuthenticatedClient(), getClientServices()]);
  const serviceSlug = SERVICE_SLUG_PATTERN.test(query.service || "") && services.some((service) => service.slug === query.service) ? query.service || "" : "";
  const partnerId = PARTNER_ID_PATTERN.test(query.partner || "") ? query.partner || "" : "";
  const preservedParams = new URLSearchParams();
  if (serviceSlug) preservedParams.set("service", serviceSlug);
  if (partnerId) preservedParams.set("partner", partnerId);
  const requestedBookUrl = preservedParams.size ? `/book?${preservedParams.toString()}` : "/book";
  if (!account) redirect(`/login?next=${encodeURIComponent(requestedBookUrl)}`);

  return (
    <ClientBookingFlow
      services={services}
      initialServiceSlug={serviceSlug}
      partnerId={partnerId}
      initialProfile={{
        fullName: account.fullName,
        email: account.email,
        phone: account.phone,
        dateOfBirth: account.dateOfBirth,
        addressLine1: account.addressLine1,
        addressLine2: account.addressLine2,
        city: account.city,
        county: account.county,
        state: account.state,
        postalCode: account.postalCode,
        countryCode: account.countryCode,
        addressVerifiedLabel: account.addressVerifiedLabel,
        weightPounds: account.weightPounds,
        heightInchesTotal: account.heightInches,
        genderIdentity: account.genderIdentity,
        accountConnected: true,
        screeningSelections: account.screeningSelections,
        savedAddresses: account.addresses,
      }}
    />
  );
}

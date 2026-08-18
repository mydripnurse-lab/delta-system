import { PartnerAdminCareClient } from "@/components/partner-admin/PartnerAdminCareClient";
import { PortalLocaleProvider } from "@/components/portal/PortalLocaleProvider";

export const dynamic = "force-dynamic";

export default function CarePage() {
  return (
    <PortalLocaleProvider>
      <PartnerAdminCareClient />
    </PortalLocaleProvider>
  );
}

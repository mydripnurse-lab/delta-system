import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Availability | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function AvailabilityPage() {
  return renderPartnerPortal("availability");
}

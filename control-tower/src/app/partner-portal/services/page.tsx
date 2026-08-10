import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Services | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function ServicesPage() {
  return renderPartnerPortal("services");
}

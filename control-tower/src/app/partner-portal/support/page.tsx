import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner Support | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function PartnerSupportPage() {
  return renderPartnerPortal("support");
}

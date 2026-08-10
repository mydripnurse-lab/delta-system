import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Website | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function WebsitePage() {
  return renderPartnerPortal("website");
}

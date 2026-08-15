import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Directory | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function PartnerDirectoryAnalyticsPage() {
  return renderPartnerPortal("directory");
}

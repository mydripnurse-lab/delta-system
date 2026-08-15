import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public Profile | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function ProfilePage() {
  return renderPartnerPortal("profile");
}

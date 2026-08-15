import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function ProductsPage() {
  return renderPartnerPortal("products");
}

import Link from "next/link";
import { redirect } from "next/navigation";

import ClientServiceCatalog from "@/components/client/ClientServiceCatalog";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientServices } from "@/lib/clientPortalData";

import styles from "../clientPortal.module.css";

export default async function ClientServicesPage() {
  const [account, services] = await Promise.all([getAuthenticatedClient(), getClientServices()]);
  if (!account) redirect("/login?next=/services");
  return (
    <div className={styles.pageShell}>
      <section className={styles.pageIntro}>
        <div><span className={styles.eyebrow}>Services</span><h1>Your wellness menu.</h1><p>Explore the complete My Drip Nurse service collection. When you are ready, choose a treatment and continue to booking.</p></div>
        <Link href="/book" className={styles.primaryAction}>Start booking <span>→</span></Link>
      </section>
      <ClientServiceCatalog services={services} />
    </div>
  );
}

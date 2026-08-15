import { redirect } from "next/navigation";

import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

import styles from "../clientPortal.module.css";

export default async function ClientProductsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/products");

  return (
    <div className={styles.pageShell}>
      <section className={styles.productsHero}>
        <div>
          <span className={styles.eyebrow}>My Drip Nurse Products</span>
          <h1>Wellness, beyond the visit.</h1>
          <p>A curated collection of trusted wellness essentials is being prepared for your Care experience.</p>
        </div>
        <span className={styles.comingSoonBadge}>Coming soon</span>
      </section>
      <section className={styles.productPreviewGrid} aria-label="Future product experience">
        <article><span>01</span><h2>Curated essentials</h2><p>Thoughtful wellness products selected to complement your care.</p></article>
        <article><span>02</span><h2>Care-connected</h2><p>Recommendations designed around your mobile wellness experience.</p></article>
        <article><span>03</span><h2>Easy reordering</h2><p>A simple way to revisit the products that work for your routine.</p></article>
      </section>
      <section className={styles.membershipNote}><span>✦</span><div><h2>Something exceptional is coming.</h2><p>Products and purchasing will remain unavailable until the collection is ready.</p></div></section>
    </div>
  );
}

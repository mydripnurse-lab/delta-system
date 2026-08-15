import { redirect } from "next/navigation";

import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

import styles from "../clientPortal.module.css";

export default async function ClientMembershipPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/membership");
  return (
    <div className={styles.pageShell}>
      <section className={styles.membershipHero}>
        <div><span className={styles.eyebrow}>Membership</span><h1>Wellness, elevated.</h1><p>A more consistent way to care for your energy, recovery and everyday wellbeing is coming to My Drip Nurse Care.</p></div>
        <span className={styles.comingSoonBadge}>Coming soon</span>
      </section>
      <section className={styles.benefitGrid}>
        <article><span>01</span><h2>Member value</h2><p>Thoughtful pricing and benefits across eligible treatments.</p></article>
        <article><span>02</span><h2>Consistent care</h2><p>Make wellness easier to maintain on your schedule.</p></article>
        <article><span>03</span><h2>Priority experience</h2><p>Future access to preferred booking and exclusive offerings.</p></article>
      </section>
      <section className={styles.membershipNote}><span>✦</span><div><h2>Be among the first.</h2><p>Membership availability and plan details will appear here when enrollment opens.</p></div></section>
    </div>
  );
}

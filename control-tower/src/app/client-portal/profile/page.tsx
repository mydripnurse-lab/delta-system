import { redirect } from "next/navigation";

import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { safeClientNext } from "@/lib/clientPortalAuth";
import ClientProfileForm from "@/components/client/ClientProfileForm";
import ClientProfileAvatar from "@/components/client/ClientProfileAvatar";
import ClientCarePreferences from "@/components/client/ClientCarePreferences";

import styles from "../clientPortal.module.css";

export default async function ClientProfilePage({ searchParams }: { searchParams: Promise<{ setup?: string; next?: string }> }) {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/profile");
  const query = await searchParams;
  const setup = query.setup === "address";
  const nextPath = setup && query.next ? safeClientNext(query.next, "") : "";
  return (
    <div className={styles.pageShell}>
      <section className={styles.pageIntro}><div><span className={styles.eyebrow}>{setup ? "One secure step" : "My care profile"}</span><h1>{setup ? "Where should care come to you?" : "Your details, securely kept."}</h1><p>{setup ? "Choose your verified service address so we can accurately match availability and travel distance. You can use a different address when booking any visit." : "Save the essentials once so each future mobile wellness visit starts with less repetition."}</p></div></section>
      <section className={styles.profileCard}>
        <div className={styles.profileCardHeader}>
          <ClientProfileAvatar className={styles.largeAvatar} fullName={account.fullName} photoUrl={account.profilePhotoUrl} photoUpdatedAt={account.profilePhotoUpdatedAt} sizes="76px" />
          <div><span>Verified patient account</span><h2>{account.fullName}</h2><p>{account.email}</p></div>
          <div className={styles.profileIdentityActions}>
            <b>Verified ✓</b>
          </div>
        </div>
        <ClientProfileForm account={account} nextPath={nextPath} />
        <ClientCarePreferences account={account} />
        <div className={styles.profileNotice}><span>Your verified email connects existing and future bookings automatically.</span><p>Your saved address is a booking preference—not a permanent service location. You can always choose a different address for any appointment.</p></div>
      </section>
    </div>
  );
}

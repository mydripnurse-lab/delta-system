import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import ClientAuthForm from "@/components/client/ClientAuthForm";
import ClientOriginLogo from "@/components/client/ClientOriginLogo";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

import styles from "./clientLogin.module.css";

export const metadata: Metadata = {
  title: "Sign in | My Drip Nurse Care",
  description: "Secure access to your My Drip Nurse care experience.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://care.mydripnurse.com/login" },
};

export default async function ClientLoginPage() {
  // Validate the token itself before redirecting. Checking only whether the
  // cookie exists creates a /login <-> portal loop for expired Safari cookies.
  if (await getAuthenticatedClient()) redirect("/");

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <ClientOriginLogo className={styles.logoLink} width={240} height={51} priority />
        <div className={styles.brandCopy}>
          <span>My Drip Nurse Care</span>
          <h2>Wellness that moves with you.</h2>
          <p>Your appointments and trusted care team—thoughtfully connected.</p>
        </div>
        <div className={styles.trustStrip}>
          <span><b>✓</b> Secure patient access</span>
          <span><b>✓</b> Trusted mobile care</span>
          <span><b>✓</b> Built around you</span>
        </div>
      </section>
      <section className={styles.authPanel}>
        <ClientOriginLogo className={styles.mobileLogo} width={200} height={43} priority />
        <Suspense fallback={<div className={styles.formSkeleton} aria-hidden="true" />}>
          <ClientAuthForm mode="login" />
        </Suspense>
      </section>
    </main>
  );
}

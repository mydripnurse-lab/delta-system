import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import ClientAuthForm from "@/components/client/ClientAuthForm";

import styles from "./clientLogin.module.css";

export const metadata: Metadata = {
  title: "Sign in | My Drip Nurse Care",
  description: "Secure access to your My Drip Nurse care experience.",
  robots: { index: false, follow: false },
};

export default function ClientLoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <a href="https://mydripnurse.com" className={styles.logoLink} aria-label="My Drip Nurse home">
          <Image src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51} priority />
        </a>
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
        <a href="https://mydripnurse.com" className={styles.mobileLogo} aria-label="My Drip Nurse home">
          <Image src="/mdn-logo.png" alt="My Drip Nurse" width={200} height={43} priority />
        </a>
        <Suspense fallback={<div className={styles.formSkeleton} aria-hidden="true" />}>
          <ClientAuthForm mode="login" />
        </Suspense>
      </section>
    </main>
  );
}

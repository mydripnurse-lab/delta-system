import type { Metadata } from "next";
import { Suspense } from "react";

import ClientAuthForm from "@/components/client/ClientAuthForm";
import ClientOriginLogo from "@/components/client/ClientOriginLogo";

import styles from "@/app/client-login/clientLogin.module.css";

export const metadata: Metadata = {
  title: "Create account | My Drip Nurse Care",
  description: "Create your secure My Drip Nurse patient account.",
  robots: { index: false, follow: false },
};

export default function ClientRegisterPage() {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <ClientOriginLogo className={styles.logoLink} width={240} height={51} priority />
        <div className={styles.brandCopy}>
          <span>Your wellness, connected</span>
          <h2>A more personal way to experience care.</h2>
          <p>Create your account once and let every future appointment feel effortless.</p>
        </div>
        <div className={styles.trustStrip}>
          <span><b>01</b> Book</span>
          <span><b>02</b> Receive care</span>
          <span><b>03</b> Return seamlessly</span>
        </div>
      </section>
      <section className={styles.authPanel}>
        <ClientOriginLogo className={styles.mobileLogo} width={200} height={43} priority />
        <Suspense fallback={<div className={styles.formSkeleton} aria-hidden="true" />}>
          <ClientAuthForm mode="register" />
        </Suspense>
      </section>
    </main>
  );
}

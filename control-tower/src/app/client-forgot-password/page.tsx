import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import ClientPasswordForm from "@/components/client/ClientPasswordForm";

import styles from "@/app/client-login/clientLogin.module.css";

export const metadata: Metadata = { title: "Recover account | My Drip Nurse Care", robots: { index: false, follow: false } };

export default function ClientForgotPasswordPage() {
  return <main className={styles.page}>
    <section className={styles.brandPanel}>
      <a href="https://mydripnurse.com" className={styles.logoLink}><Image src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51} priority /></a>
      <div className={styles.brandCopy}><span>My Drip Nurse Care</span><h2>Your care is still right here.</h2><p>Recover access securely and return to your appointments and wellness experience.</p></div>
    </section>
    <section className={styles.authPanel}><a href="https://mydripnurse.com" className={styles.mobileLogo}><Image src="/mdn-logo.png" alt="My Drip Nurse" width={200} height={43} priority /></a><Suspense fallback={<div className={styles.formSkeleton} />}><ClientPasswordForm mode="forgot" /></Suspense></section>
  </main>;
}

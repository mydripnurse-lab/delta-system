import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import ClientVerifyEmail from "@/components/client/ClientVerifyEmail";

import styles from "@/app/client-login/clientLogin.module.css";

export const metadata: Metadata = {
  title: "Verify email | My Drip Nurse Care",
  robots: { index: false, follow: false },
};

export default function ClientVerifyEmailPage() {
  return (
    <main className={styles.verifyPage}>
      <Image src="/mdn-logo.png" alt="My Drip Nurse" width={190} height={41} priority />
      <Suspense fallback={<div className={styles.formSkeleton} aria-hidden="true" />}>
        <ClientVerifyEmail />
      </Suspense>
    </main>
  );
}

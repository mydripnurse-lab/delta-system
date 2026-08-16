import type { Metadata } from "next";
import { Suspense } from "react";
import { PortalPasswordRecoveryForm } from "@/components/auth/PortalPasswordRecoveryForm";

export const metadata: Metadata = {
  title: "Reset password | My Drip Nurse Partner",
  robots: { index: false, follow: false },
};

export default function PartnerResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <PortalPasswordRecoveryForm
        mode="reset"
        endpoint="/api/public/partner-portal/reset-password"
        loginHref="/login"
        portalName="Partner Portal"
      />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { PortalPasswordRecoveryForm } from "@/components/auth/PortalPasswordRecoveryForm";

export const metadata: Metadata = {
  title: "Forgot password | My Drip Nurse Partner",
  robots: { index: false, follow: false },
};

export default function PartnerForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <PortalPasswordRecoveryForm
        mode="forgot"
        endpoint="/api/public/partner-portal/forgot-password"
        loginHref="/login"
        portalName="Partner Portal"
      />
    </Suspense>
  );
}

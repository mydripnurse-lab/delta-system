import type { Metadata } from "next";
import { Suspense } from "react";
import { PortalPasswordRecoveryForm } from "@/components/auth/PortalPasswordRecoveryForm";

export const metadata: Metadata = {
  title: "Forgot password | My Drip Nurse Admin",
  robots: { index: false, follow: false },
};

export default function PartnerAdminForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <PortalPasswordRecoveryForm
        mode="forgot"
        endpoint="/api/partner-admin/auth/forgot-password"
        loginHref="/login"
        portalName="Admin Workspace"
      />
    </Suspense>
  );
}

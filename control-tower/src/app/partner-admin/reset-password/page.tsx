import type { Metadata } from "next";
import { Suspense } from "react";
import { PortalPasswordRecoveryForm } from "@/components/auth/PortalPasswordRecoveryForm";

export const metadata: Metadata = {
  title: "Reset password | My Drip Nurse Admin",
  robots: { index: false, follow: false },
};

export default function PartnerAdminResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <PortalPasswordRecoveryForm
        mode="reset"
        endpoint="/api/partner-admin/auth/reset-password"
        loginHref="/login"
        portalName="Admin Workspace"
      />
    </Suspense>
  );
}

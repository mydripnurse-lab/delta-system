"use client";

import { useState } from "react";

import type { ClientAccount } from "@/lib/clientPortalAuth";
import type { ClientProfileSectionId } from "@/lib/clientProfileSections";

import ClientCarePreferences from "./ClientCarePreferences";
import ClientProfileForm from "./ClientProfileForm";
import styles from "@/app/client-portal/clientPortal.module.css";

export default function ClientProfileSections({
  account,
  nextPath = "",
  initialSection = "personal",
}: {
  account: ClientAccount;
  nextPath?: string;
  initialSection?: ClientProfileSectionId;
}) {
  const [activeSection, setActiveSection] = useState<ClientProfileSectionId | null>(initialSection);

  function toggleSection(section: ClientProfileSectionId) {
    setActiveSection((current) => current === section ? null : section);
  }

  return <div className={styles.profileAccordionShell}>
    <ClientProfileForm
      account={account}
      nextPath={nextPath}
      activeSection={activeSection}
      onToggle={toggleSection}
    />
    <ClientCarePreferences
      account={account}
      nextPath={nextPath}
      activeSection={activeSection}
      onToggle={toggleSection}
    />
  </div>;
}

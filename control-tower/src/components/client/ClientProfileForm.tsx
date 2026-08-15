"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import PhoneInputField from "@/components/shared/PhoneInputField";
import type { ClientAccount } from "@/lib/clientPortalAuth";
import type { ClientProfileSectionId } from "@/lib/clientProfileSections";
import { GENDER_IDENTITY_OPTIONS, normalizeGenderIdentity } from "@/lib/genderIdentity";

import styles from "@/app/client-portal/clientPortal.module.css";

function SectionHeader({
  id,
  number,
  title,
  description,
  status,
  activeSection,
  onToggle,
}: {
  id: ClientProfileSectionId;
  number: string;
  title: string;
  description: string;
  status: string;
  activeSection: ClientProfileSectionId | null;
  onToggle: (section: ClientProfileSectionId) => void;
}) {
  const open = activeSection === id;
  return <button
    type="button"
    className={styles.profileAccordionTrigger}
    aria-expanded={open}
    aria-controls={`profile-section-${id}`}
    onClick={() => onToggle(id)}
  >
    <span className={styles.profileAccordionNumber}>{number}</span>
    <span className={styles.profileAccordionTitle}><b>{title}</b><small>{description}</small></span>
    <span className={styles.profileAccordionStatus}>{status}</span>
    <span className={`${styles.profileAccordionChevron} ${open ? styles.profileAccordionChevronOpen : ""}`} aria-hidden="true">⌄</span>
  </button>;
}

export default function ClientProfileForm({
  account,
  nextPath = "",
  activeSection,
  onToggle,
}: {
  account: ClientAccount;
  nextPath?: string;
  activeSection: ClientProfileSectionId | null;
  onToggle: (section: ClientProfileSectionId) => void;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(account.fullName);
  const [phone, setPhone] = useState(account.phone);
  const [dateOfBirth, setDateOfBirth] = useState(account.dateOfBirth);
  const [emergencyContactName, setEmergencyContactName] = useState(account.emergencyContactName);
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(account.emergencyContactPhone);
  const [weightPounds, setWeightPounds] = useState(account.weightPounds ? String(account.weightPounds) : "");
  const [heightFeet, setHeightFeet] = useState(account.heightInches ? String(Math.floor(account.heightInches / 12)) : "");
  const [heightInches, setHeightInches] = useState(account.heightInches ? String(account.heightInches % 12) : "");
  const [genderIdentity, setGenderIdentity] = useState(() => normalizeGenderIdentity(account.genderIdentity));
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const personalComplete = Boolean(fullName.trim() && phone.trim() && dateOfBirth);
  const wellnessComplete = Boolean(weightPounds && heightFeet && genderIdentity);
  const emergencySaved = Boolean(emergencyContactName.trim() || emergencyContactPhone.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setWorking(true);
    try {
      const response = await fetch("/api/client-account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, phone, dateOfBirth, emergencyContactName, emergencyContactPhone, weightPounds, heightFeet, heightInches, genderIdentity }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your profile could not be saved.");
      setMessage("Your wellness profile is saved.");
      if (nextPath) router.push(nextPath);
      else router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  return <form onSubmit={submit} className={styles.profileAccordionGroup}>
    <article className={`${styles.profileAccordionItem} ${activeSection === "personal" ? styles.profileAccordionItemOpen : ""}`}>
      <SectionHeader id="personal" number="01" title="Personal details" description="Identity and secure contact information" status={personalComplete ? "Complete" : "Needs details"} activeSection={activeSection} onToggle={onToggle} />
      {activeSection === "personal" ? <div id="profile-section-personal" className={styles.profileAccordionPanel}>
        <div className={styles.profileAccordionFields}>
          <label><small>Full name</small><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required maxLength={120} /></label>
          <label><small>Date of birth</small><input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} /></label>
          <PhoneInputField label={<small>Mobile number</small>} value={phone} onValueChange={setPhone} />
          <label><small>Email address</small><input value={account.email} disabled /><span>Verified login email</span></label>
        </div>
        <div className={styles.profileAccordionSave}><p role="status">{message}</p><button type="submit" disabled={working}>{working ? "Saving securely…" : "Save personal details"}</button></div>
      </div> : null}
    </article>

    <article className={`${styles.profileAccordionItem} ${activeSection === "wellness" ? styles.profileAccordionItemOpen : ""}`}>
      <SectionHeader id="wellness" number="02" title="Wellness details" description="Body wellness reference and booking details" status={wellnessComplete ? "Complete" : "Add details"} activeSection={activeSection} onToggle={onToggle} />
      {activeSection === "wellness" ? <div id="profile-section-wellness" className={styles.profileAccordionPanel}>
        <div className={styles.profileAccordionFields}>
          <label><small>Weight (lb)</small><input type="number" min="1" max="1000" step="0.1" value={weightPounds} onChange={(event) => setWeightPounds(event.target.value)} inputMode="decimal" placeholder="e.g. 165" /></label>
          <label><small>Height</small><span className={styles.heightInputGroup}><input type="number" min="1" max="8" step="1" value={heightFeet} onChange={(event) => setHeightFeet(event.target.value)} inputMode="numeric" placeholder="5" aria-label="Height in feet" /><b>ft</b><input type="number" min="0" max="11" step="1" value={heightInches} onChange={(event) => setHeightInches(event.target.value)} inputMode="numeric" placeholder="6" aria-label="Additional height in inches" /><b>in</b></span></label>
          <label className={styles.wideProfileField}><small>Sex / gender</small><select value={genderIdentity} onChange={(event) => setGenderIdentity(normalizeGenderIdentity(event.target.value))}><option value="">Choose an option</option>{GENDER_IDENTITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span>Select Male, Female, or Prefer not to say.</span></label>
        </div>
        <div className={styles.profileAccordionSave}><p role="status">{message}</p><button type="submit" disabled={working}>{working ? "Saving securely…" : "Save wellness details"}</button></div>
      </div> : null}
    </article>

    <article className={`${styles.profileAccordionItem} ${activeSection === "emergency" ? styles.profileAccordionItemOpen : ""}`}>
      <SectionHeader id="emergency" number="03" title="Emergency contact" description="Optional contact kept with your care profile" status={emergencySaved ? "Saved" : "Optional"} activeSection={activeSection} onToggle={onToggle} />
      {activeSection === "emergency" ? <div id="profile-section-emergency" className={styles.profileAccordionPanel}>
        <div className={styles.profileAccordionFields}>
          <label><small>Contact name</small><input value={emergencyContactName} onChange={(event) => setEmergencyContactName(event.target.value)} maxLength={120} placeholder="Full name" /></label>
          <PhoneInputField label={<small>Contact phone</small>} value={emergencyContactPhone} onValueChange={setEmergencyContactPhone} />
        </div>
        <div className={styles.profileAccordionSave}><p role="status">{message}</p><button type="submit" disabled={working}>{working ? "Saving securely…" : "Save emergency contact"}</button></div>
      </div> : null}
    </article>
  </form>;
}

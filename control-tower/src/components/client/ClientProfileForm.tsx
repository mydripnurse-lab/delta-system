"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import PhoneInputField from "@/components/shared/PhoneInputField";
import type { ClientAccount } from "@/lib/clientPortalAuth";
import type { ClientProfileSectionId } from "@/lib/clientProfileSections";
import { GENDER_IDENTITY_OPTIONS, normalizeGenderIdentity } from "@/lib/genderIdentity";
import { phoneIsComplete } from "@/lib/phoneInput";

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
  const [phoneChallengeId, setPhoneChallengeId] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(account.phoneVerified);
  const [phoneMessage, setPhoneMessage] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [phoneWorking, setPhoneWorking] = useState(false);
  const [passwordChallengeId, setPasswordChallengeId] = useState("");
  const [passwordCode, setPasswordCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const personalComplete = Boolean(fullName.trim() && phone.trim() && dateOfBirth && phoneVerified);
  const wellnessComplete = Boolean(weightPounds && heightFeet && genderIdentity);
  const emergencySaved = Boolean(emergencyContactName.trim() || emergencyContactPhone.trim());

  async function saveSection(mode: string, payload: Record<string, unknown>, successMessage: string) {
    setMessage("");
    setWorking(true);
    try {
      const response = await fetch("/api/client-account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, ...payload }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your profile could not be saved.");
      setMessage(successMessage);
      if (nextPath) router.push(nextPath);
      else router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  async function requestPhoneCode() {
    setMessage(""); setPhoneMessage(""); setPhoneError(false); setPhoneWorking(true);
    try {
      const response = await fetch("/api/client-account/security/phone/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
      const result = await response.json().catch(() => ({})) as { error?: string; challengeId?: string };
      if (!response.ok || !result.challengeId) throw new Error(result.error || "The verification code could not be sent.");
      setPhoneChallengeId(result.challengeId); setPhoneCode("");
      setPhoneMessage("We sent a 6-digit code by SMS. It expires in 10 minutes.");
    } catch (error) { setPhoneError(true); setPhoneMessage(error instanceof Error ? error.message : "The verification code could not be sent."); }
    finally { setPhoneWorking(false); }
  }

  async function verifyPhoneCode() {
    setMessage(""); setPhoneMessage(""); setPhoneError(false); setPhoneWorking(true);
    try {
      const response = await fetch("/api/client-account/security/phone/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId: phoneChallengeId, code: phoneCode }) });
      const result = await response.json().catch(() => ({})) as { error?: string; phone?: string };
      if (!response.ok) throw new Error(result.error || "The phone number could not be verified.");
      if (result.phone) setPhone(result.phone);
      setPhoneVerified(true); setPhoneChallengeId(""); setPhoneCode("");
      setPhoneMessage("Verified and saved securely."); router.refresh();
    } catch (error) { setPhoneError(true); setPhoneMessage(error instanceof Error ? error.message : "The phone number could not be verified."); }
    finally { setPhoneWorking(false); }
  }

  async function requestPasswordCode() {
    setMessage(""); setWorking(true);
    try {
      const response = await fetch("/api/client-account/security/password/request", { method: "POST" });
      const result = await response.json().catch(() => ({})) as { error?: string; challengeId?: string };
      if (!response.ok || !result.challengeId) throw new Error(result.error || "The security code could not be sent.");
      setPasswordChallengeId(result.challengeId); setPasswordCode("");
      setMessage("A security code was sent to your verified email.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The security code could not be sent."); }
    finally { setWorking(false); }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) { setMessage("The passwords do not match."); return; }
    setMessage(""); setWorking(true);
    try {
      const response = await fetch("/api/client-account/security/password/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId: passwordChallengeId, code: passwordCode, password: newPassword }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your password could not be updated.");
      setPasswordChallengeId(""); setPasswordCode(""); setNewPassword(""); setConfirmPassword("");
      setMessage("Your password was updated securely.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your password could not be updated."); }
    finally { setWorking(false); }
  }

  return <div className={styles.profileAccordionGroup}>
    <article className={`${styles.profileAccordionItem} ${activeSection === "personal" ? styles.profileAccordionItemOpen : ""}`}>
      <SectionHeader id="personal" number="01" title="Personal details" description="Identity and secure contact information" status={personalComplete ? "Complete" : "Needs details"} activeSection={activeSection} onToggle={onToggle} />
      {activeSection === "personal" ? <div id="profile-section-personal" className={styles.profileAccordionPanel}>
        <div className={styles.profileAccordionFields}>
          <label><small>Full name</small><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required maxLength={120} /></label>
          <label><small>Date of birth</small><input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} /></label>
          <div className={styles.profilePhoneVerification}>
            <div className={styles.profilePhoneInputShell}>
              <PhoneInputField className={styles.profilePhoneInput} label={<small>Mobile number</small>} value={phone} onValueChange={(value) => { setPhone(value); setPhoneVerified(value === account.phone && account.phoneVerified); setPhoneChallengeId(""); setPhoneCode(""); setPhoneMessage(""); setPhoneError(false); }} />
              {phoneVerified
                ? <span className={styles.profilePhoneVerified}>✓ Verified</span>
                : <button type="button" className={styles.profilePhoneVerifyAction} disabled={phoneWorking || !phoneIsComplete(phone)} onClick={() => void requestPhoneCode()}>{phoneWorking ? "Sending…" : phoneChallengeId ? "Resend" : "Verify"}</button>}
            </div>
            {!phoneVerified && phoneChallengeId ? <div className={styles.profilePhoneOtp}>
              <input value={phoneCode} onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Phone verification code" autoFocus />
              <button type="button" disabled={phoneWorking || phoneCode.length !== 6} onClick={() => void verifyPhoneCode()}>{phoneWorking ? "Verifying…" : "Verify & save"}</button>
            </div> : null}
            <span className={`${styles.profilePhoneMessage} ${phoneError ? styles.profilePhoneMessageError : ""}`} role="status">{phoneMessage || (phoneVerified ? "Saved for appointment updates and account security." : "Verify this number to save it to your Care profile.")}</span>
          </div>
          <label><small>Email address</small><input value={account.email} disabled /><span>Verified login email</span></label>
        </div>
        <div className={styles.profileSecurityPanel}>
          <div><b>Password & security</b><p>Use a one-time code sent to your verified email before choosing a new password.</p></div>
          {passwordChallengeId ? <div className={styles.profilePasswordGrid}><input value={passwordCode} onChange={(event) => setPasswordCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="Security code" aria-label="Password security code" /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="New password" aria-label="New password" /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Confirm password" aria-label="Confirm new password" /><button type="button" disabled={working || passwordCode.length !== 6 || !newPassword || !confirmPassword} onClick={() => void changePassword()}>Update password</button></div> : <button type="button" className={styles.profileSecondaryAction} disabled={working} onClick={() => void requestPasswordCode()}>Change password</button>}
        </div>
        <div className={styles.profileAccordionSave}><p role="status">{message}</p><button type="button" disabled={working} onClick={() => void saveSection("personal_details", { fullName, dateOfBirth }, "Personal details saved.")}>{working ? "Saving securely…" : "Save changes"}</button></div>
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
        <div className={styles.profileAccordionSave}><p role="status">{message}</p><button type="button" disabled={working} onClick={() => void saveSection("wellness_details", { weightPounds, heightFeet, heightInches, genderIdentity }, "Wellness details saved.")}>{working ? "Saving securely…" : "Save changes"}</button></div>
      </div> : null}
    </article>

    <article className={`${styles.profileAccordionItem} ${activeSection === "emergency" ? styles.profileAccordionItemOpen : ""}`}>
      <SectionHeader id="emergency" number="03" title="Emergency contact" description="Optional contact kept with your care profile" status={emergencySaved ? "Saved" : "Optional"} activeSection={activeSection} onToggle={onToggle} />
      {activeSection === "emergency" ? <div id="profile-section-emergency" className={styles.profileAccordionPanel}>
        <div className={styles.profileAccordionFields}>
          <label><small>Contact name</small><input value={emergencyContactName} onChange={(event) => setEmergencyContactName(event.target.value)} maxLength={120} placeholder="Full name" /></label>
          <PhoneInputField label={<small>Contact phone</small>} value={emergencyContactPhone} onValueChange={setEmergencyContactPhone} />
        </div>
        <div className={styles.profileAccordionSave}><p role="status">{message}</p><button type="button" disabled={working} onClick={() => void saveSection("emergency_contact", { emergencyContactName, emergencyContactPhone }, "Emergency contact saved.")}>{working ? "Saving securely…" : "Save changes"}</button></div>
      </div> : null}
    </article>
  </div>;
}

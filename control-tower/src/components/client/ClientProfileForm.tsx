"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import PhoneInputField from "@/components/shared/PhoneInputField";
import type { ClientAccount } from "@/lib/clientPortalAuth";

import styles from "@/app/client-portal/clientPortal.module.css";

export default function ClientProfileForm({ account, nextPath = "" }: { account: ClientAccount; nextPath?: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(account.fullName);
  const [phone, setPhone] = useState(account.phone);
  const [dateOfBirth, setDateOfBirth] = useState(account.dateOfBirth);
  const [emergencyContactName, setEmergencyContactName] = useState(account.emergencyContactName);
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(account.emergencyContactPhone);
  const [weightPounds, setWeightPounds] = useState(account.weightPounds ? String(account.weightPounds) : "");
  const [heightFeet, setHeightFeet] = useState(account.heightInches ? String(Math.floor(account.heightInches / 12)) : "");
  const [heightInches, setHeightInches] = useState(account.heightInches ? String(account.heightInches % 12) : "");
  const [genderIdentity, setGenderIdentity] = useState(account.genderIdentity);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

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

  return <form onSubmit={submit} className={styles.profileEditForm}>
    <div className={styles.profileFormSection}><span>01</span><div><b>Personal details</b><small>Your identity and secure contact information.</small></div></div>
    <label><small>Full name</small><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required maxLength={120} /></label>
    <label><small>Date of birth</small><input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} /></label>
    <PhoneInputField label={<small>Mobile number</small>} value={phone} onValueChange={setPhone} />
    <label><small>Email address</small><input value={account.email} disabled /><span>Verified login email</span></label>

    <div className={styles.profileFormSection}><span>02</span><div><b>Wellness details</b><small>Used to prefill future bookings and calculate your general body wellness reference.</small></div></div>
    <label><small>Weight (lb)</small><input type="number" min="1" max="1000" step="0.1" value={weightPounds} onChange={(event) => setWeightPounds(event.target.value)} inputMode="decimal" placeholder="e.g. 165" /></label>
    <label><small>Height</small><span className={styles.heightInputGroup}><input type="number" min="1" max="8" step="1" value={heightFeet} onChange={(event) => setHeightFeet(event.target.value)} inputMode="numeric" placeholder="5" aria-label="Height in feet" /><b>ft</b><input type="number" min="0" max="11" step="1" value={heightInches} onChange={(event) => setHeightInches(event.target.value)} inputMode="numeric" placeholder="6" aria-label="Additional height in inches" /><b>in</b></span></label>
    <label className={styles.wideProfileField}><small>Sex / gender</small><select value={genderIdentity} onChange={(event) => setGenderIdentity(event.target.value)}><option value="">Choose an option</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="intersex">Intersex</option><option value="another_identity">Another identity</option><option value="prefer_not_to_say">Prefer not to say</option></select><span>Choose the option that best represents you. “Prefer not to say” is always available.</span></label>

    <div className={styles.profileFormSection}><span>03</span><div><b>Emergency contact</b><small>Optional. Kept with your care profile for future visits.</small></div></div>
    <label><small>Contact name</small><input value={emergencyContactName} onChange={(event) => setEmergencyContactName(event.target.value)} maxLength={120} placeholder="Full name" /></label>
    <PhoneInputField label={<small>Contact phone</small>} value={emergencyContactPhone} onValueChange={setEmergencyContactPhone} />
    <div className={styles.profileFormFooter}><p role="status">{message}</p><button type="submit" disabled={working}>{working ? "Saving securely…" : "Save profile"}</button></div>
  </form>;
}

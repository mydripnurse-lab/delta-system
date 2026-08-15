"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { ClientBodyWellnessReference as BodyWellnessReference } from "@/lib/clientPortalAuth";

import styles from "@/app/client-portal/clientPortal.module.css";

type WellnessProfile = {
  dateOfBirth: string;
  weightPounds: number | null;
  heightInches: number | null;
};

type Props = {
  reference: BodyWellnessReference | null;
  profile: WellnessProfile;
};

function WellnessDetailsEditor({ profile }: { profile: WellnessProfile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth);
  const [weightPounds, setWeightPounds] = useState(profile.weightPounds ? String(profile.weightPounds) : "");
  const [heightFeet, setHeightFeet] = useState(profile.heightInches ? String(Math.floor(profile.heightInches / 12)) : "");
  const [heightInches, setHeightInches] = useState(profile.heightInches ? String(profile.heightInches % 12) : "");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const needsDateOfBirth = !profile.dateOfBirth;
  const needsWeight = !profile.weightPounds;
  const needsHeight = !profile.heightInches;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setWorking(true);
    try {
      const response = await fetch("/api/client-account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "wellness_reference",
          dateOfBirth,
          weightPounds,
          heightFeet,
          heightInches,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your wellness details could not be saved.");
      setMessage("Saved. Updating your private reference…");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your wellness details could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.bodyWellnessCompletion} data-open={open ? "true" : "false"}>
      <button type="button" aria-expanded={open} aria-controls="body-wellness-editor" onClick={() => { setMessage(""); setOpen((current) => !current); }}>
        <span>{open ? "Close details" : "Complete wellness details"}</span>
        <i aria-hidden="true">{open ? "−" : "+"}</i>
      </button>
      {open ? <form id="body-wellness-editor" onSubmit={save} className={styles.bodyWellnessForm}>
        <div className={styles.bodyWellnessFormIntro}>
          <strong>Only the essentials.</strong>
          <p>These private details calculate your general body wellness reference and help prefill future bookings.</p>
        </div>
        <div className={styles.bodyWellnessFields}>
          {needsDateOfBirth ? <label>
            <span>Date of birth</span>
            <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} required />
          </label> : null}
          {needsWeight ? <label>
            <span>Weight</span>
            <span className={styles.bodyWellnessUnitInput}><input type="number" min="1" max="1000" step="0.1" value={weightPounds} onChange={(event) => setWeightPounds(event.target.value)} inputMode="decimal" placeholder="165" required /><b>lb</b></span>
          </label> : null}
          {needsHeight ? <label>
            <span>Height</span>
            <span className={styles.bodyWellnessHeightInput}>
              <input type="number" min="1" max="8" step="1" value={heightFeet} onChange={(event) => setHeightFeet(event.target.value)} inputMode="numeric" placeholder="5" aria-label="Height in feet" required /><b>ft</b>
              <input type="number" min="0" max="11" step="1" value={heightInches} onChange={(event) => setHeightInches(event.target.value)} inputMode="numeric" placeholder="6" aria-label="Additional height in inches" required /><b>in</b>
            </span>
          </label> : null}
        </div>
        <div className={styles.bodyWellnessFormFooter}>
          <p role="status">{message}</p>
          <button type="submit" disabled={working}>{working ? "Saving…" : "Save and calculate"}<span aria-hidden="true">→</span></button>
        </div>
      </form> : null}
    </div>
  );
}

export default function ClientBodyWellnessReference({ reference, profile }: Props) {
  if (!reference) {
    return (
      <section className={`${styles.bodyWellnessReference} ${styles.bodyWellnessIncomplete}`} aria-labelledby="body-wellness-title">
        <div className={styles.bodyWellnessSummary}>
          <span>Body wellness reference</span>
          <strong>—</strong>
          <p>Add your private details</p>
        </div>
        <div className={styles.bodyWellnessDetails}>
          <span className={styles.eyebrow}>General adult reference</span>
          <h2 id="body-wellness-title">A private reference, ready when you are.</h2>
          <p>Add the missing details below to see a neutral wellness reference and an orientative range for your height.</p>
          <small>This is a general wellness reference, not a diagnosis.</small>
          <WellnessDetailsEditor profile={profile} />
        </div>
      </section>
    );
  }

  if (reference.kind !== "adult") {
    const needsAge = reference.kind === "age_required";
    return (
      <section className={`${styles.bodyWellnessReference} ${styles.bodyWellnessIncomplete}`} aria-labelledby="body-wellness-title">
        <div className={styles.bodyWellnessSummary}>
          <span>Body wellness reference</span>
          <strong>{reference.bmi.toFixed(1)}</strong>
          <p>{reference.statusLabel}</p>
        </div>
        <div className={styles.bodyWellnessDetails}>
          <span className={styles.eyebrow}>{needsAge ? "One detail remains" : "Age-specific guidance"}</span>
          <h2 id="body-wellness-title">Your reference deserves the right context.</h2>
          <p>{needsAge
            ? "Add your date of birth so Care can determine whether the general adult reference applies."
            : "For people under 20, body measurements must be interpreted with age- and sex-specific growth charts by a qualified professional."}</p>
          <small>This result is shown without an adult range and is not a diagnosis.</small>
          {needsAge ? <WellnessDetailsEditor profile={profile} /> : null}
        </div>
      </section>
    );
  }

  const isWithin = reference.status === "within";
  return (
    <section className={`${styles.bodyWellnessReference} ${isWithin ? styles.bodyWellnessWithin : styles.bodyWellnessOutside}`} aria-labelledby="body-wellness-title">
      <div className={styles.bodyWellnessSummary}>
        <span>Body wellness reference</span>
        <strong>{reference.bmi.toFixed(1)}</strong>
        <p>{reference.statusLabel}</p>
      </div>
      <div className={styles.bodyWellnessDetails}>
        <div className={styles.bodyWellnessHeading}>
          <div>
            <span className={styles.eyebrow}>General adult reference for your height</span>
            <h2 id="body-wellness-title">{reference.lowerPounds}–{reference.upperPounds} lb</h2>
          </div>
          <span className={styles.bodyWellnessStatus}>{reference.statusLabel}</span>
        </div>
        <div className={styles.bodyWellnessScale} aria-label={`BMI ${reference.bmi.toFixed(1)}. ${reference.statusLabel}.`}>
          <div className={styles.bodyWellnessTrack}>
            <span className={styles.bodyWellnessMarker} style={{ left: `${reference.markerPercent}%` }}>
              <i>{reference.bmi.toFixed(1)}</i>
            </span>
          </div>
          <div className={styles.bodyWellnessLabels} aria-hidden="true">
            <span>Lower reference</span>
            <span>General reference</span>
            <span>Above reference</span>
          </div>
        </div>
        <p>This is a general wellness reference based on your height and weight, not a diagnosis.</p>
      </div>
    </section>
  );
}

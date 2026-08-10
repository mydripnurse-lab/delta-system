"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";

type AvailabilityDay = {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type Availability = {
  timezone: string;
  days: AvailabilityDay[];
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = [
  ["America/New_York", "Eastern Time"],
  ["America/Chicago", "Central Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Phoenix", "Arizona Time"],
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Puerto_Rico", "Puerto Rico Time"],
] as const;

export function ApplicationAvailabilityPanel({ applicationId }: { applicationId: string }) {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/availability`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Partner availability.");
      setAvailability(payload.availability);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Partner availability.");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  function updateDay(dayOfWeek: number, patch: Partial<AvailabilityDay>) {
    setAvailability((current) => current ? {
      ...current,
      days: current.days.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day),
    } : current);
  }

  async function save() {
    if (!availability) return;
    const invalid = availability.days.find((day) => day.enabled && day.startTime >= day.endTime);
    if (invalid) {
      setError(`${DAY_NAMES[invalid.dayOfWeek]} must end after it starts.`);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(availability),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save Partner availability.");
      setAvailability(payload.availability);
      setNotice("Weekly availability saved. Every service still enforces the 2-hour minimum notice.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save Partner availability.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${styles.panel} ${styles.partnerAvailabilityPanel}`}>
      <div className={styles.panelHeader}>
        <div className={styles.partnerCalendarHeading}>
          <div>
            <span className={styles.eyebrow}>Booking availability</span>
            <h2>Weekly working hours</h2>
            <span className={styles.subtle}>These hours apply to every active service. Partners can also maintain them from their portal.</span>
          </div>
          <span className={`${styles.badge} ${styles.info}`}>2-hour minimum notice</span>
        </div>
      </div>

      {error ? <div className={styles.notice}>{error}</div> : null}
      {notice ? <div className={styles.successNotice}>{notice}</div> : null}
      {loading ? <div className={styles.loading}>Loading weekly availability…</div> : null}

      {!loading && availability ? (
        <div className={styles.availabilityEditor}>
          <label className={styles.formField}>
            <span>Partner timezone</span>
            <select className={styles.select} value={availability.timezone} onChange={(event) => setAvailability({ ...availability, timezone: event.target.value })}>
              {TIMEZONES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <div className={styles.availabilityDays}>
            {availability.days.map((day) => (
              <div className={`${styles.availabilityDay} ${day.enabled ? styles.availabilityDayActive : ""}`} key={day.dayOfWeek}>
                <label className={styles.availabilityToggle}>
                  <input type="checkbox" checked={day.enabled} onChange={(event) => updateDay(day.dayOfWeek, { enabled: event.target.checked })} />
                  <strong>{DAY_NAMES[day.dayOfWeek]}</strong>
                </label>
                {day.enabled ? (
                  <div className={styles.availabilityTimes}>
                    <label><span>From</span><input type="time" value={day.startTime} onChange={(event) => updateDay(day.dayOfWeek, { startTime: event.target.value })} /></label>
                    <span aria-hidden="true">→</span>
                    <label><span>To</span><input type="time" value={day.endTime} onChange={(event) => updateDay(day.dayOfWeek, { endTime: event.target.value })} /></label>
                  </div>
                ) : <span className={styles.availabilityClosed}>Unavailable</span>}
              </div>
            ))}
          </div>
          <div className={styles.availabilityActions}>
            <span>Bookings are shown only when coverage, service access and these working hours all match.</span>
            <button type="button" className={styles.button} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save availability"}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";

import styles from "./ClientAppointmentReview.module.css";

type ExistingReview = { rating: number; comment: string; createdAt: string } | null;

export default function ClientAppointmentReview({ appointmentId, partnerName, existingReview }: { appointmentId: string; partnerName: string; existingReview: ExistingReview }) {
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [comment, setComment] = useState(existingReview?.comment || "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit() {
    if (!rating) return;
    setState("saving");
    const response = await fetch(`/api/client-account/appointments/${encodeURIComponent(appointmentId)}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    setState(response.ok ? "saved" : "error");
  }

  return (
    <section className={styles.review} aria-label={`Review your visit with ${partnerName}`}>
      <div className={styles.copy}>
        <span>Verified visit</span>
        <h4>{existingReview ? "Your care review" : "How was your wellness experience?"}</h4>
        <p>Your feedback helps patients choose care with confidence.</p>
      </div>
      <div className={styles.form}>
        <div className={styles.stars} role="group" aria-label="Select a rating from one to five stars">
          {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={value <= rating} onClick={() => { setRating(value); setState("idle"); }}>★</button>)}
        </div>
        <textarea value={comment} maxLength={600} onChange={(event) => { setComment(event.target.value); setState("idle"); }} placeholder="Share a few words about your care (optional)" />
        <div className={styles.actions}><small>{state === "saved" ? "Review saved." : state === "error" ? "We couldn’t save it. Please try again." : `${comment.length}/600`}</small><button type="button" disabled={!rating || state === "saving"} onClick={submit}>{state === "saving" ? "Saving…" : existingReview ? "Update review" : "Share review"}</button></div>
      </div>
    </section>
  );
}

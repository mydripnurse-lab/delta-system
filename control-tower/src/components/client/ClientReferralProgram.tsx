"use client";

import Link from "next/link";
import { FormEvent, useState, type CSSProperties } from "react";

import PhoneInputField from "@/components/shared/PhoneInputField";
import type { ClientReferralSummary } from "@/lib/clientReferrals";
import styles from "@/app/client-portal/clientPortal.module.css";

type CreateResult = {
  registrationUrl: string;
  smsMessage: string;
  deliveryStatus: string;
  summary: ClientReferralSummary;
};

function personLabel(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function completeInvitationMessage(message: string, url: string) {
  const cleanMessage = message.trim();
  return cleanMessage.includes(url) ? cleanMessage : `${cleanMessage}\n${url}`;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

function smsComposerUrl(phone: string, message: string) {
  const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?";
  return `sms:${phone.replace(/[^+\d]/g, "")}${separator}body=${encodeURIComponent(message)}`;
}

export default function ClientReferralProgram({ initialSummary }: { initialSummary: ClientReferralSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [latestInvite, setLatestInvite] = useState<{ url: string; message: string; phone: string } | null>(null);
  const discountLabel = summary.discountPercentageLabel;

  async function shareInvitation(input: { url: string; message: string; phone?: string; automatic?: boolean }) {
    const message = completeInvitationMessage(input.message, input.url);
    try {
      if (navigator.share) {
        await navigator.share({ title: "A personal My Drip Nurse invitation", text: message });
        setNotice("Invitation saved and shared. It will count after your friend verifies their Care account.");
        return;
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") {
        setNotice("Invitation saved. You can share it anytime from your invitation activity.");
        return;
      }
      // Some mobile browsers expire native share permission while the invitation
      // is being saved. Continue with the prefilled Messages composer instead.
    }

    if (input.phone && isMobileDevice()) {
      setNotice("Invitation saved. Your text message is ready to send.");
      window.location.assign(smsComposerUrl(input.phone, message));
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
      setNotice(input.automatic
        ? "Invitation saved. The complete message and personal link were copied."
        : "Complete invitation message copied.");
    } catch {
      setError("Invitation saved, but the message could not be opened. Use Share from the invitation activity below.");
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const invitePhone = String(data.get("phone") || "");
    try {
      const response = await fetch("/api/client-account/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.get("firstName"),
          lastName: data.get("lastName"),
          phone: data.get("phone"),
          email: data.get("email"),
        }),
      });
      const result = await response.json().catch(() => ({})) as Partial<CreateResult> & { error?: string };
      if (!response.ok || !result.summary || !result.registrationUrl || !result.smsMessage) {
        throw new Error(result.error || "We could not create this invitation.");
      }
      setSummary(result.summary);
      const savedInvite = { url: result.registrationUrl, message: result.smsMessage, phone: invitePhone };
      setLatestInvite(savedInvite);
      form.reset();
      await shareInvitation({ ...savedInvite, automatic: true });
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "We could not create this invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  const rewardTitle = summary.rewardStatus === "available"
    ? `Your ${summary.discountPercentageLabel} appointment discount is ready.`
    : summary.rewardStatus === "redeemed"
      ? "Reward used. Thank you for growing the community."
      : `${summary.remainingCount} registration${summary.remainingCount === 1 ? "" : "s"} to unlock your reward.`;

  return (
    <div className={styles.referralExperience}>
      <Link href="/rewards" className={styles.rewardBackLink}>← All rewards</Link>
      <section className={styles.referralHero}>
        <div className={styles.referralHeroCopy}>
          <span className={styles.eyebrow}>Rewards · Share care</span>
          <h1>Wellness is better<br />when it is shared.</h1>
          <p>Invite 10 people to create a verified My Drip Nurse Care account. When all 10 register, you receive <strong>{discountLabel} off</strong> your next eligible appointment.</p>
          <div className={styles.referralTrustLine}><span>✓</span> Your {discountLabel} reward is applied automatically when you book.</div>
        </div>
        <div className={styles.referralProgressCard}>
          <div className={styles.referralProgressTop}>
            <div><small>Verified registrations</small><strong>{summary.registeredCount}<span> / {summary.goal}</span></strong></div>
            <div className={styles.referralProgressRing} style={{ "--referral-progress": `${summary.percent * 3.6}deg` } as CSSProperties}><span>{summary.percent}%</span></div>
          </div>
          <div className={styles.referralMilestones} aria-label={`${summary.registeredCount} of ${summary.goal} registrations complete`}>
            {Array.from({ length: summary.goal }, (_, index) => <span key={index} className={index < summary.registeredCount ? styles.referralMilestoneComplete : ""}>{index + 1}</span>)}
          </div>
          <div className={`${styles.referralRewardState} ${summary.rewardStatus === "available" ? styles.referralRewardAvailable : ""}`}>
            <span aria-hidden="true">✦</span><div><small>{summary.rewardStatus === "available" ? "Reward ready" : summary.rewardStatus === "redeemed" ? "Reward complete" : "Your progress"}</small><strong>{rewardTitle}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.referralInviteGrid}>
        <article className={styles.referralFormCard}>
          <div className={styles.referralSectionHeading}><span>01</span><div><small>Personal invitation</small><h2>Invite someone you know.</h2><p>Mobile number is required because the invitation is designed to arrive by text. Email is optional.</p></div></div>
          <form onSubmit={invite} className={styles.referralForm}>
            <div className={styles.referralNameFields}>
              <label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} placeholder="First name" /></label>
              <label>Last name<input name="lastName" autoComplete="family-name" required maxLength={80} placeholder="Last name" /></label>
            </div>
            <PhoneInputField name="phone" label="Mobile number" required />
            <label>Email address <small>Optional</small><input name="email" type="email" autoComplete="email" maxLength={254} placeholder="friend@example.com" /></label>
            {error ? <p className={styles.referralError} role="alert">{error}</p> : null}
            {notice ? <p className={styles.referralNotice} role="status">{notice}</p> : null}
            <button type="submit" disabled={submitting}>{submitting ? "Creating invitation…" : "Send personal invitation"}<span>→</span></button>
          </form>
          {latestInvite ? <div className={styles.referralShareResult}><div><small>Saved personal invitation</small><p>{latestInvite.url}</p></div><button type="button" onClick={() => void shareInvitation(latestInvite)}>Share again</button></div> : null}
        </article>

        <article className={styles.referralHowItWorks}>
          <span className={styles.eyebrow}>How it works</span>
          <ol>
            <li><span>1</span><div><strong>Invite personally</strong><p>Add their name and mobile number. Each person receives their own registration link.</p></div></li>
            <li><span>2</span><div><strong>They create an account</strong><p>An invitation counts only after the new Care account is verified. Sending a link alone does not count.</p></div></li>
            <li><span>3</span><div><strong>Unlock {summary.discountPercentageLabel} off at 10</strong><p>Your one-time appointment discount is calculated and applied automatically at booking.</p></div></li>
          </ol>
          <p className={styles.referralFinePrint}>One verified account per mobile number. Existing users, duplicate accounts and self-referrals are not eligible.</p>
        </article>
      </section>

      <section className={styles.referralHistory}>
        <div className={styles.referralHistoryHeader}><div><span className={styles.eyebrow}>Invitation activity</span><h2>Your community.</h2></div><strong>{summary.invitedCount} invited</strong></div>
        {summary.invites.length ? <ul>{summary.invites.map((inviteItem) => (
          <li key={inviteItem.id}>
            <span className={styles.referralPersonAvatar}>{inviteItem.firstName.slice(0, 1)}{inviteItem.lastName.slice(0, 1)}</span>
            <div><strong>{personLabel(inviteItem.firstName, inviteItem.lastName)}</strong><small>{inviteItem.phone}{inviteItem.email ? ` · ${inviteItem.email}` : ""}</small></div>
            <span className={inviteItem.status === "registered" ? styles.referralRegistered : styles.referralPending}>{inviteItem.status === "registered" ? "Registered" : "Invited"}</span>
            {inviteItem.status !== "registered" ? <button type="button" onClick={() => void shareInvitation({
              url: inviteItem.registrationUrl,
              phone: inviteItem.phone,
              message: `Hi ${inviteItem.firstName}! You received a personal invitation to join My Drip Nurse Care. Create your free account and explore mobile wellness care: ${inviteItem.registrationUrl}`,
            })}>Share</button> : null}
          </li>
        ))}</ul> : <div className={styles.referralEmpty}><span aria-hidden="true">✦</span><h3>Your first invitation starts here.</h3><p>Add someone above. We will track their registration securely.</p></div>}
      </section>
    </div>
  );
}

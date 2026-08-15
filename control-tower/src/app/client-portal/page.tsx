import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import ClientVisitMap from "@/components/client/ClientVisitMap";
import ClientVisitProgress, { clientVisitStatusLabel } from "@/components/client/ClientVisitProgress";
import ClientCareProfessional from "@/components/client/ClientCareProfessional";
import ClientBodyWellnessReference from "@/components/client/ClientBodyWellnessReference";
import ClientVisitAutoRefresh from "@/components/client/ClientVisitAutoRefresh";
import { calculateClientBodyWellnessReference, getAuthenticatedClient, getClientProfileCompletion } from "@/lib/clientPortalAuth";
import { getClientAppointments } from "@/lib/clientPortalData";
import { getClientReferralSummary } from "@/lib/clientReferrals";
import { getClientVisitRewardSummary } from "@/lib/clientRewards";

import styles from "./clientPortal.module.css";

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function appointmentPaymentSummary(appointment: {
  rewardBenefit: "none" | "deposit_waiver" | "free_appointment";
  depositAmount: number;
  currency: string;
  paymentStatus: string;
}) {
  if (appointment.rewardBenefit === "free_appointment") {
    return { label: "Free visit reward", value: "Visit covered", detail: "No deposit or payment due" };
  }
  if (appointment.rewardBenefit === "deposit_waiver") {
    return { label: "Care reward", value: "Deposit covered", detail: "Care professional payment unchanged" };
  }
  return {
    label: "Booking deposit",
    value: money(appointment.depositAmount, appointment.currency),
    detail: appointment.paymentStatus === "paid" ? "Paid securely" : appointment.paymentStatus.replaceAll("_", " "),
  };
}

export default async function ClientHomePage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login");
  const [appointments, referrals, visitRewards, nadVisitRewards] = await Promise.all([
    getClientAppointments(account.id),
    getClientReferralSummary(account.id),
    getClientVisitRewardSummary(account.id, "wellness"),
    getClientVisitRewardSummary(account.id, "nad_family"),
  ]);
  const activeStatuses = new Set(["payment_pending", "confirmed", "partner_acknowledged", "in_progress"]);
  const upcomingVisits = appointments
    .filter((item) => activeStatuses.has(item.status))
    .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || a.startsAt.localeCompare(b.startsAt));
  const upcoming = upcomingVisits[0];
  const completedVisits = appointments.filter((item) => item.status === "completed").length;
  const firstName = account.fullName.split(/\s+/)[0] || "there";
  const profile = getClientProfileCompletion(account);
  const bodyWellnessReference = calculateClientBodyWellnessReference(account);
  const upcomingPayment = upcoming ? appointmentPaymentSummary(upcoming) : null;

  return (
    <div className={styles.pageShell}>
      <ClientVisitAutoRefresh enabled={Boolean(upcoming && !upcoming.partnerAccepted)} />
      <section className={styles.welcomeHero}>
        <div>
          <span className={styles.eyebrow}>My care</span>
          <h1>Welcome, {firstName}.</h1>
          <p>Your private wellness command center—appointments, professionals and care details in one calm experience.</p>
        </div>
        <Link href="/book" className={styles.primaryAction}>Book mobile care <span>→</span></Link>
      </section>

      <section className={styles.careMetrics} aria-label="Care overview">
        <article><span>Next visit</span><strong>{upcoming ? displayDate(upcoming.startsAt).split(",").slice(0, 2).join(",") : "Not scheduled"}</strong><small>{upcoming ? clientVisitStatusLabel(upcoming.status) : "Book whenever you are ready"}</small></article>
        <article><span>Upcoming</span><strong>{upcomingVisits.length}</strong><small>Active wellness visit{upcomingVisits.length === 1 ? "" : "s"}</small></article>
        <article><span>Completed</span><strong>{completedVisits}</strong><small>Visits in your care history</small></article>
      </section>

      <ClientBodyWellnessReference
        reference={bodyWellnessReference}
        profile={{
          dateOfBirth: account.dateOfBirth,
          weightPounds: account.weightPounds,
          heightInches: account.heightInches,
        }}
      />

      {upcoming ? <section className={`${styles.commandCenter} ${!upcoming.partnerAccepted ? styles.pendingCommandCenter : ""}`}>
        <div className={styles.commandCenterMain}>
          {!upcoming.partnerAccepted ? <div className={styles.pendingVisitSignal}><span aria-hidden="true" /><div><small>Care team matching</small><strong>Your appointment is secured.</strong><p>We’ll reveal your professional’s name and photo as soon as they accept the visit.</p></div></div> : null}
          <div className={styles.commandHeader}>
            <div><span className={styles.eyebrow}>{upcoming.partnerAccepted ? "Your next visit" : "Upcoming appointment"}</span><h2>{upcoming.serviceName}</h2></div>
            <span className={upcoming.status === "in_progress" ? styles.attentionPill : styles.statusPill}>{clientVisitStatusLabel(upcoming.status)}</span>
          </div>
          <div className={styles.commandFacts}>
            <div><small>When</small><b>{displayDate(upcoming.startsAt)}</b></div>
            <div className={styles.commandProfessionalFact}><ClientCareProfessional accepted={upcoming.partnerAccepted} name={upcoming.partnerName} photoUrl={upcoming.partnerPhotoUrl} publicTitle={upcoming.partnerPublicTitle} credentials={upcoming.partnerCredentials} compact /></div>
            <div><small>Service address</small><b>{upcoming.addressLine1}<br />{upcoming.city}, {upcoming.state} {upcoming.postalCode}</b></div>
            <div><small>{upcomingPayment?.label}</small><b>{upcomingPayment?.value}</b><span>{upcomingPayment?.detail}</span></div>
          </div>
          <ClientVisitProgress status={upcoming.status} />
          <div className={styles.commandFooter}><span>Reference {upcoming.reference}</span><Link href="/appointments">Open visit details <b>→</b></Link></div>
        </div>
        <ClientVisitMap addressLine1={upcoming.addressLine1} addressLine2={upcoming.addressLine2} city={upcoming.city} state={upcoming.state} postalCode={upcoming.postalCode} />
      </section> : <section className={styles.noVisitCommand}>
        <div className={styles.noVisitVisual}>
          <Image
            src="/brand/care-mobile-iv-at-home.jpeg"
            alt="A patient enjoying a My Drip Nurse mobile IV wellness visit at home"
            fill
            sizes="(max-width: 640px) calc(100vw - 28px), (max-width: 980px) calc(100vw - 32px), 42vw"
            quality={88}
          />
          <div className={styles.noVisitVisualCaption}>
            <span aria-hidden="true">✦</span>
            <div><small>Mobile wellness</small><p>Care that comes to you</p></div>
          </div>
        </div>
        <div className={styles.noVisitContent}>
          <span className={styles.eyebrow}>Next visit</span>
          <h2>Your next wellness moment starts here.</h2>
          <p>
            Choose the care that fits your needs, select a convenient time, and we will bring the
            My Drip Nurse experience directly to you.
          </p>
          <Link href="/book">
            Book mobile care <b>→</b>
          </Link>
        </div>
      </section>}

      <section className={styles.homeGridSecondary}>
        <article className={styles.careCard}>
          <span className={styles.eyebrow}>Care profile · {profile.percent}%</span>
          <h2>Less repetition. More care.</h2>
          <p>{profile.complete ? "Your essentials are ready to prefill future bookings." : `${profile.missing.length} optional step${profile.missing.length === 1 ? "" : "s"} remain. You can keep exploring and finish them anytime.`}</p>
          <div className={styles.profileProgress}><span style={{ width: `${profile.percent}%` }} /></div>
          <Link href="/profile">{profile.complete ? "Review your profile" : "Continue your profile"} <span>→</span></Link>
        </article>
        <div className={styles.quickStack}>
          <Link href="/services"><span>Services</span><h3>Explore the complete wellness catalog.</h3><b>Browse →</b></Link>
          <Link href="/appointments"><span>Appointments</span><h3>Your full care timeline.</h3><b>Open →</b></Link>
          <Link href="/rewards" className={styles.referralHomeLink}>
            <span>Rewards · {Number(referrals.rewardStatus === "available") + visitRewards.availableRewards + nadVisitRewards.availableRewards} ready</span>
            <h3>{referrals.rewardStatus === "available" || visitRewards.availableRewards || nadVisitRewards.availableRewards ? "You have a Care reward ready." : "Every visit moves you forward."}</h3>
            <div className={styles.referralHomeProgress}><i style={{ width: `${Math.max(referrals.percent, visitRewards.percent, nadVisitRewards.percent)}%` }} /></div>
            <b>{referrals.rewardStatus === "available" || visitRewards.availableRewards || nadVisitRewards.availableRewards ? "View rewards" : "See your progress"} →</b>
          </Link>
        </div>
      </section>
    </div>
  );
}

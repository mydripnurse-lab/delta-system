import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { clientVisitStatusLabel } from "@/components/client/ClientVisitProgress";
import ClientCareProfessional from "@/components/client/ClientCareProfessional";
import ClientBodyWellnessReference from "@/components/client/ClientBodyWellnessReference";
import ClientVisitAutoRefresh from "@/components/client/ClientVisitAutoRefresh";
import ClientVisitMap from "@/components/client/ClientVisitMap";
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
  clientAmountDueAtVisit: number;
}) {
  if (appointment.rewardBenefit === "free_appointment") {
    return {
      paidTodayLabel: "Amount paid today",
      paidTodayValue: money(0, appointment.currency),
      paidTodayDetail: "No payment due",
      dueAtVisitLabel: "Amount due at visit",
      dueAtVisitValue: money(0, appointment.currency),
      dueAtVisitDetail: "Covered by your visit reward",
    };
  }
  if (appointment.rewardBenefit === "deposit_waiver") {
    return {
      paidTodayLabel: "Amount paid today",
      paidTodayValue: money(0, appointment.currency),
      paidTodayDetail: "Covered by your visit reward",
      dueAtVisitLabel: "Amount due at visit",
      dueAtVisitValue: money(appointment.clientAmountDueAtVisit, appointment.currency),
      dueAtVisitDetail: "Deposit was waived",
    };
  }
  return {
    paidTodayLabel: "Amount paid today",
    paidTodayValue: money(appointment.depositAmount, appointment.currency),
    paidTodayDetail: appointment.paymentStatus === "paid" ? "Booking charge paid" : "Waiting for booking charge",
    dueAtVisitLabel: "Amount due at visit",
    dueAtVisitValue: money(appointment.clientAmountDueAtVisit, appointment.currency),
    dueAtVisitDetail: appointment.clientAmountDueAtVisit > 0 ? "Pay this in-person at your visit" : "Nothing due at visit",
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
  const upcomingQueue = upcomingVisits.slice(1);
  const completedVisits = appointments.filter((item) => item.status === "completed").length;
  const firstName = account.fullName.split(/\s+/)[0] || "there";
  const profile = getClientProfileCompletion(account);
  const bodyWellnessReference = calculateClientBodyWellnessReference(account);
  const upcomingPayment = upcoming ? appointmentPaymentSummary(upcoming) : null;

  return (
    <div className={styles.pageShell}>
      <ClientVisitAutoRefresh enabled={upcomingVisits.some((visit) => !visit.partnerAccepted)} />
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

      {upcoming ? <section className={`${styles.commandCenter} ${!upcoming.partnerAccepted ? styles.pendingCommandCenter : ""}`}>
        <div className={styles.commandCenterMain}>
          {!upcoming.partnerAccepted ? <div className={styles.pendingVisitSignal}><span aria-hidden="true" /><div><small>Care team matching</small><strong>Your appointment is secured.</strong><p>We have already sent this appointment to a care professional. We’re waiting for acceptance.</p></div></div> : null}
          <div className={styles.commandHeader}>
            <div><span className={styles.eyebrow}>{upcoming.partnerAccepted ? "Your next visit" : "Upcoming appointment"}</span><h2>{upcoming.serviceName}</h2></div>
            <span className={upcoming.status === "in_progress" ? styles.attentionPill : styles.statusPill}>{clientVisitStatusLabel(upcoming.status)}</span>
          </div>
            <div className={styles.commandFacts}>
            <div className={styles.commandServiceRow}>
              <div className={styles.commandServicePhoto}>
                <Image src={upcoming.serviceImageUrl} alt={upcoming.serviceImageAlt || upcoming.serviceName} width={64} height={64} unoptimized />
              </div>
              <div className={styles.commandServiceMeta}>
                <small>Service</small>
                <b>{upcoming.serviceName}</b>
              </div>
              <div className={styles.commandServiceMeta}><small>Reference</small><b>{upcoming.reference}</b></div>
            </div>
            <div><small>When</small><b>{displayDate(upcoming.startsAt)}</b></div>
            <div className={styles.commandProfessionalFact}><ClientCareProfessional accepted={upcoming.partnerAccepted} name={upcoming.partnerName} photoUrl={upcoming.partnerPhotoUrl} publicTitle={upcoming.partnerPublicTitle} credentials={upcoming.partnerCredentials} compact /></div>
            <div><small>Service address</small><b>{upcoming.addressLine1}<br />{upcoming.city}, {upcoming.state} {upcoming.postalCode}</b></div>
            {upcomingPayment ? <>
              <div><small>{upcomingPayment.paidTodayLabel}</small><b>{upcomingPayment.paidTodayValue}</b><span>{upcomingPayment.paidTodayDetail}</span></div>
              <div><small>{upcomingPayment.dueAtVisitLabel}</small><b>{upcomingPayment.dueAtVisitValue}</b><span>{upcomingPayment.dueAtVisitDetail}</span></div>
            </> : null}
            <div className={styles.commandMapTile}>
              <ClientVisitMap
                addressLine1={upcoming.addressLine1}
                addressLine2={upcoming.addressLine2}
                city={upcoming.city}
                state={upcoming.state}
                postalCode={upcoming.postalCode}
                markerImageUrl={upcoming.serviceImageUrl}
                markerLabel={`${upcoming.serviceName} location`}
              />
            </div>
          </div>
          {upcomingQueue.length ? (
            <section className={styles.upcomingVisitList} aria-labelledby="upcoming-visits-title">
              <div className={styles.upcomingVisitListHeader}>
                <div>
                  <span className={styles.eyebrow}>Upcoming visits</span>
                  <h3 id="upcoming-visits-title">Your scheduled care</h3>
                </div>
                <Link href="/appointments">View all <span aria-hidden="true">→</span></Link>
              </div>
              <div className={styles.upcomingVisitRows}>
                {upcomingQueue.map((item) => (
                  <Link className={styles.upcomingVisitRow} href={`/appointments#upcoming-${item.id}`} key={item.id}>
                    <span className={styles.upcomingVisitImage}>
                      <Image src={item.serviceImageUrl} alt="" width={48} height={48} unoptimized />
                    </span>
                    <span className={styles.upcomingVisitCopy}>
                      <strong>{item.serviceName}</strong>
                      <small>{displayDate(item.startsAt)} · {clientVisitStatusLabel(item.status)}</small>
                    </span>
                    <span className={styles.upcomingVisitArrow} aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          <div className={styles.commandFooter}><span>Reference {upcoming.reference}</span><Link href={`/appointments#upcoming-${upcoming.id}`}>Open visit details <b>→</b></Link></div>
        </div>
      </section> : null}

      <ClientBodyWellnessReference
        reference={bodyWellnessReference}
        profile={{
          dateOfBirth: account.dateOfBirth,
          weightPounds: account.weightPounds,
          heightInches: account.heightInches,
        }}
      />

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

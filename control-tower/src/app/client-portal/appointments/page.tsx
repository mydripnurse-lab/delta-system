import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";

import ClientCareJourney from "@/components/client/ClientCareJourney";
import ClientAppointmentReview from "@/components/client/ClientAppointmentReview";
import { clientVisitStatusLabel } from "@/components/client/ClientVisitProgress";
import ClientCareProfessional from "@/components/client/ClientCareProfessional";
import ClientVisitAutoRefresh from "@/components/client/ClientVisitAutoRefresh";
import ClientVisitMap from "@/components/client/ClientVisitMap";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientAppointments } from "@/lib/clientPortalData";

import styles from "../clientPortal.module.css";

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
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

export default async function ClientAppointmentsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/appointments");
  const appointments = await getClientAppointments(account.id);
  const activeStatuses = new Set(["payment_pending", "confirmed", "partner_acknowledged", "in_progress"]);
  const upcoming = appointments
    .filter((item) => activeStatuses.has(item.status))
    .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || a.startsAt.localeCompare(b.startsAt));
  const featured = upcoming[0];
  const featuredPayment = featured ? appointmentPaymentSummary(featured) : null;
  const later = upcoming.slice(1);
  const history = appointments.filter((item) => !upcoming.some((future) => future.id === item.id));
  return (
    <div className={styles.pageShell}>
      <ClientVisitAutoRefresh enabled={Boolean(featured && !featured.partnerAccepted)} />
      <section className={styles.pageIntro}>
        <div><span className={styles.eyebrow}>Appointments</span><h1>Your care timeline.</h1><p>Every mobile wellness visit, clearly organized from booking to completion.</p></div>
        <Link href="/book" className={styles.primaryAction}>Book another visit <span>→</span></Link>
      </section>

      {featured ? <section className={styles.appointmentDetail}>
        <div className={styles.appointmentDetailBody}>
          <div className={styles.appointmentDetailHeader}>
            <div className={styles.commandServicePhoto}>
              <Image src={featured.serviceImageUrl} alt={featured.serviceImageAlt || featured.serviceName} width={78} height={78} unoptimized />
            </div>
            <div className={styles.appointmentDetailContent}>
              <div className={styles.commandHeader}><div><span className={styles.eyebrow}>Up next</span><h2>{featured.serviceName}</h2></div><span className={featured.status === "in_progress" ? styles.attentionPill : styles.statusPill}>{clientVisitStatusLabel(featured.status)}</span></div>
              <p className={styles.visitLead}>{displayDate(featured.startsAt)}</p>
              <ClientCareJourney status={featured.status} partnerAccepted={featured.partnerAccepted} />
            </div>
          </div>
          <div className={styles.appointmentMapWrap}>
            <ClientVisitMap
              addressLine1={featured.addressLine1}
              addressLine2={featured.addressLine2}
              city={featured.city}
              state={featured.state}
              postalCode={featured.postalCode}
              markerImageUrl={featured.serviceImageUrl}
              markerLabel={`${featured.serviceName} location`}
            />
          </div>
          <ClientCareProfessional accepted={featured.partnerAccepted} name={featured.partnerName} photoUrl={featured.partnerPhotoUrl} publicTitle={featured.partnerPublicTitle} credentials={featured.partnerCredentials} />
          <div className={styles.appointmentDetailGrid}>
            <div><small>Service location</small><b>{featured.addressLine1}</b><span>{featured.city}, {featured.state} {featured.postalCode}</span></div>
            <div><small>County</small><b>{featured.county}</b><span>Based on your service address</span></div>
            <div><small>{featuredPayment?.label}</small><b>{featuredPayment?.value}</b><span>{featuredPayment?.detail}</span></div>
            <div><small>Reference</small><b>{featured.reference}</b><span>{featured.partnerAccepted ? "Professional confirmed" : "Acceptance pending"}</span></div>
          </div>
          {featured.additionalPatients.length ? <div className={styles.visitGuests}>
            <div><small>{featured.accessRole === "primary_patient" ? "People in this visit" : "Shared appointment"}</small><b>{featured.accessRole === "primary_patient" ? `${featured.additionalPatients.length} invited patient${featured.additionalPatients.length === 1 ? "" : "s"}` : "You were invited to this visit"}</b></div>
            <ul>{featured.additionalPatients.map((patient) => <li key={patient.email}><span>{patient.fullName || patient.email}</span><em>{patient.invitationStatus === "claimed" ? "Care account connected" : patient.invitationStatus === "pending" ? "Invitation sent" : "Included in appointment"}</em></li>)}</ul>
          </div> : null}
        </div>
      </section> : <section className={styles.appointmentSection}><div className={styles.emptyState}><span>✦</span><h3>No upcoming visits.</h3><p>Your next appointment will appear here after booking.</p><Link href="/book">Book your first visit →</Link></div></section>}

      {later.length ? <section className={styles.appointmentSection}>
        <div className={styles.sectionTitle}><h2>Coming up later</h2><span>{later.length}</span></div>
        <div className={styles.appointmentList}>{later.map((item) => <article key={item.id} id={`upcoming-${item.id}`} className={styles.appointmentCard}>
          <div className={styles.dateTile}><span>{new Date(item.startsAt).toLocaleString("en-US", { month: "short" })}</span><b>{new Date(item.startsAt).getDate()}</b></div>
          <div className={styles.appointmentCardBody}>
            <span className={styles.statusText}>{clientVisitStatusLabel(item.status)}</span>
            <h3>{item.serviceName}</h3>
            <p>{displayDate(item.startsAt)}</p>
            <p>{item.addressLine1}<br />{item.city}, {item.state} {item.postalCode}</p>
            <small>{item.partnerAccepted ? `Care professional: ${item.partnerName}` : "Care team matching in progress"}</small>
            <div className={styles.appointmentCardMeta}><small>{item.addressLine1 ? "Reference" : "Reference"}</small><b>{item.reference}</b></div>
            <ClientCareProfessional accepted={item.partnerAccepted} name={item.partnerName} photoUrl={item.partnerPhotoUrl} publicTitle={item.partnerPublicTitle} credentials={item.partnerCredentials} compact />
          </div>
          <div className={styles.appointmentCardImage}><Image src={item.serviceImageUrl} alt={item.serviceImageAlt || item.serviceName} width={86} height={86} unoptimized /></div>
        </article>)}</div>
      </section> : null}

      {history.length ? <section className={styles.appointmentSection}>
        <div className={styles.sectionTitle}><h2>Care history</h2><span>{history.length}</span></div>
        <div className={styles.historyList}>{history.map((item) => <article key={item.id} className={styles.historyEntry}><div className={styles.historySummary}><div><span>{clientVisitStatusLabel(item.status)}</span><h3>{item.serviceName}</h3><p>{displayDate(item.startsAt)} · {item.partnerName}</p></div><b>{item.reference}</b></div>{item.status === "completed" && item.partnerProfileId ? <ClientAppointmentReview appointmentId={item.id} partnerName={item.partnerName} existingReview={item.review} /> : null}</article>)}</div>
      </section> : null}
    </div>
  );
}

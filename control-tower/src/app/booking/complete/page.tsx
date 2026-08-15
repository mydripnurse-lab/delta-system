import type { Metadata } from "next";

import { reconcileStripeCheckoutSession } from "@/lib/stripeBookingReconciliation";
import { getPublicAppointmentConfirmation, type PublicAppointmentConfirmation } from "@/lib/publicAppointmentConfirmation";

export const metadata: Metadata = {
  title: "Appointment received | My Drip Nurse",
  icons: { icon: "https://sitemaps.mydripnurse.com/favicon.ico" },
};

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function dateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString("en-US");
  }
}

function statusMessage(confirmed: boolean) {
  return confirmed
    ? "Your payment was received and your appointment is confirmed. We sent the appointment details by text message and email."
    : "Your appointment request was received. We are verifying the payment and will send the complete appointment details by text message and email as soon as verification is complete.";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <span style={{ color: "#718889", fontSize: 11, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.45 }}>{value}</span>
    </div>
  );
}

function DetailsCard({ details, confirmed }: { details: PublicAppointmentConfirmation; confirmed: boolean }) {
  const location = [details.location.addressLine1, details.location.addressLine2, details.location.city, details.location.state, details.location.postalCode].filter(Boolean).join(", ");
  return (
    <div style={{ display: "grid", gap: 14, marginTop: 28, textAlign: "left" }}>
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", padding: 22, borderRadius: 20, background: "#f2faf8", border: "1px solid #d7ebe8" }}>
        <Detail label="Service" value={details.service} />
        <Detail label="Date and time" value={dateTime(details.startsAt, details.timezone)} />
        <Detail label="Appointment location" value={location} />
        <Detail label="Patient" value={details.patient.name} />
      </div>
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", padding: 22, borderRadius: 20, background: "#fffdfa", border: "1px solid #e9e6df" }}>
        <Detail label="Deposit" value={money(details.depositAmount, details.currency)} />
        <Detail label="Payment status" value={confirmed ? "Received" : "Verifying"} />
        <Detail label="Reference" value={details.reference} />
      </div>
      {details.additionalPatients.length ? (
        <div style={{ padding: 22, borderRadius: 20, background: "#fffdfa", border: "1px solid #e9e6df" }}>
          <span style={{ color: "#718889", fontSize: 11, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Additional patients</span>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {details.additionalPatients.map((patient, index) => <div key={`${patient.email}-${index}`} style={{ fontWeight: 700 }}>{patient.name}</div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default async function BookingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string; session_id?: string }>;
}) {
  const { appointment = "", session_id: sessionId = "" } = await searchParams;
  let confirmed = false;
  let reconciliationError = false;
  if (sessionId) {
    try {
      const result = await reconcileStripeCheckoutSession(sessionId);
      confirmed = result.confirmed;
    } catch {
      reconciliationError = true;
    }
  }
  const details = appointment ? await getPublicAppointmentConfirmation(appointment).catch(() => null) : null;
  confirmed = confirmed || details?.status === "confirmed" || details?.status === "partner_acknowledged" || details?.status === "in_progress" || details?.status === "completed";

  return (
    <main style={{ minHeight: "100vh", padding: "clamp(20px, 5vw, 64px) 16px", background: "#eef8f7", color: "#163b40", fontFamily: "Arial, sans-serif" }}>
      <section style={{ width: "min(100%, 860px)", margin: "0 auto", padding: "clamp(30px, 6vw, 58px) clamp(20px, 6vw, 64px)", borderRadius: 28, background: "white", boxShadow: "0 20px 60px rgba(24,73,77,.12)", textAlign: "center" }}>
        <span style={{ color: "#087887", fontSize: 12, fontWeight: 900, letterSpacing: ".15em" }}>MY DRIP NURSE</span>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(2.3rem, 8vw, 4rem)", fontWeight: 500, lineHeight: 1.05, margin: "18px 0" }}>We received your appointment.</h1>
        <p style={{ maxWidth: 650, margin: "0 auto", color: "#60787a", lineHeight: 1.65 }}>{statusMessage(confirmed)}</p>
        {reconciliationError ? <p style={{ margin: "16px auto 0", maxWidth: 620, color: "#8a5a1c", fontSize: 14 }}>Payment verification is taking a little longer than expected. Your details are safely saved and the confirmation message will follow shortly.</p> : null}
        {details ? <DetailsCard details={details} confirmed={confirmed} /> : appointment ? <p style={{ marginTop: 28, fontWeight: 800 }}>Reference: {appointment}</p> : null}
      </section>
    </main>
  );
}

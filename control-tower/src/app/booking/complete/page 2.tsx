import type { Metadata } from "next";

import { reconcileStripeCheckoutSession } from "@/lib/stripeBookingReconciliation";

export const metadata: Metadata = {
  title: "Appointment received | My Drip Nurse",
  icons: { icon: "https://sitemaps.mydripnurse.com/favicon.ico" },
};

export default async function BookingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string; session_id?: string }>;
}) {
  const { appointment = "", session_id: sessionId = "" } = await searchParams;
  let reconciliationMessage = "Stripe is verifying the deposit. Your appointment confirmation and Partner details will be sent as soon as payment is confirmed.";
  if (sessionId) {
    try {
      const result = await reconcileStripeCheckoutSession(sessionId);
      if (result.confirmed) {
        reconciliationMessage = "Your deposit is confirmed. Your appointment is now visible in the Partner portal.";
      } else {
        reconciliationMessage = "Your payment is still being verified. Your appointment will appear in the Partner portal as soon as Stripe confirms it.";
      }
    } catch {
      // The webhook remains the source of truth if Stripe is temporarily unavailable.
    }
  }
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef8f7", color: "#163b40", fontFamily: "Arial, sans-serif" }}>
      <section style={{ width: "min(100%, 620px)", padding: "42px 28px", borderRadius: 28, background: "white", boxShadow: "0 20px 60px rgba(24,73,77,.12)", textAlign: "center" }}>
        <span style={{ color: "#087887", fontSize: 12, fontWeight: 900, letterSpacing: ".15em" }}>MY DRIP NURSE</span>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(2.3rem, 8vw, 4rem)", fontWeight: 500, margin: "18px 0" }}>We received your appointment.</h1>
        <p style={{ color: "#60787a", lineHeight: 1.65 }}>{reconciliationMessage}</p>
        {appointment ? <p style={{ marginTop: 24, fontWeight: 800 }}>Reference: {appointment}</p> : null}
      </section>
    </main>
  );
}

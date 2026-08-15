import type { Metadata } from "next";
import {
  APPOINTMENT_CANCELLATION_WINDOW_HOURS,
  APPOINTMENT_DEPOSIT_POLICY_SUMMARY,
  APPOINTMENT_DEPOSIT_POLICY_URL,
  APPOINTMENT_DEPOSIT_POLICY_VERSION,
  APPOINTMENT_DEPOSIT_SUPPORT_EMAIL,
} from "@/lib/appointmentDepositPolicy";
import styles from "./policy.module.css";

const BRAND_LOGO_URL = "/mdn-logo.png";

export const metadata: Metadata = {
  title: "Appointment & Deposit Policy | My Drip Nurse",
  description:
    "Review My Drip Nurse appointment deposits, 24-hour cancellations, refunds, rescheduling, remaining balances, and no-show terms.",
  alternates: {
    canonical: APPOINTMENT_DEPOSIT_POLICY_URL,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Appointment & Deposit Policy | My Drip Nurse",
    description:
      "Clear terms for appointment deposits, cancellations, refunds, rescheduling, and no-shows.",
    url: APPOINTMENT_DEPOSIT_POLICY_URL,
    siteName: "My Drip Nurse",
    type: "website",
  },
};

const formattedLastUpdated = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${APPOINTMENT_DEPOSIT_POLICY_VERSION}T00:00:00Z`));

export default function AppointmentDepositPolicyPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "My Drip Nurse Appointment & Deposit Policy",
    url: APPOINTMENT_DEPOSIT_POLICY_URL,
    description:
      "Appointment deposit, cancellation, refund, rescheduling, remaining balance, and no-show terms for My Drip Nurse.",
    dateModified: APPOINTMENT_DEPOSIT_POLICY_VERSION,
    publisher: {
      "@type": "Organization",
      name: "My Drip Nurse",
      url: "https://mydripnurse.com",
      email: APPOINTMENT_DEPOSIT_SUPPORT_EMAIL,
    },
  };

  return (
    <main className={styles.pageShell}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className={styles.siteHeader}>
        <a className={styles.brand} href="https://mydripnurse.com" aria-label="My Drip Nurse home">
          {/* A plain image keeps this public policy independent from the dashboard image pipeline. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO_URL} alt="My Drip Nurse" width="186" height="54" />
        </a>
        <a className={styles.supportLink} href={`mailto:${APPOINTMENT_DEPOSIT_SUPPORT_EMAIL}`}>
          Contact support
        </a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <p className={styles.eyebrow}>Patient booking terms</p>
        <h1>Appointment &amp; Deposit Policy</h1>
        <p className={styles.heroCopy}>
          A clear explanation of when your appointment deposit is refundable, when it is
          retained, and how it is applied to your service.
        </p>
        <div className={styles.heroMeta}>
          <span>Last updated {formattedLastUpdated}</span>
          <span aria-hidden="true">•</span>
          <span>{APPOINTMENT_CANCELLATION_WINDOW_HOURS}-hour cancellation window</span>
        </div>
      </section>

      <section className={styles.summarySection} aria-labelledby="policy-at-a-glance">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>At a glance</p>
          <h2 id="policy-at-a-glance">The policy in plain language</h2>
        </div>
        <div className={styles.summaryGrid}>
          {APPOINTMENT_DEPOSIT_POLICY_SUMMARY.map((item, index) => (
            <article className={styles.summaryCard} key={item.title}>
              <span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.policyLayout}>
        <aside className={styles.policyNav} aria-label="Policy sections">
          <p>On this page</p>
          <a href="#deposit">Appointment deposit</a>
          <a href="#refunds">Refund eligibility</a>
          <a href="#late-cancellations">Late cancellations</a>
          <a href="#rescheduling">Rescheduling</a>
          <a href="#processing">Refund processing</a>
          <a href="#contact">Questions</a>
        </aside>

        <article className={styles.policyContent}>
          <section id="deposit">
            <span className={styles.sectionNumber}>01</span>
            <h2>Appointment deposit</h2>
            <p>
              A deposit is required to reserve an appointment. The amount displayed during
              booking is applied toward the total price of the scheduled service and is not an
              additional charge. Unless the booking page states otherwise, the remaining balance
              is collected at the appointment by the assigned provider.
            </p>
          </section>

          <section id="refunds">
            <span className={styles.sectionNumber}>02</span>
            <h2>When the deposit is refundable</h2>
            <p>The deposit is eligible for a refund when either of the following occurs:</p>
            <ul>
              <li>
                The patient cancels at least {APPOINTMENT_CANCELLATION_WINDOW_HOURS} hours before
                the scheduled appointment start time.
              </li>
              <li>
              My Drip Nurse or the assigned provider cannot provide the appointment. In this
                situation, including when the assigned provider does not arrive, the patient may
                accept a new appointment time or request a refund.
              </li>
            </ul>
          </section>

          <section id="late-cancellations">
            <span className={styles.sectionNumber}>03</span>
            <h2>Late cancellations and no-shows</h2>
            <p>
              A cancellation made less than {APPOINTMENT_CANCELLATION_WINDOW_HOURS} hours before
              the scheduled start time is considered a late cancellation. Deposits for late
              cancellations and patient no-shows are non-refundable because the appointment time
              and provider availability were reserved for that patient.
            </p>
          </section>

          <section id="rescheduling">
            <span className={styles.sectionNumber}>04</span>
            <h2>Rescheduling</h2>
            <p>
              Requests made at least {APPOINTMENT_CANCELLATION_WINDOW_HOURS} hours before the
              scheduled start time may move the existing deposit to an available replacement
              appointment. Rescheduling within the {APPOINTMENT_CANCELLATION_WINDOW_HOURS}-hour
              window may be treated as a late cancellation. Availability is not guaranteed.
            </p>
          </section>

          <section id="processing">
            <span className={styles.sectionNumber}>05</span>
            <h2>Refund processing</h2>
            <p>
              Approved refunds are returned to the original payment method. Although My Drip
              Nurse initiates approved refunds promptly, the time required for the credit to
              appear is controlled by the payment processor and the patient&apos;s financial
              institution.
            </p>
          </section>

          <section>
            <span className={styles.sectionNumber}>06</span>
            <h2>Exceptional circumstances</h2>
            <p>
              My Drip Nurse may review documented emergencies or circumstances beyond a
              patient&apos;s reasonable control. Any exception is evaluated individually and does
              not waive this policy for future appointments. Nothing in this policy limits rights
              that cannot be limited under applicable law.
            </p>
          </section>

          <section id="contact" className={styles.contactCard}>
            <p className={styles.eyebrow}>Need help?</p>
            <h2>Questions about an appointment or refund</h2>
            <p>
              Contact our support team and include the patient name, appointment date, and
              booking email so we can locate the reservation.
            </p>
            <a href={`mailto:${APPOINTMENT_DEPOSIT_SUPPORT_EMAIL}`}>
              {APPOINTMENT_DEPOSIT_SUPPORT_EMAIL}
            </a>
          </section>
        </article>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getUTCFullYear()} My Drip Nurse</span>
        <span>Mobile wellness appointments, clearly explained.</span>
      </footer>
    </main>
  );
}

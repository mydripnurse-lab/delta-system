import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PartnerExperience, PartnerFooter } from "@/components/partner/PartnerBrand";
import PartnerPublicHeader from "@/components/partner/PartnerPublicHeader";
import { PartnerTestimonials } from "@/components/partner/PartnerTestimonials";
import { getPartnerProfileForPublicPage } from "@/lib/partnerProfiles";
import { buildPartnerMetadata, partnerPublicUrl, serializeStructuredData } from "@/lib/partnerSeo";

import { PartnerRevenueCalculator } from "./PartnerRevenueCalculator";
import styles from "./affiliateLanding.module.css";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview = "" } = await searchParams;
  const profile = await getPartnerProfileForPublicPage(slug, preview);
  if (!profile) return { title: "Mobile IV Therapy Partner Program | My Drip Nurse" };
  return buildPartnerMetadata({
    profile,
    pathname: "become-a-partner",
    title: "Mobile IV Therapy Partner Program | My Drip Nurse",
    description: "Apply to join the My Drip Nurse Partner network and receive confirmed, deposit-secured mobile IV therapy appointment opportunities.",
    keywords: [
      "mobile IV therapy Partner program",
      "mobile IV therapy appointments",
      "mobile IV therapy business opportunity",
      "mobile IV therapy provider network",
      "become a My Drip Nurse Partner",
    ],
    indexable: !preview,
  });
}

export default async function AffiliateLandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview = "" } = await searchParams;
  const profile = await getPartnerProfileForPublicPage(slug, preview);
  if (!profile) notFound();

  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;
  const applicationUrl = partnerHref("/apply");
  const faqItems = [
    {
      question: "Is this a leads program?",
      answer: "No. My Drip Nurse is designed to send confirmed appointments with a selected service, date, time, client details, and required booking deposit—not an unqualified name and phone number you still have to close.",
    },
    {
      question: "How is the Partner revenue share calculated?",
      answer: "The planning model on this page uses a $297 average appointment value. My Drip Nurse retains a 35% network share and the Partner receives 65%, or $193.05 per appointment in this example, plus 100% of the Partner's tips. Actual service prices and results vary.",
    },
    {
      question: "Who can apply to become a Partner?",
      answer: "The program is intended for qualified healthcare professionals and eligible mobile IV therapy businesses. Approval depends on credentials, service-area availability, operational readiness, and completion of My Drip Nurse onboarding requirements.",
    },
    {
      question: "Can I request more than one county?",
      answer: "Yes. You can request multiple available counties and identify your primary county. My Drip Nurse reviews availability and activation requirements for every requested area.",
    },
    {
      question: "Will this interfere with my existing clients?",
      answer: "No. Your existing business remains yours. My Drip Nurse appointments are designed to add new appointment opportunities based on your activated services, service area, and calendar availability.",
    },
    {
      question: "What happens after I submit the application?",
      answer: "The My Drip Nurse team reviews your qualifications, requested service areas, and operational information. Approved applicants receive setup and onboarding instructions by email.",
    },
  ];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${partnerPublicUrl(profile.slug, "become-a-partner")}#webpage`,
        url: partnerPublicUrl(profile.slug, "become-a-partner"),
        name: "My Drip Nurse Mobile IV Therapy Partner Program",
        description: "Join the My Drip Nurse Partner network for confirmed mobile IV therapy appointment opportunities, connected booking, and a professional Partner platform.",
        about: { "@type": "Service", name: "My Drip Nurse Partner Program" },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };

  return (
    <PartnerExperience>
      <PartnerPublicHeader profile={profile} />

      <main className={styles.page}>
        {preview ? <div className={styles.previewBanner}>Private Partner landing page preview</div> : null}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }} />

        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.shell}>
            <div className={styles.heroCopy}>
              <span className={styles.availabilityBadge}>Partner applications now open</span>
              <h1>We send mobile IV therapy <em>appointments</em> to qualified local providers.</h1>
              <p className={styles.heroLead}>
                Already delivering mobile IV therapy? My Drip Nurse handles patient acquisition,
                booking, reminders, and confirmation. You receive the appointment and provide the care.
              </p>
              <div className={styles.heroActions}>
                <Link href={applicationUrl} className={styles.primary}>Start your application <span aria-hidden="true">→</span></Link>
                <a href="#how-it-works" className={styles.textLink}>See how it works</a>
              </div>
              <div className={styles.heroProof}>
                <span>Deposit-secured bookings</span>
                <span>No lead chasing</span>
                <span>You control availability</span>
              </div>
            </div>

            <aside className={styles.heroPanel}>
              <span className={styles.panelEyebrow}>What Partners receive</span>
              <ul className={styles.receiveList}>
                <li><span>✓</span><div><strong>Client booking deposit</strong><small>The patient has already committed before the appointment reaches you.</small></div></li>
                <li><span>✓</span><div><strong>Follow-up and reminders</strong><small>My Drip Nurse manages booking communications and confirmation.</small></div></li>
                <li><span>✓</span><div><strong>Confirmed appointment details</strong><small>Service, date, time, address, and patient information in one workflow.</small></div></li>
              </ul>
            </aside>
          </div>
        </section>

        <section className={styles.valueStrip} aria-label="Partner program highlights">
          <div className={styles.shell}>
            <article><strong>$297+</strong><span>Average appointment value used for planning</span></article>
            <article><strong>65%</strong><span>Partner share in the revenue model</span></article>
            <article><strong>100%</strong><span>Of your tips remain yours</span></article>
            <article><strong>35%</strong><span>My Drip Nurse network share</span></article>
          </div>
        </section>

        <section className={styles.bookingFlow} id="how-it-works">
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Confirmed appointment workflow</span>
              <h2>The client books. We confirm. <em>You provide the care.</em></h2>
              <p>This is not a list of leads. The operating flow is built around a real service and a scheduled appointment.</p>
            </div>
            <ol className={styles.flowGrid}>
              <li><span>01</span><h3>Patient books</h3><p>A patient selects an active IV therapy service and chooses an available appointment time.</p></li>
              <li><span>02</span><h3>Booking is secured</h3><p>The required deposit and booking information are collected through the connected calendar experience.</p></li>
              <li><span>03</span><h3>We communicate</h3><p>My Drip Nurse handles reminders, follow-up, and appointment confirmation with the patient.</p></li>
              <li><span>04</span><h3>You receive the visit</h3><p>The confirmed appointment appears with the service, schedule, address, and information needed to prepare.</p></li>
            </ol>
            <div className={styles.protectionCallout}>
              <span aria-hidden="true">✓</span>
              <div><strong>Your schedule is treated like valuable clinical time.</strong><p>The booking deposit and confirmation workflow are designed to reduce uncertainty and protect the appointment process.</p></div>
            </div>
          </div>
        </section>

        <section className={styles.comparison}>
          <div className={styles.shell}>
            <div className={styles.sectionHeadingCentered}>
              <span className={styles.eyebrow}>The My Drip Nurse difference</span>
              <h2>Appointments, <em>not another lead list.</em></h2>
            </div>
            <div className={styles.comparisonGrid}>
              <article className={styles.leadCard}>
                <span>Typical lead program</span><h3>You get a name. You do the rest.</h3>
                <ul><li>Unverified interest you still have to close</li><li>Scheduling and follow-up are your responsibility</li><li>No deposit securing the appointment</li><li>More marketing work and unpredictable conversion</li></ul>
              </article>
              <article className={styles.appointmentCard}>
                <span>My Drip Nurse Partner</span><h3>You get a confirmed appointment workflow.</h3>
                <ul><li>Selected service, date, time, and patient details</li><li>Connected reminders and booking communication</li><li>Required deposit collected through the booking process</li><li>Appointment opportunities matched to your availability</li></ul>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.gettingStarted}>
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Getting started</span>
              <h2>From application to an activated Partner experience.</h2>
            </div>
            <ol className={styles.stepGrid}>
              <li><span>1</span><div><small>About 5 minutes</small><h3>Complete the application</h3><p>Share your credentials, business details, requested counties, primary market, biography, and professional profile.</p></div></li>
              <li><span>2</span><div><small>My Drip Nurse review</small><h3>Complete onboarding</h3><p>Our team reviews your application and guides approved Partners through account, payment, calendar, and operating setup.</p></div></li>
              <li><span>3</span><div><small>After activation</small><h3>Open your availability</h3><p>Your approved services, personal booking calendars, Partner website, and selected service areas become connected.</p></div></li>
            </ol>
          </div>
        </section>

        <section className={styles.revenueSection}>
          <div className={styles.shell}>
            <div className={styles.revenueCopy}>
              <span className={styles.eyebrow}>Built for mobile IV therapy providers</span>
              <h2>More appointment opportunities. <em>Less acquisition work.</em></h2>
              <p>You already know how to provide mobile IV therapy. The Partner network is designed to organize discovery, booking, confirmation, and digital operations around your activated services.</p>
              <ul className={styles.benefitList}>
                <li><span>✓</span><div><strong>Deposit-secured appointment flow</strong><small>Patients commit through the booking experience before the appointment is dispatched.</small></div></li>
                <li><span>✓</span><div><strong>Connected marketing and booking</strong><small>SEO pages, Partner profiles, service pages, and calendars work as one patient journey.</small></div></li>
                <li><span>✓</span><div><strong>You control your calendar</strong><small>Availability and activated services determine what patients can request.</small></div></li>
              </ul>
            </div>
            <div className={styles.revenuePreview}>
              <span>Revenue potential · planning example</span>
              <strong>+$8,359</strong>
              <p>estimated monthly · 10 appointments/week · $193.05 Partner earnings each</p>
              <div><small>5 appts / week</small><b>+$4,180/mo</b><i style={{ width: "34%" }} /></div>
              <div><small>10 appts / week</small><b>+$8,359/mo</b><i style={{ width: "67%" }} /></div>
              <div><small>15 appts / week</small><b>+$12,539/mo</b><i style={{ width: "100%" }} /></div>
              <em>$297 average appointment value · 65% Partner share · individual results vary.</em>
            </div>
          </div>
        </section>

        <section className={styles.calculatorSection}>
          <div className={styles.shell}>
            <div className={styles.sectionHeadingCentered}>
              <span className={styles.eyebrow}>Partner revenue calculator</span>
              <h2>What could your activated calendar support?</h2>
              <p>Move the slider to explore an illustrative monthly revenue scenario.</p>
            </div>
            <PartnerRevenueCalculator applicationUrl={applicationUrl} />
          </div>
        </section>

        <PartnerTestimonials />

        <section className={styles.qualifications}>
          <div className={styles.shell}>
            <div className={styles.qualificationCopy}>
              <span className={styles.eyebrow}>Designed for qualified providers</span>
              <h2>Already delivering mobile IV therapy?</h2>
              <p>Applications are reviewed for professional qualifications, operational readiness, and service-area availability before activation.</p>
              <Link href={applicationUrl} className={styles.primary}>Check your eligibility <span aria-hidden="true">→</span></Link>
            </div>
            <ul className={styles.qualificationList}>
              <li><span>✓</span>Qualified healthcare professional or eligible mobile IV business</li>
              <li><span>✓</span>Prepared to provide mobile services at homes, hotels, or offices</li>
              <li><span>✓</span>Able to complete required verification and onboarding</li>
              <li><span>✓</span>Committed to a consistent, patient-centered experience</li>
              <li><span>✓</span>Available to serve one or more approved local markets</li>
            </ul>
          </div>
        </section>

        <section className={styles.faq}>
          <div className={styles.shell}>
            <div className={styles.faqHeading}><span className={styles.eyebrow}>Partner program FAQ</span><h2>Questions before you apply?</h2><p>Review eligibility, the revenue model, service areas, and what happens after you apply.</p></div>
            <div className={styles.faqList}>{faqItems.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <span className={styles.availabilityBadge}>Application takes about 5 minutes</span>
          <h2>Ready to explore the My Drip Nurse Partner network?</h2>
          <p>Continue to the separate secure application page. It takes about five minutes to complete.</p>
          <Link href={applicationUrl} className={styles.primary}>Start your application <span aria-hidden="true">→</span></Link>
          <small>No income guarantee · Approval and market availability required</small>
          <Link href={partnerHref()} className={styles.returnLink}>Return to {profile.displayName}&apos;s website</Link>
        </section>
      </main>
      <PartnerFooter />
    </PartnerExperience>
  );
}

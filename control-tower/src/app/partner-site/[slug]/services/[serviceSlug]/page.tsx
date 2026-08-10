import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PartnerExperience,
  PartnerFooter,
  PartnerHeader,
} from "@/components/partner/PartnerBrand";
import { PartnerFaq, type PartnerFaqItem } from "@/components/partner/PartnerFaq";
import { PartnerTestimonials } from "@/components/partner/PartnerTestimonials";
import { loadPartnerServicePage } from "@/lib/partnerServicePages";
import {
  buildPartnerMetadata,
  partnerPublicUrl,
  serializeStructuredData,
} from "@/lib/partnerSeo";

import styles from "../../partnerSite.module.css";

type Props = {
  params: Promise<{ slug: string; serviceSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, serviceSlug } = await params;
  const { preview = "" } = await searchParams;
  const data = await loadPartnerServicePage(slug, serviceSlug, preview);
  if (!data) return { title: "IV Therapy Service | My Drip Nurse" };
  const citySummary = data.cities.slice(0, 3).map((city) => city.name).join(", ");
  return buildPartnerMetadata({
    profile: data.profile,
    pathname: `services/${serviceSlug}`,
    title: `${data.service.name} Mobile IV Therapy with ${data.profile.displayName}`,
    description: `${data.service.description} Review ingredients, pricing and appointment information${citySummary ? ` for ${citySummary} and nearby communities` : ""}.`,
    keywords: [
      `${data.service.name} mobile IV therapy`,
      `${data.service.name} IV therapy near me`,
      ...data.cities.slice(0, 6).map((city) => `${data.service.name} IV therapy ${city.name}`),
    ],
    indexable: !preview,
  });
}

export default async function PartnerServiceLandingPage({ params, searchParams }: Props) {
  const { slug, serviceSlug } = await params;
  const { preview = "" } = await searchParams;
  const data = await loadPartnerServicePage(slug, serviceSlug, preview);
  if (!data) notFound();
  const { profile, service, cities } = data;
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;
  const landingUrl = partnerPublicUrl(profile.slug, `services/${serviceSlug}`);
  const numericPrice = service.price.replace(/[^0-9.]/g, "");
  const cityLabel = cities.length
    ? new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(cities.slice(0, 3).map((city) => city.name))
    : "the local service area";
  const faqItems: PartnerFaqItem[] = [
    {
      question: `What is included in the ${service.name} service?`,
      answer: `${service.name} is presented with ${service.ingredients.join(", ")}. Final ingredients, dosage, eligibility, and treatment suitability are reviewed by an appropriately qualified healthcare professional.`,
    },
    {
      question: `How much does ${service.name} cost?`,
      answer: service.price
        ? `The current listed price is ${service.price}. Any required deposit and final booking terms appear before the appointment is confirmed.`
        : "Current pricing and any applicable deposit are displayed during the secure booking process.",
    },
    {
      question: `Where can I book ${service.name}?`,
      answer: `${profile.displayName} offers appointment coverage in ${cityLabel}${cities.length > 3 ? " and surrounding communities" : ""}, subject to calendar availability.`,
    },
    {
      question: "How is appointment eligibility determined?",
      answer: "A qualified healthcare professional must review relevant health information and determine whether mobile IV therapy is appropriate before treatment.",
    },
    {
      question: "Can I use this service for an emergency?",
      answer: "No. Mobile IV therapy is not emergency care. Call 911 or contact the appropriate emergency medical service if you have urgent or severe symptoms.",
    },
  ];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${landingUrl}#service`,
        name: `${service.name} Mobile IV Therapy`,
        description: service.description,
        image: service.imageUrl,
        url: landingUrl,
        provider: {
          "@type": "Person",
          name: profile.displayName,
          image: profile.profilePhotoUrl || undefined,
          worksFor: { "@type": "Organization", name: profile.businessName || "My Drip Nurse" },
        },
        areaServed: cities.map((city) => ({ "@type": "City", name: city.name })),
        offers: numericPrice
          ? { "@type": "Offer", price: numericPrice, priceCurrency: "USD", availability: "https://schema.org/InStock" }
          : undefined,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: profile.displayName, item: partnerPublicUrl(profile.slug) },
          { "@type": "ListItem", position: 2, name: "Services", item: partnerPublicUrl(profile.slug, "services") },
          { "@type": "ListItem", position: 3, name: service.name, item: landingUrl },
        ],
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
      <main className={styles.page}>
        {preview ? <div role="status" className={styles.previewBanner}>Private website preview · This page is not published yet</div> : null}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }} />
        <PartnerHeader
          navItems={[
            { href: partnerHref(), label: "Home" },
            { href: partnerHref("/services"), label: "Services" },
            { href: partnerHref("/become-a-partner"), label: "Join our network" },
          ]}
          action={{ href: partnerHref(`/services/${serviceSlug}/book`), label: "Book this service" }}
        />

        <section className={styles.serviceDetailHero}>
          <div className={styles.shell}>
            <div className={styles.serviceDetailCopy}>
              <span className={styles.eyebrow}>Mobile IV therapy with {profile.displayName}</span>
              <h1>{service.name}<br /><em>delivered to you.</em></h1>
              <p>{service.description} Appointments are provided by your local care professional and scheduled through a secure service-specific calendar.</p>
              <div className={styles.serviceBookingCard}>
                <div className={styles.servicePriceDisplay}>
                  <span>Current service price</span>
                  <strong>{service.price || "Available at booking"}</strong>
                  <small>Final booking terms are shown before confirmation.</small>
                </div>
                <Link href={partnerHref(`/services/${serviceSlug}/book`)} className={styles.primaryAction}>
                  Book {service.name} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
            <div className={styles.serviceDetailVisual}>
              <Image src={service.imageUrl} alt={`${service.name} mobile IV therapy`} title={`${service.name} mobile IV therapy with ${profile.displayName}`} width={900} height={760} priority sizes="(max-width: 900px) 100vw, 45vw" />
            </div>
          </div>
        </section>

        <section className={styles.serviceOverview}>
          <div className={styles.shell}>
            <div>
              <span className={styles.eyebrow}>Treatment overview</span>
              <h2>A clear, professional booking experience.</h2>
              <p>Review the service details, select the dedicated booking option, and choose from the current appointment availability for {profile.displayName}.</p>
            </div>
            <div className={styles.serviceFacts}>
              <article><span>01</span><h3>Service-specific availability</h3><p>The booking page opens the calendar created specifically for this service.</p></article>
              <article><span>02</span><h3>Transparent pricing</h3><p>The price shown here is synchronized with the service setup managed in My Drip Nurse Admin.</p></article>
              <article><span>03</span><h3>Clinical review</h3><p>Treatment eligibility and final ingredients are confirmed by an appropriately qualified healthcare professional.</p></article>
            </div>
          </div>
        </section>

        <section className={styles.ingredientSection}>
          <div className={styles.shell}>
            <div><span className={styles.eyebrow}>Service ingredients</span><h2>What this service may include.</h2></div>
            <div className={styles.ingredientCards}>{service.ingredients.map((ingredient) => <span key={ingredient}>{ingredient}</span>)}</div>
          </div>
        </section>

        {cities.length ? (
          <section className={styles.localServiceSection}>
            <div className={styles.shell}>
              <span className={styles.eyebrow}>Local appointment coverage</span>
              <h2>Book {service.name} in your community.</h2>
              <p>Live appointment times depend on the service calendar and current availability.</p>
              <div className={styles.cityGrid}>{cities.map((city) => <span key={`${city.name}-${city.state}`}>{city.name}</span>)}</div>
            </div>
          </section>
        ) : null}

        <PartnerTestimonials />
        <PartnerFaq
          eyebrow={`${service.name} FAQ`}
          title={`Questions about ${service.name}.`}
          introduction={`Helpful information before booking mobile IV therapy with ${profile.displayName}.`}
          items={faqItems}
        />

        <section className={styles.serviceBookCta}>
          <div className={styles.shell}>
            <span className={styles.eyebrow}>Ready to view availability?</span>
            <h2>Book {service.name} with {profile.displayName}.</h2>
            <Link href={partnerHref(`/services/${serviceSlug}/book`)} className={styles.primaryAction}>Open secure booking <span aria-hidden="true">→</span></Link>
          </div>
        </section>
        <PartnerFooter />
      </main>
    </PartnerExperience>
  );
}

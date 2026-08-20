import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PartnerExperience,
  PartnerFooter,
} from "@/components/partner/PartnerBrand";
import PartnerPublicHeader from "@/components/partner/PartnerPublicHeader";
import { PartnerFaq, type PartnerFaqItem } from "@/components/partner/PartnerFaq";
import { PartnerTestimonials } from "@/components/partner/PartnerTestimonials";
import { PartnerDirectoryAttribution } from "@/components/partner/PartnerDirectoryAttribution";
import { loadPartnerCalendarServices, partnerServiceSlug } from "@/lib/myDripNurseServices";
import { getPartnerProfileForPublicPage } from "@/lib/partnerProfiles";
import { loadPartnerCities } from "@/lib/partnerServiceAreas";
import { buildPartnerMetadata, partnerPublicUrl, serializeStructuredData } from "@/lib/partnerSeo";

import styles from "../partnerSite.module.css";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview = "" } = await searchParams;
  const profile = await getPartnerProfileForPublicPage(slug, preview);
  if (!profile) return { title: "Services | My Drip Nurse" };
  return buildPartnerMetadata({
    profile,
    pathname: "services",
    title: `IV Therapy Services with ${profile.displayName} | My Drip Nurse`,
    description: `Explore mobile IV therapy services and book an appointment with ${profile.displayName}.`,
    keywords: [
      "mobile IV therapy services",
      "IV therapy services near me",
      `IV therapy services with ${profile.displayName}`,
    ],
    indexable: !preview,
  });
}

export default async function PartnerServicesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview = "" } = await searchParams;
  const profile = await getPartnerProfileForPublicPage(slug, preview);
  if (!profile) notFound();
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;
  const [services, cities] = await Promise.all([
    loadPartnerCalendarServices(profile.organizationId, profile.services, profile.id),
    loadPartnerCities(profile.organizationId, profile.serviceAreas),
  ]);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Mobile IV therapy services with ${profile.displayName}`,
    itemListElement: services.map((service, index) => {
      const numericPrice = service.price.replace(/[^0-9.]/g, "");
      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Service",
          name: service.name,
          description: service.description,
          image: service.imageUrl,
          url: partnerPublicUrl(profile.slug, `services/${partnerServiceSlug(service)}`),
          provider: { "@type": "Person", name: profile.displayName },
          areaServed: cities.map((city) => ({ "@type": "City", name: city.name })),
          offers: numericPrice
            ? { "@type": "Offer", price: numericPrice, priceCurrency: "USD", availability: service.availabilityStatus === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" }
            : undefined,
        },
      };
    }),
  };
  const faqItems: PartnerFaqItem[] = [
    {
      question: "How do I choose the right IV service?",
      answer: "Review each service description and ingredients, then discuss eligibility and treatment suitability with an appropriately qualified healthcare professional before treatment.",
    },
    {
      question: "Are the service prices current?",
      answer: "The prices on this page come from the service and calendar configuration managed in admin.mydripnurse.com. Any applicable deposit or additional booking terms are shown during booking.",
    },
    {
      question: `How do I book with ${profile.displayName}?`,
      answer: `Choose a service, review its complete landing page, and open the dedicated secure calendar to view live availability with ${profile.displayName}.`,
    },
    {
      question: "Is every service available in every location?",
      answer: "Service and appointment availability can vary by location and calendar activation. The booking calendar shows the current options for this website.",
    },
    {
      question: "What if I need urgent or emergency medical care?",
      answer: "Do not use mobile IV booking for an emergency. Call 911 or seek immediate care from the appropriate emergency medical service.",
    },
  ];
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <PartnerExperience>
      <main className={styles.page}>
        <PartnerDirectoryAttribution partnerProfileId={profile.id} disabled={Boolean(preview)} />
        {preview ? (
          <div role="status" style={{ background: "#073f4b", color: "white", padding: "10px 20px", textAlign: "center", fontWeight: 700 }}>
            Private website preview · This page is not published yet
          </div>
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(faqStructuredData) }}
        />
        <PartnerPublicHeader profile={profile} />

        <section className={styles.servicesHero}>
          <div className={styles.shell}>
            <span className={styles.eyebrow}>Services with {profile.displayName}</span>
            <h1>Mobile IV therapy, <em>selected around how you feel.</em></h1>
            <p>Explore available services, then choose the appointment time that works best for you.</p>
          </div>
        </section>

        <section className={styles.serviceCatalog} id="services">
          <div className={styles.shell}>
            <div className={styles.catalogHeading}>
              <div>
                <span className={styles.eyebrow}>Available treatments</span>
                <h2>Choose your service.</h2>
              </div>
              <p>Only services enabled for this website are shown. Prices come from the calendar setup managed in admin.mydripnurse.com.</p>
            </div>
            <div className={styles.serviceGrid}>
              {services.map((service) => (
                <article className={styles.serviceCard} key={service.id}>
                  <div className={styles.serviceImageWrap}>
                    <Image
                      src={service.imageUrl}
                      alt={`${service.name} mobile IV therapy`}
                      title={`${service.name} mobile IV therapy with ${profile.displayName}`}
                      width={760}
                      height={460}
                      sizes="(max-width: 620px) 100vw, (max-width: 900px) 50vw, 33vw"
                      className={styles.serviceImage}
                    />
                    {service.availabilityStatus === "out_of_stock" ? <span className={styles.outOfStockBadge}>Out of Stock</span> : null}
                    </div>
                    <div className={styles.serviceCardBody}>
                      <div className={styles.servicePrice}>
                        <strong>{service.price || "Available at booking"}</strong>
                      </div>
                      <h3>{service.name}</h3>
                    <p>{service.description}</p>
                    <div className={styles.ingredientList} aria-label={`${service.name} ingredients`}>
                      {service.ingredients.map((ingredient) => <span key={ingredient}>{ingredient}</span>)}
                    </div>
                    <Link href={partnerHref(`/services/${partnerServiceSlug(service)}`)}>
                      View service details <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <PartnerTestimonials />

        <PartnerFaq
          eyebrow="Service FAQ"
          title="Questions about services and booking."
          introduction="Review these answers before selecting your treatment and appointment time."
          items={faqItems}
        />

        <PartnerFooter />
      </main>
    </PartnerExperience>
  );
}

import { nurseLocationContext, nurseIdentity } from "@/lib/partnerPublicContent";
import { ClinicCoverageSearch } from "@/components/clinics/ClinicCoverageSearch";
import { clinicWebsiteBrand } from "@/lib/clinicWebsiteBrand";
import { partnerServiceSlug } from "@/lib/myDripNurseServices";
import { ClinicServicePrice } from "@/components/clinics/ClinicServicePrice";
import { pricingCoverage, publicPriceSummary, publicPriceOffer } from "@/lib/publicServicePricing";
import { providerCoverage } from "@/lib/providerSeo";
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
  const citySummary = nurseLocationContext(data.profile.serviceAreas);
  return buildPartnerMetadata({
    profile: data.profile,
    pathname: `services/${partnerServiceSlug(data.service)}`,
    title: `${data.service.name} | ${data.profile.displayName}${citySummary ? ` · ${citySummary}` : ""}`,
    description: `Book ${data.service.name} with ${nurseIdentity(data.profile)}${citySummary ? ` in ${citySummary}` : ""}. Review ingredients, prices and available times for your visit.`,
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
  const { profile, service } = data;
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;
  const canonicalSlug = partnerServiceSlug(service);
  const landingUrl = partnerPublicUrl(profile.slug, `services/${canonicalSlug}`);
  const outOfStock = service.availabilityStatus === "out_of_stock";
  const coverage = pricingCoverage(profile.serviceAreas);
  const priceLabel = service.pricing ? publicPriceSummary(service.pricing, coverage).label : service.price;
  const faqItems: PartnerFaqItem[] = [
    {
      question: `What is included in the ${service.name} service?`,
      answer: `${service.name} is presented with ${service.ingredients.join(", ")}. Final ingredients, dosage, eligibility, and treatment suitability are reviewed by an appropriately qualified healthcare professional.`,
    },
    {
      question: `How much does ${service.name} cost?`,
      answer: priceLabel
        ? `The current listed price is ${priceLabel} per visit. Your service address confirms the final price and deposit before payment. Any additional and final booking terms appear before the appointment is confirmed.`
        : "Current pricing and any applicable deposit are displayed during the secure booking process.",
    },
    {
      question: `How do I book ${service.name} with ${profile.displayName}?`,
      answer: `Select Book ${service.name} and enter your visit address. Review the available times, price and deposit before submitting your reservation. Follow appointment updates in My Care.`,
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
          "@id": `${partnerPublicUrl(profile.slug)}#partner`,
          url: partnerPublicUrl(profile.slug),
          jobTitle: profile.publicTitle || undefined,
          honorificSuffix: profile.professionalCredentials || undefined,
        },
        areaServed: providerCoverage(profile.serviceAreas).map(area => area.schema),
        offers: service.pricing ? publicPriceOffer(service.pricing, coverage, landingUrl, outOfStock) : undefined,
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
    <PartnerExperience branding={profile.clinicBrand ? clinicWebsiteBrand(profile.clinicBrand) : undefined}>
      <main className={styles.page}>
        <PartnerDirectoryAttribution partnerProfileId={profile.id} disabled={Boolean(preview)} />
        {preview ? <div role="status" className={styles.previewBanner}>Private website preview · This page is not published yet</div> : null}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }} />
        <PartnerPublicHeader profile={profile} preview={preview} />

        <section className={styles.serviceDetailHero}>
          <div className={styles.shell}>
            <div className={styles.serviceDetailCopy}>
              <span className={styles.eyebrow}>Mobile IV therapy with {nurseIdentity(profile)}</span>
              <h1>{service.name}<br /><em>delivered to you.</em></h1>
              <p>{service.description} Request a visit with {profile.displayName}{profile.clinicBrand?.name ? ` through ${profile.clinicBrand.name}` : ""}, with suitability reviewed before treatment.</p>
              <div className={`${styles.serviceBookingCard} ${outOfStock ? styles.serviceBookingCardOutOfStock : ""}`} id="availability-status">
                {service.pricing ? <ClinicServicePrice service={service.pricing} coverage={coverage}/> : <div className={styles.servicePriceDisplay}><span>Per visit</span><strong>{priceLabel || "Available at booking"}</strong></div>}
                {outOfStock ? <span className={styles.outOfStockAction}>Out of Stock</span> : <Link href={partnerHref(`/services/${canonicalSlug}/book`)} className={styles.primaryAction}>
                  Book {service.name} <span aria-hidden="true">→</span>
                </Link>}
              </div>
              {outOfStock ? <p className={styles.outOfStockNotice}>This service is temporarily unavailable. Explore another service or check back for new appointments.</p> : null}
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
              <h2>Your {service.name} visit, made simple.</h2>
              <p>Explore the listed ingredients and plan a visit with {nurseIdentity(profile)}. Your appointment details and updates stay together in My Care.</p>
            </div>
            <div className={styles.serviceFacts}>
              <article><span>01</span><h3>Service-specific availability</h3><p>Choose an available time for your visit at home, at your hotel or at work.</p></article>
              <article><span>02</span><h3>Transparent pricing</h3><p>See your service price and deposit before paying. Pricing is confirmed for your visit address.</p></article>
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

        {profile.serviceAreas.length ? (
          <section className={styles.localServiceSection}>
            <div className={styles.shell}>
              <span className={styles.eyebrow}>Local appointment coverage</span>
              <h2>Book {service.name} in your community.</h2>
              <p>Live appointment times depend on the service calendar and current availability.</p>
              <ClinicCoverageSearch areas={providerCoverage(profile.serviceAreas).map(area => area.label)}/>
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

        <section className={`${styles.serviceBookCta} ${outOfStock ? styles.serviceBookCtaOutOfStock : ""}`}>
          <div className={styles.shell}>
            <span className={styles.eyebrow}>{outOfStock ? "Temporarily unavailable" : "Ready to view availability?"}</span>
            <h2>{outOfStock ? `${service.name} is currently out of stock.` : `Book ${service.name} with ${profile.displayName}.`}</h2>
            {outOfStock ? <p>Choose another available service or check back for new appointment times.</p> : <Link href={partnerHref(`/services/${canonicalSlug}/book`)} className={styles.primaryAction}>Open secure booking <span aria-hidden="true">→</span></Link>}
          </div>
        </section>
        <PartnerFooter branding={profile.clinicBrand} />
      </main>
    </PartnerExperience>
  );
}

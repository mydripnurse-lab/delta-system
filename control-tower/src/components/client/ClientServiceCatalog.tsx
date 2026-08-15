"use client";

import Image from "next/image";
import Link from "next/link";

import type { ClientServiceSummary } from "@/lib/clientPortalData";

import styles from "@/app/client-portal/clientPortal.module.css";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ClientServiceCatalog({
  services,
  actionLabel = "Book service",
  onSelect,
}: {
  services: ClientServiceSummary[];
  actionLabel?: string;
  onSelect?: (service: ClientServiceSummary) => void;
}) {
  if (!services.length) {
    return (
      <section className={styles.appointmentSection}>
        <div className={styles.emptyState}>
          <span>✦</span>
          <h3>Our wellness menu is being prepared.</h3>
          <p>Please check back shortly.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.serviceCatalog} aria-label="My Drip Nurse services">
      {services.map((service) => (
        <article className={styles.serviceCard} key={service.id}>
          <div className={styles.serviceImage}>
            {service.imageUrl ? (
              <Image
                src={service.imageUrl}
                alt={service.imageAlt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
              />
            ) : (
              <span aria-hidden="true">✦</span>
            )}
            <em>{service.durationMinutes} min</em>
          </div>
          <div className={styles.serviceBody}>
            <div>
              <span className={styles.eyebrow}>Mobile wellness</span>
              <h2>{service.name}</h2>
            </div>
            <p>{service.shortDescription}</p>
            {service.ingredients.length ? (
              <ul>
                {service.ingredients.slice(0, 4).map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
            ) : null}
            <div className={styles.serviceFooter}>
              <span>
                <small>Starting at</small>
                <b>{money(service.price, service.currency)}</b>
              </span>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(service)} aria-label={`${actionLabel}: ${service.name}`}>
                  {actionLabel} <b>→</b>
                </button>
              ) : (
                <Link href={`/book?service=${encodeURIComponent(service.slug)}`}>
                  {actionLabel} <b>→</b>
                </Link>
              )}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

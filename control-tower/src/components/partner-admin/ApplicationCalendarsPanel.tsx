"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";

type Service = {
  normalizedName: string;
  name: string;
  locationCount: number;
  requestedLocationCount: number;
  availableEverywhere: boolean;
  activeLocationCount: number;
  activeEverywhere: boolean;
  activeSomewhere: boolean;
  selected: boolean;
  price: number | null;
  partnerPriceOverride: number | null;
  effectivePrice: number | null;
  depositType: "percentage" | "fixed";
  depositValue: number | null;
  currency: string;
  pricingConfigured: boolean;
  calendarStatus: "draft" | "active" | "paused" | "archived";
  imageUrl: string;
  imageAlt: string;
};

type Matrix = {
  services: Service[];
  provisioned: boolean;
  summary: {
    requestedLocationCount: number;
    scannedLocationCount: number;
    failedLocationCount: number;
    commonServiceCount: number;
  };
  scanErrors: Array<{ county: string; state: string; error: string }>;
};

function money(value: number | null, currency: string) {
  if (value === null) return "Price not configured";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

export function ApplicationCalendarsPanel({ applicationId }: { applicationId: string }) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const applyMatrix = useCallback((nextMatrix: Matrix) => {
    setMatrix(nextMatrix);
    setPriceDrafts(Object.fromEntries(nextMatrix.services.map((service) => [
      service.normalizedName,
      service.partnerPriceOverride === null ? "" : String(service.partnerPriceOverride),
    ])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/calendars`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load partner services.");
      applyMatrix(payload.matrix);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load partner services.");
    } finally {
      setLoading(false);
    }
  }, [applicationId, applyMatrix]);

  const commonServices = useMemo(
    () => (matrix?.services || []).filter((service) => service.availableEverywhere),
    [matrix],
  );
  const partialCount = (matrix?.services.length || 0) - commonServices.length;

  const toggle = useCallback(async (service: Service) => {
    const currentActive = service.activeEverywhere;
    setBusy(service.normalizedName);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/calendars`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedName: service.normalizedName, active: !currentActive }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not update service access.");
      applyMatrix(payload.result.matrix);
      setNotice(`${service.name} was ${currentActive ? "removed from" : "activated for"} this partner.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update service access.");
    } finally {
      setBusy("");
    }
  }, [applicationId, applyMatrix, matrix]);

  const savePartnerPrice = useCallback(async (service: Service) => {
    const draft = priceDrafts[service.normalizedName] ?? "";
    const value = draft === "" ? null : Number(draft);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Partner price must be zero or greater.");
      return;
    }
    setBusy(`price:${service.normalizedName}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/calendars`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedName: service.normalizedName, priceOverride: value }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not update the Partner price.");
      applyMatrix(payload.result.matrix);
      setNotice(value === null
        ? `${service.name} now uses the global Admin calendar price.`
        : `${service.name} will display ${money(value, service.currency)} on this Partner website.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the Partner price.");
    } finally {
      setBusy("");
    }
  }, [applicationId, applyMatrix, priceDrafts]);

  return (
    <section className={`${styles.panel} ${styles.partnerCalendarPanel}`}>
      <div className={styles.panelHeader}>
        <div className={styles.partnerCalendarHeading}>
          <div>
            <span className={styles.eyebrow}>Service access</span>
            <h2>Partner services</h2>
            <span className={styles.subtle}>Activate services from the My Drip Nurse catalog. Coverage follows this Partner&apos;s approved areas.</span>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading || Boolean(busy)}>
            {loading ? "Loading services…" : matrix ? "Refresh services" : "Load services"}
          </button>
        </div>
      </div>

      {error ? <div className={styles.notice}>{error}</div> : null}
      {notice ? <div className={styles.successNotice}>{notice}</div> : null}

      {!matrix && !loading ? (
        <div className={styles.calendarPanelIntro}>
          <span className={styles.calendarPanelIcon}>▦</span>
          <div><strong>My Drip Nurse service access</strong><p>Services, pricing and deposits come directly from the Admin catalog. GHL calendars are not used.</p></div>
        </div>
      ) : null}
      {loading ? <div className={styles.loading}>Loading service access and coverage…</div> : null}

      {matrix && !loading ? (
        <>
          <div className={styles.calendarMatrixSummary}>
            <div><strong>{commonServices.length}</strong><span>catalog services</span></div>
            <div><strong>{matrix.summary.requestedLocationCount}</strong><span>approved coverage areas</span></div>
            <div><strong>{commonServices.filter((service) => service.activeEverywhere && service.calendarStatus === "active").length}</strong><span>booking-ready services</span></div>
            <div><strong>0</strong><span>GHL calendar dependencies</span></div>
          </div>
          <div className={styles.partnerServiceList}>
            {commonServices.map((service) => {
              const active = service.activeEverywhere;
              const calendarReady = service.calendarStatus === "active";
              return (
                <article className={styles.partnerServiceRow} key={service.normalizedName}>
                  <div className={styles.partnerServiceThumb}>
                    {service.imageUrl ? <Image src={service.imageUrl} alt={service.imageAlt || service.name} fill sizes="42px" unoptimized /> : <span>{service.name.slice(0, 1)}</span>}
                  </div>
                  <div className={styles.partnerServiceInfo}>
                    <strong>{service.name}</strong>
                    <span>{service.requestedLocationCount} coverage {service.requestedLocationCount === 1 ? "area" : "areas"} · Admin price: {money(service.price, service.currency)} · Website price: {money(service.effectivePrice, service.currency)} · {service.pricingConfigured ? `${service.depositValue}${service.depositType === "percentage" ? "%" : ` ${service.currency}`} deposit` : "Deposit not configured"}</span>
                    <small className={calendarReady ? styles.calendarReadyLabel : styles.calendarPausedLabel}>{calendarReady ? "Calendar ready for booking" : `Calendar ${service.calendarStatus}`}</small>
                    {active ? (
                      <div className={styles.partnerPriceEditor}>
                        <label htmlFor={`partner-price-${service.normalizedName}`}>Partner website price</label>
                        <div>
                          <span aria-hidden="true">$</span>
                          <input
                            id={`partner-price-${service.normalizedName}`}
                            className={styles.numberInput}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={service.price === null ? "Admin price not set" : String(service.price)}
                            value={priceDrafts[service.normalizedName] ?? ""}
                            onChange={(event) => setPriceDrafts((current) => ({ ...current, [service.normalizedName]: event.target.value }))}
                          />
                          <button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void savePartnerPrice(service)}>
                            {busy === `price:${service.normalizedName}` ? "Saving…" : "Save price"}
                          </button>
                        </div>
                        <small>Leave blank to follow the global Admin price automatically. Zero is saved and displayed as $0.</small>
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.partnerServiceState}>
                    <span className={`${styles.badge} ${active ? styles.good : styles.warn}`}>
                      {active ? "Active" : "Not active"}
                    </span>
                    <button type="button" className={active ? styles.dangerButton : styles.button} disabled={Boolean(busy) || (!active && !calendarReady)} onClick={() => void toggle(service)}>
                      {busy === service.normalizedName ? "Updating…" : active ? "Remove service" : calendarReady ? "Activate service" : "Calendar not ready"}
                    </button>
                  </div>
                </article>
              );
            })}
            {!commonServices.length ? <div className={styles.empty}>No active service exists in the Admin catalog.</div> : null}
          </div>
          {partialCount ? <div className={styles.helpText}>{partialCount} inactive catalog service{partialCount === 1 ? " is" : "s are"} hidden.</div> : null}
        </>
      ) : null}
    </section>
  );
}

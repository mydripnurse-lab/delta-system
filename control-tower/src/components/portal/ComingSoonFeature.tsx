"use client";

import { usePortalLocale } from "./PortalLocaleProvider";
import styles from "./comingSoonFeature.module.css";

export function ComingSoonFeature({ feature }: { feature: "rewards" | "products" }) {
  const { t } = usePortalLocale();
  const isRewards = feature === "rewards";
  return (
    <section className={styles.feature} aria-labelledby={`${feature}-coming-soon-title`}>
      <div className={styles.visual} aria-hidden="true">
        <span>{isRewards ? "✦" : "◇"}</span>
        <i>{isRewards ? "01" : "02"}</i>
      </div>
      <div className={styles.copy}>
        <span>{t("common.comingSoon")}</span>
        <h1 id={`${feature}-coming-soon-title`}>{t(`feature.${feature}Title`)}</h1>
        <p>{t(`feature.${feature}Body`)}</p>
        <div><span aria-hidden="true">●</span>{t("feature.preview")}</div>
      </div>
    </section>
  );
}

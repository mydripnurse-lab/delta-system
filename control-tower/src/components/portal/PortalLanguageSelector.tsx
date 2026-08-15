"use client";

import { usePortalLocale } from "./PortalLocaleProvider";
import styles from "./portalLanguageSelector.module.css";

export function PortalLanguageSelector() {
  const { locale, setLocale, t } = usePortalLocale();
  return (
    <div className={styles.selector} role="group" aria-label={t("language.label")}>
      <span>{t("language.label")}</span>
      <div>
        <button type="button" data-active={locale === "en" ? "true" : "false"} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
        <button type="button" data-active={locale === "es" ? "true" : "false"} aria-pressed={locale === "es"} onClick={() => setLocale("es")}>ES</button>
      </div>
    </div>
  );
}

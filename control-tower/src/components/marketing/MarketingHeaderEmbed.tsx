"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import ClientProfileAvatar from "@/components/client/ClientProfileAvatar";
import styles from "./marketingHeaderEmbed.module.css";

type MenuName = "iv" | "nad" | "weight" | "account" | null;
type MobileSection = Exclude<MenuName, "account" | null>;
export type MarketingHeaderMenuLink = readonly [label: string, path: string, imageUrl?: string];
export type MarketingHeaderNavLink = readonly [label: string, path: string];

export type MarketingHeaderAccount = {
  fullName: string;
  email: string;
  photoUrl: string;
  photoUpdatedAt: string;
};

type PartnerHeaderAccount = MarketingHeaderAccount & {
  profileHref?: string;
};

const IV_LINKS = [
  ["Immunity Defense / Cold & Flu", "/mobile-iv-therapy-immunity-defense-cold-flu", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69b38ce2bfc81fb94cdb5931.png"],
  ["Immunity Defense + Glutathione", "/mobile-iv-therapy-immunity-defense-cold-flu-and-glutathione", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/6a1a6fe85a3e6e89b6f1b119.png"],
  ["Myers' Cocktail", "/mobile-iv-therapy-myers-cocktail", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31919fe87a9994954d26.png"],
  ["Myers' Cocktail + Glutathione", "/mobile-iv-therapy-myers-cocktail-and-glutathione-push", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb3191717d5dd4e1934c0d.png"],
  ["Recovery & Performance", "/mobile-iv-therapy-recovery-and-performance", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69ee9b4f05d4199001cea525.png"],
  ["Hydration", "/hydration-mobile-iv-therapy", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31919fe87a9994954d28.png"],
  ["Hangover / Jet Lag", "/mobile-iv-therapy-hangover-jet-lag", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb342a0d66f2a665c9a731.png"],
  ["The Glow / Beauty IV Drip", "/mobile-iv-the-glow-beauty-iv-drip", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31919fe87a9994954d27.png"],
  ["Get Lean / Weight Loss", "/get-lean-weight-loss-mobile-iv-therapy", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb3191717d5dd4e1934c0e.png"],
  ["Alleviate", "/mobile-iv-therapy-alleviate", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eea0199fe87a9994383bdb.png"],
  ["Brain Storm", "/mobile-iv-therapy-brain-storm", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69ee9b16b0e5e2bb7ffb13f6.png"],
] as const satisfies readonly MarketingHeaderMenuLink[];

const NAD_LINKS = [
  ["NAD+", "/nad-plus-mobile-iv-therapy", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31910d66f2a665c92182.png"],
  ["NAD+ Boost", "/nad-plus-boost-mobile-iv-therapy", "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69ee9b7e05d4199001cead8a.png"],
] as const satisfies readonly MarketingHeaderMenuLink[];

const WEIGHT_LINKS = [
  ["Semaglutide", "/weight-loss-semaglutide"],
  ["Tirzepatide", "/weight-loss-tirzepatide"],
] as const;

function PhoneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.6 10.8a15.8 15.8 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.7 3.8.7.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.8 21 3 13.2 3 3.7c0-.6.4-1 1-1h3.3c.6 0 1 .4 1 1 0 1.3.2 2.6.7 3.8.1.4 0 .8-.2 1.1l-2.2 2.2Z" /></svg>;
}

function Chevron() {
  return <svg aria-hidden="true" viewBox="0 0 12 8"><path d="m1 1 5 5 5-5" /></svg>;
}

export default function MarketingHeaderEmbed({
  account,
  partnerAccount = null,
  location,
  phone,
  websiteUrl,
  bannerText,
  preferPreviousMdnOrigin = false,
  showPartnerPortal = false,
  showDirectory = true,
  showWeightLoss = true,
  showContact = true,
  showPhone = true,
  ivMenuLinks = IV_LINKS,
  nadMenuLinks = NAD_LINKS,
  additionalNavLinks = [],
  nativeNavigation = false,
}: {
  account: MarketingHeaderAccount | null;
  partnerAccount?: PartnerHeaderAccount | null;
  location: string;
  phone: string;
  websiteUrl: string;
  bannerText?: string;
  preferPreviousMdnOrigin?: boolean;
  showPartnerPortal?: boolean;
  showDirectory?: boolean;
  showWeightLoss?: boolean;
  showContact?: boolean;
  showPhone?: boolean;
  ivMenuLinks?: readonly MarketingHeaderMenuLink[];
  nadMenuLinks?: readonly MarketingHeaderMenuLink[];
  additionalNavLinks?: readonly MarketingHeaderNavLink[];
  nativeNavigation?: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [openMenu, setOpenMenu] = useState<MenuName>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<MobileSection | null>(null);
  const [resolvedWebsiteUrl, setResolvedWebsiteUrl] = useState(websiteUrl);
  const [serviceMediaByPath, setServiceMediaByPath] = useState<Record<string, string>>({});
  const primaryAccount = partnerAccount || account;
  const firstName = primaryAccount?.fullName.trim().split(/\s+/)[0] || "";
  const primaryPortalLabel = partnerAccount ? "Partner Portal" : "Client Portal";
  const phoneHref = `tel:${phone.replace(/[^\d+]/g, "")}`;
  const href = (path: string) => `${resolvedWebsiteUrl}${path}`;
  const menuHref = (path: string) => /^https?:\/\//i.test(path) ? path : href(path);
  const directoryReturnTo = "https://partners.mydripnurse.com/";
  const clientReturnTo = showPartnerPortal ? directoryReturnTo : resolvedWebsiteUrl;
  const clientLoginHref = `https://care.mydripnurse.com/login?returnTo=${encodeURIComponent(clientReturnTo)}`;
  const partnerLoginHref = "https://partners.mydripnurse.com/partner-login?returnTo=%2F";

  useEffect(() => {
    if (!preferPreviousMdnOrigin || !document.referrer) return;
    try {
      const previous = new URL(document.referrer);
      const hostname = previous.hostname.toLowerCase();
      if (previous.protocol !== "https:" || (hostname !== "mydripnurse.com" && !hostname.endsWith(".mydripnurse.com"))) return;
      const timer = window.setTimeout(() => setResolvedWebsiteUrl(previous.origin), 0);
      return () => window.clearTimeout(timer);
    } catch {
      // Keep the configured website URL when the referrer is unavailable or invalid.
    }
  }, [preferPreviousMdnOrigin]);

  useEffect(() => {
    let active = true;
    fetch("/api/public/service-media", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("service-media");
        return response.json() as Promise<{ services?: Array<{ landingPath?: string; imageUrl?: string }> }>;
      })
      .then((payload) => {
        if (!active || !Array.isArray(payload.services)) return;
        const nextMedia: Record<string, string> = {};
        payload.services.forEach((service) => {
          if (service.landingPath && service.imageUrl) nextMedia[service.landingPath] = service.imageUrl;
        });
        setServiceMediaByPath(nextMedia);
      })
      .catch(() => {
        // Keep the embedded fallback images if the live catalog is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.parent === window) return;
    let frame = 0;
    const publishHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.max(76, Math.ceil(root.getBoundingClientRect().height));
        window.parent.postMessage({ type: "mdn-site-header-resize", height }, "*");
      });
    };
    const observer = new ResizeObserver(publishHeight);
    observer.observe(root);
    publishHeight();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
        setMobileSection(null);
      }
    };
    const closeFromParent = (event: MessageEvent) => {
      if (event.data?.type !== "mdn-site-header-close") return;
      setOpenMenu(null);
      setMobileOpen(false);
      setMobileSection(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("message", closeFromParent);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("message", closeFromParent);
    };
  }, []);

  const menuButton = (name: Exclude<MenuName, "account" | null>, label: string) => (
    <button
      type="button"
      className={styles.menuButton}
      aria-expanded={openMenu === name}
      onClick={() => setOpenMenu((current) => current === name ? null : name)}
    >
      {label}<Chevron />
    </button>
  );

  const menuLinks = (items: readonly MarketingHeaderMenuLink[], wide = false) => (
    <div className={`${styles.dropdown} ${wide ? styles.wideDropdown : ""}`}>
      {items.map(([label, path, imageUrl]) => {
        const resolvedImageUrl = serviceMediaByPath[path] || imageUrl;
        const imageDescription = `${label} in ${location}`;
        return <a key={path} className={resolvedImageUrl ? styles.serviceLink : ""} href={menuHref(path)} target="_top" onClick={() => setOpenMenu(null)}>
          {resolvedImageUrl ? <><span className={styles.serviceThumb}><Image src={resolvedImageUrl} alt={imageDescription} title={imageDescription} width={52} height={52} loading="lazy" /></span><b>{label}</b></> : label}
          <span className={styles.linkArrow}>→</span>
        </a>;
      })}
    </div>
  );

  const mobileAccordion = (
    name: MobileSection,
    label: string,
    items: readonly MarketingHeaderMenuLink[],
  ) => {
    const expanded = mobileSection === name;
    return <div className={styles.mobileSection}>
      <button
        type="button"
        className={styles.mobileSectionButton}
        aria-expanded={expanded}
        onClick={() => setMobileSection((current) => current === name ? null : name)}
      >
        {label}<Chevron />
      </button>
      {expanded ? menuLinks(items) : null}
    </div>;
  };

  return (
    <header
      ref={rootRef}
      className={styles.root}
      data-mdn-site-header-embed="true"
      data-open-menu={openMenu || ""}
      data-mobile-open={mobileOpen ? "true" : "false"}
      data-native-navigation={nativeNavigation ? "true" : "false"}
      onPointerDown={(event) => {
        if (!openMenu) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(`.${styles.menuButton}, .${styles.accountButton}, .${styles.login}, .${styles.dropdown}`)) return;
        setOpenMenu(null);
      }}
    >
      <div className={styles.locationBanner}>
        {bannerText || <>Licensed Nurses <span>♡</span> Same-Day Appointments <span>♡</span> Mobile IV Therapy in {location}</>}
      </div>
      <div className={styles.bar}>
        <a className={styles.logo} href={resolvedWebsiteUrl} target="_top" aria-label="My Drip Nurse home">
          <Image src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51} priority />
        </a>

        <nav className={styles.desktopNav} aria-label="Main navigation">
          {ivMenuLinks.length ? <div>{menuButton("iv", "IV Therapy")}{openMenu === "iv" ? menuLinks(ivMenuLinks, true) : null}</div> : null}
          {nadMenuLinks.length ? <div>{menuButton("nad", "NAD+")}{openMenu === "nad" ? menuLinks(nadMenuLinks) : null}</div> : null}
          {showWeightLoss ? <div>{menuButton("weight", "Weight Loss")}{openMenu === "weight" ? menuLinks(WEIGHT_LINKS) : null}</div> : null}
          {showDirectory ? <a href="https://partners.mydripnurse.com" target="_top">Directory</a> : null}
          {showContact ? <a href={href("/contact-us")} target="_top">Contact</a> : null}
          {additionalNavLinks.map(([label, path]) => <a key={path} href={menuHref(path)} target="_top">{label}</a>)}
        </nav>

        <div className={styles.actions}>
          {showPhone ? <a className={styles.phone} href={phoneHref} target="_top" aria-label={`Call My Drip Nurse at ${phone}`}><PhoneIcon /><span>Call Us</span></a> : null}
          {primaryAccount ? (
            <div className={styles.accountWrap}>
              <button type="button" className={styles.accountButton} aria-expanded={openMenu === "account"} onClick={() => setOpenMenu((current) => current === "account" ? null : "account")}>
                <ClientProfileAvatar className={styles.avatar} fullName={primaryAccount.fullName} photoUrl={primaryAccount.photoUrl} photoUpdatedAt={primaryAccount.photoUpdatedAt} sizes="42px" />
                <span><b>{firstName}</b><small>{primaryPortalLabel}</small></span><Chevron />
              </button>
              {openMenu === "account" ? <div className={`${styles.dropdown} ${styles.accountDropdown}`}>
                <div className={styles.accountIdentity}><strong>{primaryAccount.fullName}</strong><small>{primaryAccount.email}</small></div>
                {partnerAccount ? <>
                  <a href="https://partners.mydripnurse.com/portal" target="_top">Partner Portal<span>→</span></a>
                  <a href={partnerAccount.profileHref || "https://partners.mydripnurse.com/portal/profile"} target="_top">Professional Profile<span>→</span></a>
                </> : null}
                {account ? <>
                  <a href="https://care.mydripnurse.com" target="_top">Client Portal<span>→</span></a>
                  <a href="https://care.mydripnurse.com/appointments" target="_top">Appointments<span>→</span></a>
                </> : null}
                {showPartnerPortal && !partnerAccount ? <a href={partnerLoginHref} target="_top">Partner login<span>→</span></a> : null}
                {!account ? <a href={clientLoginHref} target="_top">Client login<span>→</span></a> : null}
              </div> : null}
            </div>
          ) : showPartnerPortal ? (
            <div className={styles.accountWrap}>
              <button type="button" className={styles.login} aria-expanded={openMenu === "account"} onClick={() => setOpenMenu((current) => current === "account" ? null : "account")}>Log in <Chevron /></button>
              {openMenu === "account" ? <div className={`${styles.dropdown} ${styles.accountDropdown} ${styles.portalChooser}`}>
                <div className={styles.accountIdentity}><strong>Choose your portal</strong><small>Secure access for clients and professionals</small></div>
                <a href={clientLoginHref} target="_top">Client login<span>→</span></a>
                <a href={partnerLoginHref} target="_top">Partner login<span>→</span></a>
              </div> : null}
            </div>
          ) : <a className={styles.login} href={clientLoginHref} target="_top">Log in</a>}
          <button type="button" className={styles.mobileToggle} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => { setMobileOpen((value) => !value); setOpenMenu(null); setMobileSection(null); }}>
            <span /><span /><span />
          </button>
        </div>
      </div>

      {mobileOpen ? <div className={styles.mobileDrawer}>
        <nav aria-label="Mobile navigation">
          {ivMenuLinks.length ? mobileAccordion("iv", "IV Therapy", ivMenuLinks) : null}
          {nadMenuLinks.length ? mobileAccordion("nad", "NAD+", nadMenuLinks) : null}
          {showWeightLoss ? mobileAccordion("weight", "Weight Loss", WEIGHT_LINKS) : null}
          {showDirectory ? <a href="https://partners.mydripnurse.com" target="_top">Directory<span>→</span></a> : null}
          {showContact ? <a href={href("/contact-us")} target="_top">Contact<span>→</span></a> : null}
          {additionalNavLinks.map(([label, path]) => <a key={path} href={menuHref(path)} target="_top">{label}<span>→</span></a>)}
          {account ? <a href="https://care.mydripnurse.com" target="_top">Client Portal<span>→</span></a> : <a href={clientLoginHref} target="_top">Client login<span>→</span></a>}
          {showPartnerPortal ? (partnerAccount
            ? <a href="https://partners.mydripnurse.com/portal" target="_top">Partner Portal<span>→</span></a>
            : <a href={partnerLoginHref} target="_top">Partner login<span>→</span></a>) : null}
        </nav>
        {primaryAccount ? <div className={styles.mobileIdentity}>
          <ClientProfileAvatar className={styles.avatar} fullName={primaryAccount.fullName} photoUrl={primaryAccount.photoUrl} photoUpdatedAt={primaryAccount.photoUpdatedAt} sizes="42px" />
          <span><b>{primaryAccount.fullName}</b><small>{primaryPortalLabel}</small></span>
        </div> : null}
        {showPhone ? <a className={styles.mobilePhone} href={phoneHref} target="_top" aria-label={`Call My Drip Nurse at ${phone}`}><PhoneIcon />Call Us</a> : null}
      </div> : null}
    </header>
  );
}

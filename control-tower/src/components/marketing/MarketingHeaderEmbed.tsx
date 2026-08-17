"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import ClientProfileAvatar from "@/components/client/ClientProfileAvatar";
import styles from "./marketingHeaderEmbed.module.css";

type MenuName = "iv" | "nad" | "weight" | "account" | null;

type HeaderAccount = {
  fullName: string;
  email: string;
  photoUrl: string;
  photoUpdatedAt: string;
};

const IV_LINKS = [
  ["Immunity Defense / Cold & Flu", "/mobile-iv-therapy-immunity-defense-cold-flu"],
  ["Immunity Defense + Glutathione", "/mobile-iv-therapy-immunity-defense-cold-flu-and-glutathione"],
  ["Myers' Cocktail", "/mobile-iv-therapy-myers-cocktail"],
  ["Myers' Cocktail + Glutathione", "/mobile-iv-therapy-myers-cocktail-and-glutathione-push"],
  ["Recovery & Performance", "/mobile-iv-therapy-recovery-and-performance"],
  ["Hydration", "/hydration-mobile-iv-therapy"],
  ["Hangover / Jet Lag", "/mobile-iv-therapy-hangover-jet-lag"],
  ["The Glow / Beauty IV Drip", "/mobile-iv-the-glow-beauty-iv-drip"],
  ["Get Lean / Weight Loss", "/get-lean-weight-loss-mobile-iv-therapy"],
  ["Alleviate", "/mobile-iv-therapy-alleviate"],
  ["Brain Storm", "/mobile-iv-therapy-brain-storm"],
] as const;

const NAD_LINKS = [
  ["NAD+", "/nad-plus-mobile-iv-therapy"],
  ["NAD+ Boost", "/nad-plus-boost-mobile-iv-therapy"],
] as const;

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
  phone,
  websiteUrl,
}: {
  account: HeaderAccount | null;
  phone: string;
  websiteUrl: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [openMenu, setOpenMenu] = useState<MenuName>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const firstName = account?.fullName.trim().split(/\s+/)[0] || "";
  const phoneHref = `tel:${phone.replace(/[^\d+]/g, "")}`;
  const href = (path: string) => `${websiteUrl}${path}`;

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
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
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

  const menuLinks = (items: ReadonlyArray<readonly [string, string]>, wide = false) => (
    <div className={`${styles.dropdown} ${wide ? styles.wideDropdown : ""}`}>
      {items.map(([label, path]) => <a key={path} href={href(path)} target="_top" onClick={() => setOpenMenu(null)}>{label}<span>→</span></a>)}
    </div>
  );

  return (
    <header
      ref={rootRef}
      className={styles.root}
      data-mdn-site-header-embed="true"
      data-open-menu={openMenu || ""}
      data-mobile-open={mobileOpen ? "true" : "false"}
    >
      <div className={styles.bar}>
        <a className={styles.logo} href={websiteUrl} target="_top" aria-label="My Drip Nurse home">
          <Image src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51} priority />
        </a>

        <nav className={styles.desktopNav} aria-label="Main navigation">
          <div>{menuButton("iv", "IV Therapy")}{openMenu === "iv" ? menuLinks(IV_LINKS, true) : null}</div>
          <div>{menuButton("nad", "NAD+")}{openMenu === "nad" ? menuLinks(NAD_LINKS) : null}</div>
          <div>{menuButton("weight", "Weight Loss")}{openMenu === "weight" ? menuLinks(WEIGHT_LINKS) : null}</div>
          <a href="https://partners.mydripnurse.com" target="_top">Directory</a>
          <a href={href("/contact-us")} target="_top">Contact</a>
        </nav>

        <div className={styles.actions}>
          <a className={styles.phone} href={phoneHref} target="_top"><PhoneIcon /><span>{phone}</span></a>
          {account ? (
            <div className={styles.accountWrap}>
              <button type="button" className={styles.accountButton} aria-expanded={openMenu === "account"} onClick={() => setOpenMenu((current) => current === "account" ? null : "account")}>
                <ClientProfileAvatar className={styles.avatar} fullName={account.fullName} photoUrl={account.photoUrl} photoUpdatedAt={account.photoUpdatedAt} sizes="42px" />
                <span><b>{firstName}</b><small>My Care</small></span><Chevron />
              </button>
              {openMenu === "account" ? <div className={`${styles.dropdown} ${styles.accountDropdown}`}>
                <div className={styles.accountIdentity}><strong>{account.fullName}</strong><small>{account.email}</small></div>
                <a href="https://care.mydripnurse.com" target="_top">Client Portal<span>→</span></a>
                <a href="https://care.mydripnurse.com/appointments" target="_top">Appointments<span>→</span></a>
                <a href="https://care.mydripnurse.com/profile" target="_top">Profile<span>→</span></a>
              </div> : null}
            </div>
          ) : <a className={styles.login} href="https://care.mydripnurse.com/login" target="_top">Log in</a>}
          <button type="button" className={styles.mobileToggle} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => { setMobileOpen((value) => !value); setOpenMenu(null); }}>
            <span /><span /><span />
          </button>
        </div>
      </div>

      {mobileOpen ? <div className={styles.mobileDrawer}>
        <nav aria-label="Mobile navigation">
          <details><summary>IV Therapy<Chevron /></summary>{menuLinks(IV_LINKS)}</details>
          <details><summary>NAD+<Chevron /></summary>{menuLinks(NAD_LINKS)}</details>
          <details><summary>Weight Loss<Chevron /></summary>{menuLinks(WEIGHT_LINKS)}</details>
          <a href="https://partners.mydripnurse.com" target="_top">Directory<span>→</span></a>
          <a href={href("/contact-us")} target="_top">Contact<span>→</span></a>
          {account ? <a href="https://care.mydripnurse.com" target="_top">Client Portal<span>→</span></a> : <a href="https://care.mydripnurse.com/login" target="_top">Log in<span>→</span></a>}
        </nav>
        <a className={styles.mobilePhone} href={phoneHref} target="_top"><PhoneIcon />{phone}</a>
      </div> : null}
    </header>
  );
}

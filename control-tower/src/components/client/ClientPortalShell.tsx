"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ClientAccount } from "@/lib/clientPortalAuth";

import ClientLogoutButton from "./ClientLogoutButton";
import ClientProfileAvatar from "./ClientProfileAvatar";
import styles from "@/app/client-portal/clientPortal.module.css";

const nav = [
  { href: "/", label: "Home", icon: "home", description: "Your care and upcoming visits" },
  { href: "/book", label: "Book", icon: "book", description: "Schedule your next wellness service" },
  { href: "/services", label: "Services", icon: "services", description: "Explore available IV therapies" },
  { href: "/appointments", label: "Appointments", icon: "calendar", description: "Review and manage your visits" },
  { href: "/rewards", label: "Rewards", icon: "spark", description: "Track every way your wellness gives back" },
  { href: "/products", label: "Products", icon: "products", description: "Wellness products coming soon" },
];

function profileCompletion(account: ClientAccount) {
  const signals = [
    { label: "Confirm your name and mobile number", complete: Boolean(account.fullName && account.phone) },
    { label: "Add your date of birth", complete: Boolean(account.dateOfBirth) },
    { label: "Add your height and weight", complete: Boolean(account.heightInches && account.weightPounds) },
    { label: "Choose your sex / gender preference", complete: Boolean(account.genderIdentity) },
    { label: "Verify your preferred service address", complete: account.addressVerified },
  ];
  const completed = signals.filter((signal) => signal.complete).length;
  return {
    complete: completed === signals.length,
    percent: Math.round((completed / signals.length) * 100),
    missing: signals.filter((signal) => !signal.complete),
  };
}

function NavIcon({ name }: { name: string }) {
  if (name === "book") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></svg>;
  if (name === "profile") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
  if (name === "products") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Zm0 0v9l8 4 8-4V8M12 12v9" /></svg>;
  if (name === "services") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="8.5" /></svg>;
  if (name === "calendar") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3m10-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" /></svg>;
  if (name === "spark") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3Zm6.5 11 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z" /></svg>;
}

export default function ClientPortalShell({
  account,
  children,
}: {
  account: ClientAccount;
  children: ReactNode;
}) {
  const internalPathname = usePathname();
  const pathname = internalPathname.replace(/^\/client-portal/, "") || "/";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDetailsElement>(null);
  const firstName = account.fullName.split(/\s+/)[0] || "Guest";
  const profile = profileCompletion(account);

  useEffect(() => {
    const profileMenu = profileMenuRef.current;
    if (!profileMenu) return;

    const closeMenu = () => {
      profileMenu.open = false;
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (profileMenu.open && event.target instanceof Node && !profileMenu.contains(event.target)) {
        closeMenu();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !profileMenu.open) return;
      closeMenu();
      profileMenu.querySelector<HTMLElement>("summary")?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (profileMenuRef.current) profileMenuRef.current.open = false;
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <div className={styles.experience}>
      <header className={styles.header}>
        <div className={styles.headerShell}>
          <Link href="/" className={styles.logoLink} aria-label="My Drip Nurse Care home">
            <Image src="/mdn-logo.png" alt="My Drip Nurse" width={220} height={47} priority />
          </Link>
          <nav className={styles.desktopNav} aria-label="Patient portal navigation">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? styles.activeNav : ""}>
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/book" className={styles.globalBookAction} aria-label="Book mobile care">
            <span aria-hidden="true">+</span> Book
          </Link>
          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-label="Open Care navigation"
            aria-expanded={mobileMenuOpen}
            aria-controls="care-mobile-navigation"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
          <details ref={profileMenuRef} className={styles.profileMenu}>
            <summary>
              <ClientProfileAvatar className={styles.avatar} fullName={account.fullName} photoUrl={account.profilePhotoUrl} photoUpdatedAt={account.profilePhotoUpdatedAt} sizes="43px" />
              <span className={styles.profileName}><b>{firstName}</b><small>My care</small></span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className={styles.profileMenuPanel}>
              <div><b>{account.fullName}</b><small>{account.email}</small></div>
              <Link href="/profile" onClick={() => { if (profileMenuRef.current) profileMenuRef.current.open = false; }}>
                Manage profile <span>→</span>
              </Link>
              <ClientLogoutButton className={styles.logoutButton} />
            </div>
          </details>
        </div>
      </header>

      <main className={styles.main}>
        {!profile.complete && pathname !== "/profile" ? (
          <aside className={styles.profileReminder} aria-label="Care profile progress">
            <div className={styles.profileReminderProgress} aria-hidden="true"><span style={{ width: `${profile.percent}%` }} /></div>
            <div><small>Care profile · {profile.percent}%</small><strong>{profile.missing[0]?.label || "Review your care profile"}</strong></div>
            <Link href="/profile">Continue <span>→</span></Link>
          </aside>
        ) : null}
        {children}
      </main>

      {mobileMenuOpen ? (
        <div className={styles.mobileDrawerBackdrop} role="presentation" onClick={() => setMobileMenuOpen(false)}>
          <section
            id="care-mobile-navigation"
            className={styles.mobileDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="care-mobile-menu-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div className={styles.mobileDrawerProfile}>
                <ClientProfileAvatar className={styles.mobileDrawerAvatar} fullName={account.fullName} photoUrl={account.profilePhotoUrl} photoUpdatedAt={account.profilePhotoUpdatedAt} sizes="46px" />
                <div>
                  <small>Patient account</small>
                  <strong id="care-mobile-menu-title">{account.fullName}</strong>
                  <p>{account.email}</p>
                </div>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation menu">×</button>
            </header>
            <nav aria-label="Care mobile navigation">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive(item.href) ? styles.mobileDrawerActive : ""}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span><NavIcon name={item.icon} /></span>
                  <div><strong>{item.label}</strong><small>{item.description}</small></div>
                  <b aria-hidden="true">→</b>
                </Link>
              ))}
            </nav>
            <footer>
              <Link href="/profile" className={styles.mobileDrawerManageProfile} onClick={() => setMobileMenuOpen(false)}>
                <span><NavIcon name="profile" /></span>
                <div><strong>Manage profile</strong><small>Personal details, addresses and safety profile</small></div>
                <b aria-hidden="true">→</b>
              </Link>
              <ClientLogoutButton className={styles.mobileDrawerSignOut} />
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

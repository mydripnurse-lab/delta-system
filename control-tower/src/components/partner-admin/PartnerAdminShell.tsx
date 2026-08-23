"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

import { PartnerAdminLogout } from "@/components/partner-admin/PartnerAdminLogout";
import { PortalLanguageSelector } from "@/components/portal/PortalLanguageSelector";
import { usePortalLocale } from "@/components/portal/PortalLocaleProvider";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

type AdminUser = {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

type AdminAccess = {
  role: "platform_owner" | "state_market_manager";
  isOwner: boolean;
  stateCodes: string[];
  modules: string[];
};

const NAV_ITEMS = [
  { href: "/", labelKey: "nav.applications", icon: "inbox", module: "applications" },
  { href: "/partners", labelKey: "nav.partners", icon: "users", module: "partners" },
  { href: "/appointments", labelKey: "nav.appointments", icon: "appointments", module: "appointments" },
  { href: "/refunds", labelKey: "nav.refunds", icon: "refunds", module: "refunds" },
  { href: "/contacts", labelKey: "nav.contacts", icon: "contacts", module: "contacts" },
  { href: "/care", labelKey: "nav.care", icon: "care", module: "care" },
  { href: "/analytics", labelKey: "nav.analytics", icon: "analytics", module: "analytics" },
  { href: "/directory-analytics", labelKey: "nav.directoryAnalytics", icon: "directory", module: "directory-analytics" },
  { href: "/services", labelKey: "nav.services", icon: "services", module: "services", ownerOnly: true },
  { href: "/calendars", labelKey: "nav.calendars", icon: "calendar", module: "calendars", ownerOnly: true },
  { href: "/support", labelKey: "nav.supportInbox", icon: "support", module: "support" },
  { href: "/market-management", labelKey: "nav.marketManagers", icon: "market", module: "market-management", ownerOnly: true },
  { href: "/rewards", labelKey: "nav.rewards", icon: "rewards", module: "rewards", comingSoon: true, ownerOnly: true },
  { href: "/products", labelKey: "nav.products", icon: "products", module: "products", comingSoon: true, ownerOnly: true },
] as const;

const TITLE_KEYS: Record<string, string> = {
  Applications: "nav.applications",
  Partners: "nav.partners",
  Appointments: "nav.appointments",
  "Refund requests": "nav.refunds",
  Contacts: "nav.contacts",
  Care: "nav.care",
  Analytics: "nav.analytics",
  "Business Analytics": "nav.analytics",
  "Directory analytics": "nav.directoryAnalytics",
  Services: "nav.services",
  "Booking calendars": "nav.calendars",
  "Support inbox": "nav.supportInbox",
  Rewards: "nav.rewards",
  Products: "nav.products",
  "Market Managers": "nav.marketManagers",
};

function NavIcon({ name }: { name: (typeof NAV_ITEMS)[number]["icon"] }) {
  if (name === "inbox") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 14h4l2 2h4l2-2h4" /></svg>;
  if (name === "users") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M16 14a5 5 0 0 1 5 5" /></svg>;
  if (name === "appointments") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v3M19 4v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1Z" /><path d="M8 13h3M8 16h3M14 13h2M14 16h2" /></svg>;
  if (name === "refunds") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v11H4zM7 7V5h10v2M8 12h8M8 15h5" /><path d="m6 10-2 2 2 2" /></svg>;
  if (name === "contacts") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a5.5 5.5 0 0 1 11 0M16 7h5M16 11h5M16 15h4" /></svg>;
  if (name === "care") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S4 15.4 4 9.2A4.2 4.2 0 0 1 11.2 6L12 7l.8-1A4.2 4.2 0 0 1 20 9.2C20 15.4 12 20 12 20Z" /><path d="M8 12h2l1-2 2 4 1-2h2" /></svg>;
  if (name === "analytics") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
  if (name === "directory") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-12a7 7 0 0 0-14 0c0 6.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>;
  if (name === "market") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 5v14M16 5v14M4 10h16M4 15h16" /><circle cx="12" cy="12" r="2" /></svg>;
  if (name === "services") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v6H5zM5 14h6v6H5zM15 14h4v6h-4z" /></svg>;
  if (name === "support") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3h0A2.5 2.5 0 0 1 4 13.5Z" /><path d="M8 9h8M8 12h5" /></svg>;
  if (name === "rewards") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4a4 4 0 0 1-8 0Z" /><path d="M8 6H5v2a4 4 0 0 0 4 4M16 6h3v2a4 4 0 0 1-4 4M12 12v5M8 20h8M9 17h6" /></svg>;
  if (name === "products") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4Z" /><path d="M4 8v8l8 4 8-4V8M12 12v8" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v3M19 4v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1Z" /></svg>;
}

function initials(user: AdminUser | null) {
  const source = user?.fullName || user?.email || "MDN";
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "MD";
}

function createAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
      reject(new Error("Choose a JPG, PNG or WebP image."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Choose an image smaller than 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not process this image."));
      image.onload = () => {
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - size) / 2;
        const sourceY = (image.naturalHeight - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 320;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not prepare this image."));
          return;
        }
        context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 320, 320);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export function PartnerAdminShell({
  children,
  title = "Partner operations",
  actions,
}: {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const { t } = usePortalLocale();
  const prefixedAdmin = pathname.startsWith("/partner-admin") || pathname === "/care";
  const automationsHref = prefixedAdmin
    ? "/partner-admin/automations"
    : "/automations";
  const automationsActive = pathname.startsWith("/partner-admin/automations")
    || pathname.startsWith("/automations");
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/partner-admin/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload?.user) {
          setUser(payload.user);
          setAccess(payload.access || null);
          setProfileName(payload.user.fullName || "");
          setProfileAvatar(payload.user.avatarUrl || "");
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [profileOpen]);

  const userLabel = useMemo(() => user?.fullName || user?.email?.split("@")[0] || "Administrator", [user]);
  const visibleNavItems = useMemo(() => NAV_ITEMS.filter((item) => {
    if (!access) return true;
    if (access.isOwner) return true;
    if ("ownerOnly" in item && item.ownerOnly) return false;
    return access.modules.includes(item.module);
  }), [access]);

  async function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProfileError("");
    try {
      setProfileAvatar(await createAvatar(file));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not process this image.");
    }
  }

  async function saveProfile() {
    setProfileBusy(true);
    setProfileError("");
    try {
      const response = await fetch("/api/partner-admin/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: profileName, avatarUrl: profileAvatar }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not update profile.");
      setUser(payload.user);
      setProfileName(payload.user.fullName || "");
      setProfileAvatar(payload.user.avatarUrl || "");
      setEditorOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setProfileBusy(false);
    }
  }

  function openProfileEditor() {
    setProfileName(user?.fullName || "");
    setProfileAvatar(user?.avatarUrl || "");
    setProfileError("");
    setProfileOpen(false);
    setEditorOpen(true);
  }

  return (
    <main className={styles.crmShell}>
      <aside className={`${styles.crmSidebar} ${menuOpen ? styles.crmSidebarOpen : ""}`}>
        <div className={styles.crmBrand}>
          <span className={styles.logo} aria-hidden="true" />
          <button type="button" className={styles.mobileClose} aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
        </div>

        <nav className={styles.crmNav} aria-label="Partner Admin">
          <span className={styles.crmNavLabel}>{t("nav.workspace")}</span>
          {visibleNavItems.map((item, index) => {
            const active = item.href === "/"
              ? pathname === "/" || pathname === "/partner-admin" || pathname === "/applications" || pathname.startsWith("/applications/")
              : pathname.startsWith(item.href) || pathname.startsWith(`/partner-admin${item.href}`);
            const itemHref = prefixedAdmin
              ? item.href === "/" ? "/partner-admin" : `/partner-admin${item.href}`
              : item.href;
            return (
              <Link key={`${item.labelKey}-${index}`} href={itemHref} className={`${styles.crmNavItem} ${active ? styles.crmNavItemActive : ""}`} onClick={() => setMenuOpen(false)}>
                <NavIcon name={item.icon} />
                <span>{t(item.labelKey)}</span>
                {"comingSoon" in item && item.comingSoon ? <small className={styles.navSoon}>{t("common.comingSoon")}</small> : null}
              </Link>
            );
          })}

          {access?.isOwner !== false ? <><span className={styles.crmNavLabel}>{t("nav.system")}</span>
            <Link href={automationsHref} className={`${styles.crmNavItem} ${automationsActive ? styles.crmNavItemActive : ""}`} onClick={() => setMenuOpen(false)}>
              <span className={styles.navDot} />{t("nav.automations")}
            </Link>
            <span className={`${styles.crmNavItem} ${styles.crmNavItemMuted}`}><span className={styles.navDot} />{t("nav.settings")}<small>{t("common.comingSoon")}</small></span></> : null}
        </nav>

        <div className={styles.crmSidebarFooter}>
          <span className={styles.healthDot} />
          <div><strong>{access?.isOwner === false ? "State-scoped workspace" : t("admin.privateWorkspace")}</strong><span>{access?.isOwner === false ? `${access.stateCodes.join(", ")} markets` : t("admin.privateOnly")}</span></div>
        </div>
      </aside>

      {menuOpen ? <button type="button" className={styles.mobileBackdrop} aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}

      <section className={styles.crmWorkspace}>
        <header className={styles.crmTopbar}>
          <div className={styles.crmTopbarTitle}>
            <button type="button" className={styles.mobileMenu} aria-label="Open menu" onClick={() => setMenuOpen(true)}>☰</button>
            <div><span>My Drip Nurse</span><strong>{TITLE_KEYS[title] ? t(TITLE_KEYS[title]) : title}</strong></div>
          </div>
          <div className={styles.crmTopbarActions}>
            {actions}
            <div className={styles.crmProfile} ref={profileRef}>
              <button type="button" className={styles.crmProfileTrigger} onClick={() => setProfileOpen((current) => !current)} aria-haspopup="menu" aria-expanded={profileOpen}>
                <span className={`${styles.crmProfileAvatar} ${user?.avatarUrl ? styles.crmProfileAvatarImage : ""}`} style={user?.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}>{user?.avatarUrl ? "" : initials(user)}</span>
                <span className={styles.crmProfileCopy}><strong>{userLabel}</strong><span>{user?.email || "Secure session"}</span></span>
                <span className={`${styles.profileChevron} ${profileOpen ? styles.profileChevronOpen : ""}`}>⌄</span>
              </button>
              {profileOpen ? (
                <div className={styles.profileMenu} role="menu">
                  <button type="button" role="menuitem" onClick={openProfileEditor}><span>✎</span><span><strong>{t("menu.editProfile")}</strong><small>{t("menu.profileDetails")}</small></span></button>
                  <PortalLanguageSelector />
                  <PartnerAdminLogout className={styles.profileSignOut} label={t("menu.signOut")} busyLabel={t("menu.signingOut")} />
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className={styles.crmContent}>{children}</div>
      </section>

      {editorOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !profileBusy) setEditorOpen(false); }}>
          <section className={styles.profileModal} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
            <header className={styles.profileModalHeader}>
              <div><span className={styles.eyebrow}>Administrator account</span><h2 id="edit-profile-title">Edit profile</h2><p>Update the identity shown inside My Drip Nurse Partner Admin.</p></div>
              <button type="button" className={styles.closeButton} onClick={() => setEditorOpen(false)} disabled={profileBusy} aria-label="Close profile editor">×</button>
            </header>
            <div className={styles.profileModalBody}>
              <div className={styles.profilePhotoEditor}>
                <span className={`${styles.profilePhotoPreview} ${profileAvatar ? styles.crmProfileAvatarImage : ""}`} style={profileAvatar ? { backgroundImage: `url(${profileAvatar})` } : undefined}>{profileAvatar ? "" : initials({ email: user?.email || "", fullName: profileName, avatarUrl: null })}</span>
                <div><strong>Profile photo</strong><p>JPG, PNG or WebP. The image is cropped to a square automatically.</p><div className={styles.profilePhotoActions}><label className={styles.secondaryButton}>Upload image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectAvatar(event)} /></label>{profileAvatar ? <button type="button" className={styles.dangerButton} onClick={() => setProfileAvatar("")}>Remove</button> : null}</div></div>
              </div>
              <label className={styles.formField}><span>Full name</span><input className={styles.input} value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={120} autoFocus /></label>
              <label className={styles.formField}><span>Email address</span><input className={styles.input} value={user?.email || ""} disabled /><small>The login email is managed by the Partner Admin allowlist.</small></label>
              {profileError ? <div className={styles.notice} role="alert">{profileError}</div> : null}
            </div>
            <footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={() => setEditorOpen(false)} disabled={profileBusy}>Cancel</button><button type="button" className={styles.button} onClick={() => void saveProfile()} disabled={profileBusy || !profileName.trim()}>{profileBusy ? "Saving…" : "Save profile"}</button></footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

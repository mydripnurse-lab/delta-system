"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type AuthMeUser = {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  globalRoles?: string[];
};

type Props = {
  title: string;
  subtitle?: ReactNode;
  details?: ReactNode;
  backHref: string;
  showBackButton?: boolean;
  backLabel?: string;
  showLivePill?: boolean;
  liveLabel?: string;
  useTenantNameInTitle?: boolean;
  tenantTitleSuffix?: string;
  tenantId?: string;
  notificationsHref?: string;
  showNotifications?: boolean;
  extraPill?: ReactNode;
  showCreator?: boolean;
  className?: string;
};

export default function DashboardTopbar({
  title,
  subtitle,
  details,
  backHref,
  showBackButton = true,
  backLabel = "← Back",
  showLivePill = true,
  liveLabel = "Live",
  useTenantNameInTitle = false,
  tenantTitleSuffix = "",
  tenantId = "",
  notificationsHref = "/dashboard/notification-hub",
  showNotifications = true,
  extraPill = null,
  showCreator = true,
  className = "",
}: Props) {
  const [authMe, setAuthMe] = useState<AuthMeUser | null>(null);
  const [tenantHeaderName, setTenantHeaderName] = useState("My Drip Nurse");
  const [tenantHeaderSlug, setTenantHeaderSlug] = useState("my-drip-nurse");
  const [tenantHeaderLogo, setTenantHeaderLogo] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  function accountDisplayName() {
    const full = String(authMe?.fullName || "").trim();
    if (full) return full;
    const email = String(authMe?.email || "").trim();
    if (!email) return "Platform User";
    return email.split("@")[0] || email;
  }

  function currentRoleLabel() {
    const roles = Array.isArray(authMe?.globalRoles) ? authMe.globalRoles : [];
    return String(roles[0] || "tenant_user").trim() || "tenant_user";
  }

  function initialsFromLabel(label: string) {
    const cleaned = String(label || "").trim();
    if (!cleaned) return "U";
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  function openAgencyAccountPanel(panel: "profile" | "security") {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/?account=${panel}&returnTo=${returnTo}`;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  useEffect(() => {
    let cancelled = false;
    async function loadAuthMe() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; user?: AuthMeUser }
          | null;
        if (!cancelled && res.ok && json?.ok && json.user) setAuthMe(json.user);
      } catch {
        // optional auth metadata for header
      }
    }
    void loadAuthMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTenantBranding() {
      if (!tenantId) return;
      try {
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              tenant?: { name?: string | null; slug?: string | null } | null;
              settings?: { logo_url?: string | null } | null;
            }
          | null;
        if (!res.ok || !json?.ok || cancelled) return;
        const name = String(json.tenant?.name || "").trim();
        const slug = String(json.tenant?.slug || "").trim();
        const logoUrl = String(json.settings?.logo_url || "").trim();
        if (name) setTenantHeaderName(name);
        if (slug) setTenantHeaderSlug(slug);
        setTenantHeaderLogo(logoUrl);
      } catch {
        // optional tenant branding for header
      }
    }
    void loadTenantBranding();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadNotificationCount() {
      if (!tenantId || !showNotifications) {
        if (!cancelled) setNotificationCount(0);
        return;
      }
      try {
        const qs = new URLSearchParams({
          organizationId: tenantId,
          status: "proposed",
          limit: "200",
        });
        const res = await fetch(`/api/agents/proposals?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; proposals?: Array<unknown> }
          | null;
        if (!res.ok || !json?.ok) return;
        if (!cancelled) {
          setNotificationCount(Array.isArray(json.proposals) ? json.proposals.length : 0);
        }
      } catch {
        if (!cancelled) setNotificationCount(0);
      }
    }
    void loadNotificationCount();
    return () => {
      cancelled = true;
    };
  }, [tenantId, showNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <header className={`agencyGlobalTopbar ${className}`.trim()}>
      <div className="agencyGlobalBrand">
        {tenantHeaderLogo ? (
          <img
            className="logo tenantLogo"
            src={tenantHeaderLogo}
            alt={`${tenantHeaderName} logo`}
          />
        ) : (
          <div className="agencyBrandLogo agencyBrandLogoDelta" />
        )}
        <div>
          <h1>{useTenantNameInTitle ? `${tenantHeaderName}${tenantTitleSuffix}` : title}</h1>
          <p>@{tenantHeaderSlug || "tenant"}</p>
          {subtitle ? <div className="mini" style={{ opacity: 0.82, marginTop: 4 }}>{subtitle}</div> : null}
          {details ? <div className="mini" style={{ marginTop: 6 }}>{details}</div> : null}
        </div>
      </div>

      <nav className="agencyGlobalNav agencyGlobalNavRight">
        {showBackButton ? (
          <Link className="agencyGlobalNavItem" href={backHref} style={{ textDecoration: "none" }}>
            {backLabel}
          </Link>
        ) : null}

        {showLivePill ? (
          <div className="agencyLivePill">
            <span className="dot" />
            <span>{liveLabel}</span>
          </div>
        ) : null}

        {extraPill}

        <div className="agencyAccountWrap" ref={accountMenuRef}>
          <button
            type="button"
            className="agencyAccountTrigger"
            title={accountDisplayName()}
            onClick={() => setAccountMenuOpen((prev) => !prev)}
          >
            <span className="agencyProfileAvatar">
              {showNotifications && notificationCount > 0 ? (
                <span
                  className="agencyProfileNotifBadge"
                  aria-label={`${notificationCount} notifications`}
                >
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              ) : null}
              {String(authMe?.avatarUrl || "").trim() ? (
                <img
                  className="agencyProfileAvatarImg"
                  src={String(authMe?.avatarUrl || "").trim()}
                  alt={accountDisplayName()}
                />
              ) : (
                initialsFromLabel(accountDisplayName())
              )}
            </span>
            <span className="agencyAccountIdentity">
              <strong>{accountDisplayName()}</strong>
              <small>{currentRoleLabel()}</small>
            </span>
            <span className="agencyAccountCaret" aria-hidden>
              ▾
            </span>
          </button>
          {accountMenuOpen ? (
            <div className="agencyAccountMenu">
              <button
                type="button"
                className="agencyAccountMenuItem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  openAgencyAccountPanel("profile");
                }}
              >
                Profile
              </button>
              <button
                type="button"
                className="agencyAccountMenuItem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  openAgencyAccountPanel("security");
                }}
              >
                Security
              </button>
              {showNotifications ? (
                <button
                  type="button"
                  className="agencyAccountMenuItem agencyAccountMenuItemNotif"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    window.location.href = notificationsHref;
                  }}
                >
                  <span>Notifications</span>
                  <span className="agencyAccountMenuCount">{notificationCount}</span>
                </button>
              ) : null}
              {showCreator ? (
                <div className="agencyAccountMenuItem" style={{ opacity: 0.8 }}>
                  Axel Castro · Devasks
                </div>
              ) : null}
              <button
                type="button"
                className="agencyAccountMenuItem"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

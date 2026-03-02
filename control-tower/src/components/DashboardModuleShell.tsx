"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type DashboardModuleKey =
  | "overview"
  | "calls"
  | "contacts"
  | "conversations"
  | "appointments"
  | "transactions"
  | "search"
  | "ga"
  | "ads"
  | "facebook-ads"
  | "youtube-ads"
  | "prospecting";

type Props = {
  backHref: string;
  active: DashboardModuleKey;
  children: ReactNode;
};

const moduleNav: Array<{ key: DashboardModuleKey; label: string; href: string }> = [
  { key: "overview", label: "Overview", href: "/dashboard" },
  { key: "calls", label: "Calls", href: "/dashboard/calls" },
  { key: "contacts", label: "Contacts / Leads", href: "/dashboard/contacts" },
  { key: "conversations", label: "Conversations", href: "/dashboard/conversations" },
  { key: "appointments", label: "Appointments", href: "/dashboard/appointments" },
  { key: "transactions", label: "Transactions", href: "/dashboard/transactions" },
  { key: "search", label: "Search Performance", href: "/dashboard/search-performance" },
  { key: "ga", label: "Google Analytics", href: "/dashboard/ga" },
  { key: "ads", label: "Google Ads", href: "/dashboard/ads" },
  { key: "facebook-ads", label: "Facebook Ads", href: "/dashboard/facebook-ads" },
  { key: "youtube-ads", label: "YouTube Ads", href: "/dashboard/youtube-ads" },
  { key: "prospecting", label: "Prospecting", href: "/dashboard/prospecting" },
];

export default function DashboardModuleShell({ backHref, active, children }: Props) {
  return (
    <div className="agencyRoot">
      <aside className="agencySidebar">
        <nav className="agencyNav">
          <Link className="agencyNavItem agencyNavBackItem" href={backHref}>
            ← Back to Dashboard
          </Link>
          {moduleNav.map((item) => (
            <Link
              key={item.key}
              className={`agencyNavItem ${active === item.key ? "agencyNavItemActive" : ""}`}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="agencyMain">{children}</section>
    </div>
  );
}

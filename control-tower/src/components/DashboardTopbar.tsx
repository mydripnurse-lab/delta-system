"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import DashboardNotificationsPill from "@/components/DashboardNotificationsPill";

type Props = {
  title: string;
  subtitle?: ReactNode;
  details?: ReactNode;
  backHref: string;
  backLabel?: string;
  liveLabel?: string;
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
  backLabel = "← Back",
  liveLabel = "Live",
  tenantId = "",
  notificationsHref = "/dashboard/notification-hub",
  showNotifications = true,
  extraPill = null,
  showCreator = true,
  className = "",
}: Props) {
  return (
    <header className={`topbar ${className}`.trim()}>
      <div className="brand">
        <div className="logo" />
        <div>
          <h1>{title}</h1>
          {subtitle ? (
            <div className="mini" style={{ opacity: 0.82, marginTop: 4 }}>
              {subtitle}
            </div>
          ) : null}
          {details ? (
            <div className="mini" style={{ marginTop: 6 }}>
              {details}
            </div>
          ) : null}
        </div>
      </div>

      <div className="pills">
        <Link className="pill" href={backHref} style={{ textDecoration: "none" }}>
          {backLabel}
        </Link>

        <div className="pill">
          <span className="dot" />
          <span>{liveLabel}</span>
        </div>

        {showNotifications ? (
          <DashboardNotificationsPill tenantId={tenantId} href={notificationsHref} />
        ) : null}

        {extraPill}

        {showCreator ? (
          <div className="pill">
            <span style={{ color: "var(--muted)" }}>Created by</span>
            <span style={{ opacity: 0.55 }}>•</span>
            <span>Axel Castro</span>
            <span style={{ opacity: 0.55 }}>•</span>
            <span>Devasks</span>
          </div>
        ) : null}
      </div>
    </header>
  );
}

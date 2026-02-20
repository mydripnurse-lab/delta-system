"use client";

import { Suspense, useMemo, useState } from "react";
import AgentNotificationHub from "@/components/AgentNotificationHub";
import DashboardTopbar from "@/components/DashboardTopbar";
import TenantOpenclawConfigCard from "@/components/TenantOpenclawConfigCard";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";

function NotificationHubPageInner() {
  const searchParams = useBrowserSearchParams();
  const { tenantId } = useResolvedTenantId(searchParams);
  const integrationKey = String(searchParams?.get("integrationKey") || "owner").trim() || "owner";
  const [hubTab, setHubTab] = useState<"inbox" | "setups">("inbox");
  const [hubCounts, setHubCounts] = useState<{ proposed: number; approved: number; rejected: number; executed: number; failed: number }>({
    proposed: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    failed: 0,
  });

  const backHref = useMemo(() => {
    if (!tenantId) return "/dashboard";
    const qs = new URLSearchParams();
    qs.set("tenantId", tenantId);
    qs.set("integrationKey", integrationKey);
    return `/dashboard?${qs.toString()}`;
  }, [tenantId, integrationKey]);

  return (
    <div className="shell callsDash ceoDash hubStandalone">
      <DashboardTopbar
        title="Notification Hub"
        subtitle="Approval queue + agent execution center for this tenant."
        backHref={backHref}
        backLabel="Back to Executive Dashboard"
        liveLabel="Hub Live"
        tenantId={tenantId}
        showNotifications={false}
        extraPill={
          <div className="pill">
            <span style={{ color: "var(--muted)" }}>Tenant</span>
            <span className="mono">{tenantId ? `${tenantId.slice(0, 8)}...` : "missing"}</span>
          </div>
        }
      />

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Agent Approvals</h2>
            <div className="cardSubtitle">
              Review proposals, approve/reject, and execute actions by dashboard agent.
            </div>
          </div>
          <div className="cardHeaderActions">
            <div className="badge">Proposed: {hubCounts.proposed}</div>
            <div className="badge">Approved: {hubCounts.approved}</div>
            <div className="badge">Executed: {hubCounts.executed}</div>
            <div className="badge">Failed: {hubCounts.failed}</div>
          </div>
        </div>

        <div className="cardBody" style={{ paddingBottom: 0 }}>
          <div className="segmented" role="tablist" aria-label="Notification hub tabs">
            <button
              className={`segBtn ${hubTab === "inbox" ? "segBtnOn" : ""}`}
              type="button"
              onClick={() => setHubTab("inbox")}
            >
              Notification Hub
              <span className="badge" style={{ marginLeft: 8 }}>{hubCounts.proposed}</span>
            </button>
            <button
              className={`segBtn ${hubTab === "setups" ? "segBtnOn" : ""}`}
              type="button"
              onClick={() => setHubTab("setups")}
            >
              Setups
            </button>
          </div>
        </div>
      </section>

      {hubTab === "inbox" ? (
        <AgentNotificationHub tenantId={tenantId} onCountsChange={setHubCounts} />
      ) : (
        <TenantOpenclawConfigCard tenantId={tenantId} />
      )}
    </div>
  );
}

export default function NotificationHubPage() {
  return (
    <Suspense fallback={<div className="shell"><div className="card"><div className="cardBody">Loading Notification Hub...</div></div></div>}>
      <NotificationHubPageInner />
    </Suspense>
  );
}

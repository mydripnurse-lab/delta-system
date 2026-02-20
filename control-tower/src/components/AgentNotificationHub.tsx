"use client";

import { useEffect, useMemo, useState } from "react";

type AgentProposal = {
  id: string;
  organization_id: string;
  action_type: "publish_content" | "send_leads_ghl" | "publish_ads" | "optimize_ads";
  status: "proposed" | "approved" | "rejected" | "executed" | "failed";
  agent_id: string;
  dashboard_id: string;
  priority: "P1" | "P2" | "P3";
  risk_level: "low" | "medium" | "high";
  expected_impact: "low" | "medium" | "high";
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
  execution_error?: string | null;
};

type Props = {
  tenantId: string;
  onCountsChange?: (counts: { proposed: number; approved: number; rejected: number; executed: number; failed: number }) => void;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function fmtTs(v: unknown) {
  const raw = s(v);
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function badgeTone(status: string) {
  if (status === "executed" || status === "approved") return "rgba(34,197,94,0.22)";
  if (status === "failed" || status === "rejected") return "rgba(239,68,68,0.22)";
  return "rgba(59,130,246,0.22)";
}

function humanizeToken(raw: string) {
  const v = s(raw).replace(/^soul_/, "").replace(/_/g, " ").trim();
  return v
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join(" ");
}

function dashboardLabel(raw: string) {
  const v = s(raw).toLowerCase();
  if (v === "facebook_ads") return "Facebook Ads";
  if (v === "gsc") return "GSC";
  if (v === "ga") return "GA";
  if (v === "prospecting") return "Prospecting";
  return humanizeToken(v);
}

function actionLabel(raw: string) {
  const v = s(raw).toLowerCase();
  if (v === "send_leads_ghl") return "Send Leads to GHL";
  if (v === "publish_ads") return "Publish Ads";
  if (v === "optimize_ads") return "Optimize Ads";
  if (v === "publish_content") return "Publish Content";
  return humanizeToken(v);
}

export default function AgentNotificationHub({ tenantId, onCountsChange }: Props) {
  const [items, setItems] = useState<AgentProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "proposed" | "approved" | "rejected" | "executed" | "failed">("all");

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({
        organizationId: tenantId,
        status: statusFilter,
        limit: "120",
      });
      const res = await fetch(`/api/agents/proposals?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; proposals?: AgentProposal[] }
        | null;
      if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
      setItems(Array.isArray(json.proposals) ? json.proposals : []);
    } catch (e: unknown) {
      setItems([]);
      setErr(e instanceof Error ? e.message : "Failed to load notification hub");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, statusFilter]);

  const counts = useMemo(() => {
    const out = { proposed: 0, approved: 0, rejected: 0, executed: 0, failed: 0 };
    for (const row of items) {
      if (row.status in out) out[row.status as keyof typeof out] += 1;
    }
    return out;
  }, [items]);

  useEffect(() => {
    onCountsChange?.(counts);
  }, [counts, onCountsChange]);

  async function decide(proposalId: string, decision: "approved" | "rejected") {
    setBusyId(proposalId);
    setErr("");
    try {
      const res = await fetch("/api/agents/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId,
          decision,
          actor: "user:dashboard",
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : `Failed to ${decision} proposal`);
    } finally {
      setBusyId("");
    }
  }

  async function editAndApprove(row: AgentProposal) {
    const nextRaw = window.prompt(
      "Edit payload JSON before approval",
      JSON.stringify(row.payload || {}, null, 2),
    );
    if (nextRaw === null) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = (JSON.parse(nextRaw) || {}) as Record<string, unknown>;
    } catch {
      setErr("Invalid JSON payload.");
      return;
    }
    setBusyId(row.id);
    setErr("");
    try {
      const res = await fetch("/api/agents/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: row.id,
          decision: "approved",
          actor: "user:dashboard",
          payload: parsed,
          note: "Edited and approved from Notification Hub.",
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to edit+approve proposal");
    } finally {
      setBusyId("");
    }
  }

  async function execute(proposalId: string) {
    setBusyId(proposalId);
    setErr("");
    try {
      const res = await fetch("/api/agents/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId,
          actor: "user:dashboard",
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to execute proposal");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="cardBody hubBody">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div className="badge">Proposed: {counts.proposed}</div>
        <div className="badge">Approved: {counts.approved}</div>
        <div className="badge">Executed: {counts.executed}</div>
        <div className="badge">Failed: {counts.failed}</div>
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ minWidth: 160, height: 34, paddingTop: 0, paddingBottom: 0 }}
        >
          <option value="all">All statuses</option>
          <option value="proposed">Proposed</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="executed">Executed</option>
          <option value="failed">Failed</option>
        </select>
        <button className="smallBtn" type="button" onClick={() => void load()} disabled={loading || !tenantId}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {err ? <div className="mini" style={{ color: "var(--danger)", marginBottom: 8 }}>X {err}</div> : null}

      <div className="tableWrap hubTableWrap">
        <table className="table hubTable">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Action</th>
              <th>Status</th>
              <th>Summary</th>
              <th>Created</th>
              <th style={{ width: 280 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr>
                <td colSpan={6} className="mini">No agent proposals yet.</td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="mini"><b>{humanizeToken(row.agent_id)}</b></div>
                    <div className="mini" style={{ opacity: 0.8 }}>{dashboardLabel(row.dashboard_id)} · {row.priority}</div>
                  </td>
                  <td>
                    <div className="mini">{actionLabel(row.action_type)}</div>
                    <div className="mini" style={{ opacity: 0.8 }}>{row.risk_level} risk · {row.expected_impact} impact</div>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: badgeTone(row.status),
                        borderColor: "rgba(148,163,184,.35)",
                        textTransform: "capitalize",
                      }}
                    >
                      {row.status}
                    </span>
                    {row.status === "failed" && row.execution_error ? (
                      <div className="mini" style={{ color: "var(--danger)", marginTop: 4 }}>{row.execution_error}</div>
                    ) : null}
                  </td>
                  <td>
                    <div className="mini">{row.summary}</div>
                  </td>
                  <td className="mini">{fmtTs(row.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {row.status === "proposed" ? (
                        <>
                          <button className="smallBtn btnPrimary" type="button" disabled={busyId === row.id} onClick={() => void decide(row.id, "approved")}>
                            Approve
                          </button>
                          <button className="smallBtn" type="button" disabled={busyId === row.id} onClick={() => void editAndApprove(row)}>
                            Edit + Approve
                          </button>
                          <button className="smallBtn" type="button" disabled={busyId === row.id} onClick={() => void decide(row.id, "rejected")}>
                            Reject
                          </button>
                        </>
                      ) : null}
                      {row.status === "approved" ? (
                        <button className="smallBtn btnPrimary" type="button" disabled={busyId === row.id} onClick={() => void execute(row.id)}>
                          Execute
                        </button>
                      ) : null}
                      <button
                        className="smallBtn"
                        type="button"
                        onClick={() => window.alert(JSON.stringify(row.payload || {}, null, 2))}
                      >
                        View Payload
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

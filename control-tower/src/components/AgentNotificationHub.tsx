"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

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

type ManifestAgentNode = {
  enabled?: boolean;
  agentId?: string;
  displayName?: string;
  name?: string;
  label?: string;
};

const AGENT_NAME_BY_ID: Record<string, string> = {
  soul_central_orchestrator: "Central Orchestrator",
  soul_calls: "Call Intelligence Agent",
  soul_leads_prospecting: "Leads Prospecting Agent",
  soul_conversations: "Conversation Recovery Agent",
  soul_transactions: "Revenue Intelligence Agent",
  soul_appointments: "Appointments Intelligence Agent",
  soul_gsc: "Search Console Agent",
  soul_ga: "Analytics Agent",
  soul_ads_optimizer: "Ads Optimizer Agent",
  soul_facebook_ads: "Facebook Ads Agent",
  soul_content_publisher: "Content Publisher Agent",
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

function firstText(obj: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = s(obj[k]);
    if (v) return v;
  }
  return "";
}

function resolveAgentDisplayName(
  row: AgentProposal,
  tenantAgentNameById: Record<string, string>,
) {
  const p = row.payload || {};
  const id = s(row.agent_id);
  const fromTenantConfig = s(tenantAgentNameById[id]);
  if (fromTenantConfig) return fromTenantConfig;
  const fromPayload = firstText(p, [
    "agentName",
    "agent_name",
    "recommendedBy",
    "recommended_by",
    "recommender",
    "agent",
  ]);
  if (fromPayload) return fromPayload;
  return AGENT_NAME_BY_ID[id] || humanizeToken(id);
}

function payloadSummary(payload: Record<string, unknown>) {
  const entries = Object.entries(payload || {}).filter(([, v]) => {
    const t = typeof v;
    return t === "string" || t === "number" || t === "boolean";
  });
  return entries.slice(0, 6).map(([k, v]) => `${k}: ${String(v)}`);
}

function renderHighlighted(text: string, query: string): ReactNode {
  const src = String(text || "");
  const q = s(query).toLowerCase();
  if (!q) return src;
  const lower = src.toLowerCase();
  const out: ReactNode[] = [];
  let cursor = 0;
  let hit = lower.indexOf(q, cursor);
  let key = 0;
  while (hit !== -1) {
    if (hit > cursor) out.push(src.slice(cursor, hit));
    out.push(
      <mark key={`mk_${key++}`} className="hubMark">
        {src.slice(hit, hit + q.length)}
      </mark>,
    );
    cursor = hit + q.length;
    hit = lower.indexOf(q, cursor);
  }
  if (cursor < src.length) out.push(src.slice(cursor));
  return out.length ? out : src;
}

function priorityRank(v: string) {
  const x = s(v).toUpperCase();
  if (x === "P1") return 3;
  if (x === "P2") return 2;
  if (x === "P3") return 1;
  return 0;
}

function riskRank(v: string) {
  const x = s(v).toLowerCase();
  if (x === "high") return 3;
  if (x === "medium") return 2;
  if (x === "low") return 1;
  return 0;
}

export default function AgentNotificationHub({ tenantId, onCountsChange }: Props) {
  const [items, setItems] = useState<AgentProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "proposed" | "approved" | "rejected" | "executed" | "failed">("all");
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "priority_desc" | "risk_desc">("date_desc");
  const [tenantAgentNameById, setTenantAgentNameById] = useState<Record<string, string>>({});

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

  useEffect(() => {
    async function loadAgentNames() {
      if (!tenantId) {
        setTenantAgentNameById({});
        return;
      }
      try {
        const qs = new URLSearchParams({ organizationId: tenantId });
        const res = await fetch(`/api/agents/manifest?${qs.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; agents?: Record<string, ManifestAgentNode>; error?: string }
          | null;
        if (!res.ok || !json?.ok || !json?.agents) return;
        const byId: Record<string, string> = {};
        for (const node of Object.values(json.agents || {})) {
          const id = s(node?.agentId);
          if (!id) continue;
          const name = s(node?.displayName) || s(node?.name) || s(node?.label);
          if (name) byId[id] = name;
        }
        setTenantAgentNameById(byId);
      } catch {
        // keep fallback names
      }
    }
    void loadAgentNames();
  }, [tenantId]);

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

  const filteredItems = useMemo(() => {
    const q = s(searchText).toLowerCase();
    if (!q) return items;
    return items.filter((row) => {
      const payloadText = JSON.stringify(row.payload || {}).toLowerCase();
      const hay = [
        row.id,
        row.summary,
        row.agent_id,
        row.dashboard_id,
        row.action_type,
        row.priority,
        row.risk_level,
        row.expected_impact,
        row.status,
        payloadText,
      ]
        .map((x) => s(x).toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [items, searchText]);

  const sortedItems = useMemo(() => {
    const out = [...filteredItems];
    out.sort((a, b) => {
      if (sortBy === "priority_desc") {
        const p = priorityRank(b.priority) - priorityRank(a.priority);
        if (p !== 0) return p;
      }
      if (sortBy === "risk_desc") {
        const r = riskRank(b.risk_level) - riskRank(a.risk_level);
        if (r !== 0) return r;
      }
      const ta = new Date(a.created_at).getTime() || 0;
      const tb = new Date(b.created_at).getTime() || 0;
      return tb - ta;
    });
    return out;
  }, [filteredItems, sortBy]);

  async function copyPayload(row: AgentProposal) {
    const text = JSON.stringify(row.payload || {}, null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === row.id ? "" : prev)), 1800);
    } catch {
      setErr("Failed to copy payload.");
    }
  }

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

  async function approveAndExecute(row: AgentProposal) {
    setBusyId(row.id);
    setErr("");
    try {
      const approveRes = await fetch("/api/agents/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: row.id,
          decision: "approved",
          actor: "user:dashboard",
          note: "Approved and executed from Notification Hub.",
        }),
      });
      const approveJson = (await approveRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!approveRes.ok || !approveJson?.ok) {
        throw new Error(s(approveJson?.error) || `Approve failed (HTTP ${approveRes.status})`);
      }

      const execRes = await fetch("/api/agents/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: row.id,
          actor: "user:dashboard",
        }),
      });
      const execJson = (await execRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!execRes.ok || !execJson?.ok) {
        throw new Error(s(execJson?.error) || `Execute failed (HTTP ${execRes.status})`);
      }
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to approve + execute");
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
      <div className="hubToolbar">
        <div className="badge">Proposed: {counts.proposed}</div>
        <div className="badge">Approved: {counts.approved}</div>
        <div className="badge">Executed: {counts.executed}</div>
        <div className="badge">Failed: {counts.failed}</div>
        <input
          className="input hubSearchInput"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by summary, payload, ID, agent..."
        />
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
        <select
          className="input"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={{ minWidth: 190, height: 34, paddingTop: 0, paddingBottom: 0 }}
        >
          <option value="date_desc">Sort: Newest first</option>
          <option value="priority_desc">Sort: Priority (P1-P3)</option>
          <option value="risk_desc">Sort: Risk (high-low)</option>
        </select>
        <button className="smallBtn" type="button" onClick={() => void load()} disabled={loading || !tenantId}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {err ? <div className="mini" style={{ color: "var(--danger)", marginBottom: 8 }}>X {err}</div> : null}

      {!sortedItems.length ? (
        <div className="tableWrap hubTableWrap">
          <div className="mini" style={{ padding: 12 }}>
            {items.length ? "No proposals match current filters." : "No agent proposals yet."}
          </div>
        </div>
      ) : (
        <div className="hubProposalList">
          {sortedItems.map((row) => {
            const payloadHead = payloadSummary(row.payload || {});
            const recommender = resolveAgentDisplayName(row, tenantAgentNameById);
            const reasonText = firstText(row.payload || {}, ["rationale", "reason", "why", "insight"]);
            const triggerText = firstText(row.payload || {}, ["trigger_metric", "triggerMetric", "signal", "alert"]);
            return (
              <article key={row.id} className="hubProposalCard">
                <div className="hubProposalTop">
                  <div className="hubProposalTitle">
                    <span>{dashboardLabel(row.dashboard_id)}</span>
                    <span className="mini" style={{ opacity: 0.82 }}>
                      {actionLabel(row.action_type)}
                    </span>
                    <span className="mini hubAgentReco">
                      Recommended by <b>{recommender}</b>
                      <span style={{ opacity: 0.68 }}> · {s(row.agent_id)}</span>
                    </span>
                  </div>
                  <div className="hubProposalBadges">
                    <span className="badge">{row.priority}</span>
                    <span className="badge">{row.risk_level} risk</span>
                    <span className="badge">{row.expected_impact} impact</span>
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
                  </div>
                </div>

                <div className="hubProposalMeta mini">
                  <span>Created: {fmtTs(row.created_at)}</span>
                  <span>Proposal: {row.id}</span>
                </div>

                <div className="hubProposalSummaryBlock">
                  <div className="hubBlockLabel">Recommendation</div>
                  <div className="hubProposalSummary">{renderHighlighted(row.summary, searchText)}</div>
                </div>

                {reasonText || triggerText ? (
                  <div className="hubInsightGrid">
                    {reasonText ? (
                      <div className="hubInsightCard">
                        <div className="hubBlockLabel">Why now</div>
                        <div className="mini">{renderHighlighted(reasonText, searchText)}</div>
                      </div>
                    ) : null}
                    {triggerText ? (
                      <div className="hubInsightCard">
                        <div className="hubBlockLabel">Trigger</div>
                        <div className="mini">{renderHighlighted(triggerText, searchText)}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {row.status === "failed" && row.execution_error ? (
                  <div className="mini" style={{ color: "var(--danger)", marginTop: 6 }}>{row.execution_error}</div>
                ) : null}

                {payloadHead.length ? (
                  <div className="hubProposalPayloadHead mini">
                    {payloadHead.map((line, idx) => (
                      <span key={`${row.id}_kv_${idx}`} className="hubKvChip">
                        {renderHighlighted(line, searchText)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <details className="hubPayloadDetails">
                  <summary>View full payload JSON</summary>
                  <pre>{renderHighlighted(JSON.stringify(row.payload || {}, null, 2), searchText)}</pre>
                </details>

                <div className="hubProposalActions">
                  <button
                    className={`smallBtn ${copiedId === row.id ? "btnPrimary" : ""}`}
                    type="button"
                    onClick={() => void copyPayload(row)}
                  >
                    {copiedId === row.id ? "Copied JSON" : "Copy Payload JSON"}
                  </button>
                  {row.status === "proposed" ? (
                    <>
                      <button className="smallBtn btnPrimary" type="button" disabled={busyId === row.id} onClick={() => void approveAndExecute(row)}>
                        Approve + Execute
                      </button>
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
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

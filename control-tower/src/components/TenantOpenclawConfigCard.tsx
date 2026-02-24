"use client";

import { useEffect, useMemo, useState } from "react";

type AgentNode = {
  enabled: boolean;
  agentId: string;
  displayName?: string;
};

type OpenclawConfigResponse = {
  ok?: boolean;
  status?: string;
  hasApiKey?: boolean;
  apiKeyMasked?: string;
  openclawBaseUrl?: string;
  openclawWorkspace?: string;
  autoProposals?: {
    enabled?: boolean;
    dedupeHours?: number;
    maxPerRun?: number;
  };
  autoExecution?: {
    enabled?: boolean;
    maxPerRun?: number;
  };
  autoApproval?: {
    enabled?: boolean;
    maxRisk?: "low" | "medium" | "high";
    maxPriority?: "P1" | "P2" | "P3";
  };
  agents?: Record<string, AgentNode>;
  apiKey?: string;
  error?: string;
};

type Props = {
  tenantId: string;
};

const DASHBOARD_ROWS = [
  { key: "central", label: "Central Orchestrator" },
  { key: "calls", label: "Calls" },
  { key: "leads", label: "Leads / Prospecting" },
  { key: "conversations", label: "Conversations" },
  { key: "transactions", label: "Transactions" },
  { key: "appointments", label: "Appointments" },
  { key: "gsc", label: "GSC" },
  { key: "ga", label: "GA" },
  { key: "ads", label: "Ads" },
  { key: "facebook_ads", label: "Facebook Ads" },
  { key: "youtube_ads", label: "YouTube Ads" },
  { key: "content", label: "Content" },
] as const;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function cloneAgents(input: Record<string, AgentNode>) {
  return JSON.parse(JSON.stringify(input)) as Record<string, AgentNode>;
}

export default function TenantOpenclawConfigCard({ tenantId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [openclawBaseUrl, setOpenclawBaseUrl] = useState("");
  const [openclawWorkspace, setOpenclawWorkspace] = useState("");
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoDedupeHours, setAutoDedupeHours] = useState("8");
  const [autoMaxPerRun, setAutoMaxPerRun] = useState("6");
  const [autoExecuteEnabled, setAutoExecuteEnabled] = useState(false);
  const [autoExecuteMaxPerRun, setAutoExecuteMaxPerRun] = useState("4");
  const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(false);
  const [autoApprovalMaxRisk, setAutoApprovalMaxRisk] = useState<"low" | "medium" | "high">("low");
  const [autoApprovalMaxPriority, setAutoApprovalMaxPriority] = useState<"P1" | "P2" | "P3">("P3");
  const [agents, setAgents] = useState<Record<string, AgentNode>>({});
  const [loadedAgents, setLoadedAgents] = useState<Record<string, AgentNode>>({});
  const [loadedOpenclawBaseUrl, setLoadedOpenclawBaseUrl] = useState("");
  const [loadedOpenclawWorkspace, setLoadedOpenclawWorkspace] = useState("");
  const [loadedAutoEnabled, setLoadedAutoEnabled] = useState(true);
  const [loadedAutoDedupeHours, setLoadedAutoDedupeHours] = useState("8");
  const [loadedAutoMaxPerRun, setLoadedAutoMaxPerRun] = useState("6");
  const [loadedAutoExecuteEnabled, setLoadedAutoExecuteEnabled] = useState(false);
  const [loadedAutoExecuteMaxPerRun, setLoadedAutoExecuteMaxPerRun] = useState("4");
  const [loadedAutoApprovalEnabled, setLoadedAutoApprovalEnabled] = useState(false);
  const [loadedAutoApprovalMaxRisk, setLoadedAutoApprovalMaxRisk] = useState<"low" | "medium" | "high">("low");
  const [loadedAutoApprovalMaxPriority, setLoadedAutoApprovalMaxPriority] = useState<"P1" | "P2" | "P3">("P3");
  const [routingSearch, setRoutingSearch] = useState("");

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(agents) !== JSON.stringify(loadedAgents) ||
      s(openclawBaseUrl) !== s(loadedOpenclawBaseUrl) ||
      s(openclawWorkspace) !== s(loadedOpenclawWorkspace) ||
      autoEnabled !== loadedAutoEnabled ||
      s(autoDedupeHours) !== s(loadedAutoDedupeHours) ||
      s(autoMaxPerRun) !== s(loadedAutoMaxPerRun) ||
      autoExecuteEnabled !== loadedAutoExecuteEnabled ||
      s(autoExecuteMaxPerRun) !== s(loadedAutoExecuteMaxPerRun) ||
      autoApprovalEnabled !== loadedAutoApprovalEnabled ||
      autoApprovalMaxRisk !== loadedAutoApprovalMaxRisk ||
      autoApprovalMaxPriority !== loadedAutoApprovalMaxPriority
    );
  }, [
    agents,
    loadedAgents,
    openclawBaseUrl,
    loadedOpenclawBaseUrl,
    openclawWorkspace,
    loadedOpenclawWorkspace,
    autoEnabled,
    loadedAutoEnabled,
    autoDedupeHours,
    loadedAutoDedupeHours,
    autoMaxPerRun,
    loadedAutoMaxPerRun,
    autoExecuteEnabled,
    loadedAutoExecuteEnabled,
    autoExecuteMaxPerRun,
    loadedAutoExecuteMaxPerRun,
    autoApprovalEnabled,
    loadedAutoApprovalEnabled,
    autoApprovalMaxRisk,
    loadedAutoApprovalMaxRisk,
    autoApprovalMaxPriority,
    loadedAutoApprovalMaxPriority,
  ]);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/integrations/openclaw`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as OpenclawConfigResponse | null;
      if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
      const nextAgents = (json.agents || {}) as Record<string, AgentNode>;
      setStatus(s(json.status) || "disconnected");
      setHasApiKey(Boolean(json.hasApiKey));
      setApiKeyMasked(s(json.apiKeyMasked));
      setOpenclawBaseUrl(s(json.openclawBaseUrl));
      setOpenclawWorkspace(s(json.openclawWorkspace));
      setLoadedOpenclawBaseUrl(s(json.openclawBaseUrl));
      setLoadedOpenclawWorkspace(s(json.openclawWorkspace));
      const nextAutoEnabled = json.autoProposals?.enabled !== false;
      const nextAutoDedupeHours = String(json.autoProposals?.dedupeHours ?? 8);
      const nextAutoMaxPerRun = String(json.autoProposals?.maxPerRun ?? 6);
      const nextAutoExecuteEnabled = json.autoExecution?.enabled === true;
      const nextAutoExecuteMaxPerRun = String(json.autoExecution?.maxPerRun ?? 4);
      const nextAutoApprovalEnabled = json.autoApproval?.enabled === true;
      const nextAutoApprovalMaxRisk = (json.autoApproval?.maxRisk || "low") as "low" | "medium" | "high";
      const nextAutoApprovalMaxPriority = (json.autoApproval?.maxPriority || "P3") as "P1" | "P2" | "P3";
      setAutoEnabled(nextAutoEnabled);
      setAutoDedupeHours(nextAutoDedupeHours);
      setAutoMaxPerRun(nextAutoMaxPerRun);
      setAutoExecuteEnabled(nextAutoExecuteEnabled);
      setAutoExecuteMaxPerRun(nextAutoExecuteMaxPerRun);
      setAutoApprovalEnabled(nextAutoApprovalEnabled);
      setAutoApprovalMaxRisk(nextAutoApprovalMaxRisk);
      setAutoApprovalMaxPriority(nextAutoApprovalMaxPriority);
      setLoadedAutoEnabled(nextAutoEnabled);
      setLoadedAutoDedupeHours(nextAutoDedupeHours);
      setLoadedAutoMaxPerRun(nextAutoMaxPerRun);
      setLoadedAutoExecuteEnabled(nextAutoExecuteEnabled);
      setLoadedAutoExecuteMaxPerRun(nextAutoExecuteMaxPerRun);
      setLoadedAutoApprovalEnabled(nextAutoApprovalEnabled);
      setLoadedAutoApprovalMaxRisk(nextAutoApprovalMaxRisk);
      setLoadedAutoApprovalMaxPriority(nextAutoApprovalMaxPriority);
      setAgents(cloneAgents(nextAgents));
      setLoadedAgents(cloneAgents(nextAgents));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load OpenClaw config.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function setAgentField(key: string, patch: Partial<AgentNode>) {
    setAgents((prev) => ({
      ...prev,
      [key]: {
        enabled: prev[key]?.enabled !== false,
        agentId: s(prev[key]?.agentId),
        displayName: s(prev[key]?.displayName),
        ...patch,
      },
    }));
  }

  const filteredRoutingRows = useMemo(() => {
    const q = s(routingSearch).toLowerCase();
    if (!q) return DASHBOARD_ROWS;
    return DASHBOARD_ROWS.filter((row) => {
      const node = agents[row.key] || { enabled: true, agentId: "", displayName: "" };
      const hay = [row.label, row.key, s(node.agentId), s(node.displayName)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [routingSearch, agents]);

  async function save(rotate = false) {
    if (!tenantId) return;
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/integrations/openclaw`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          rotate,
          openclawBaseUrl,
          openclawWorkspace,
          autoProposals: {
            enabled: autoEnabled,
            dedupeHours: Number(autoDedupeHours || 8),
            maxPerRun: Number(autoMaxPerRun || 6),
          },
          autoExecution: {
            enabled: autoExecuteEnabled,
            maxPerRun: Number(autoExecuteMaxPerRun || 4),
          },
          autoApproval: {
            enabled: autoApprovalEnabled,
            maxRisk: autoApprovalMaxRisk,
            maxPriority: autoApprovalMaxPriority,
          },
          agents,
        }),
      });
      const json = (await res.json().catch(() => null)) as OpenclawConfigResponse | null;
      if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
      const nextAgents = (json.agents || {}) as Record<string, AgentNode>;
      setStatus(s(json.status) || "connected");
      setHasApiKey(true);
      setApiKeyMasked(s(json.apiKeyMasked));
      setOpenclawBaseUrl(s(json.openclawBaseUrl));
      setOpenclawWorkspace(s(json.openclawWorkspace));
      setLoadedOpenclawBaseUrl(s(json.openclawBaseUrl));
      setLoadedOpenclawWorkspace(s(json.openclawWorkspace));
      const nextAutoEnabled = json.autoProposals?.enabled !== false;
      const nextAutoDedupeHours = String(json.autoProposals?.dedupeHours ?? 8);
      const nextAutoMaxPerRun = String(json.autoProposals?.maxPerRun ?? 6);
      const nextAutoExecuteEnabled = json.autoExecution?.enabled === true;
      const nextAutoExecuteMaxPerRun = String(json.autoExecution?.maxPerRun ?? 4);
      const nextAutoApprovalEnabled = json.autoApproval?.enabled === true;
      const nextAutoApprovalMaxRisk = (json.autoApproval?.maxRisk || "low") as "low" | "medium" | "high";
      const nextAutoApprovalMaxPriority = (json.autoApproval?.maxPriority || "P3") as "P1" | "P2" | "P3";
      setAutoEnabled(nextAutoEnabled);
      setAutoDedupeHours(nextAutoDedupeHours);
      setAutoMaxPerRun(nextAutoMaxPerRun);
      setAutoExecuteEnabled(nextAutoExecuteEnabled);
      setAutoExecuteMaxPerRun(nextAutoExecuteMaxPerRun);
      setAutoApprovalEnabled(nextAutoApprovalEnabled);
      setAutoApprovalMaxRisk(nextAutoApprovalMaxRisk);
      setAutoApprovalMaxPriority(nextAutoApprovalMaxPriority);
      setLoadedAutoEnabled(nextAutoEnabled);
      setLoadedAutoDedupeHours(nextAutoDedupeHours);
      setLoadedAutoMaxPerRun(nextAutoMaxPerRun);
      setLoadedAutoExecuteEnabled(nextAutoExecuteEnabled);
      setLoadedAutoExecuteMaxPerRun(nextAutoExecuteMaxPerRun);
      setLoadedAutoApprovalEnabled(nextAutoApprovalEnabled);
      setLoadedAutoApprovalMaxRisk(nextAutoApprovalMaxRisk);
      setLoadedAutoApprovalMaxPriority(nextAutoApprovalMaxPriority);
      setAgents(cloneAgents(nextAgents));
      setLoadedAgents(cloneAgents(nextAgents));
      if (rotate && s(json.apiKey)) {
        window.alert(`New tenant API key (save it in OpenClaw):\n\n${s(json.apiKey)}`);
      }
      setMsg(rotate ? "API key rotated and config saved." : "OpenClaw config saved.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save OpenClaw config.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cardBody hubSetupBody">
      <div className="hubSetupToolbar">
        <div className="badge">Status: {status || "disconnected"}</div>
        <div className="badge">API Key: {hasApiKey ? apiKeyMasked || "configured" : "not configured"}</div>
        {isDirty ? <div className="badge" style={{ borderColor: "rgba(59,130,246,.45)", color: "rgba(191,219,254,.95)" }}>Unsaved changes</div> : null}
        <button className="smallBtn" type="button" onClick={() => void load()} disabled={loading || saving || !tenantId}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <button className="smallBtn" type="button" onClick={() => void save(true)} disabled={saving || !tenantId}>
          {saving ? "Saving..." : "Rotate API Key"}
        </button>
        <button className="smallBtn btnPrimary" type="button" onClick={() => void save(false)} disabled={saving || !tenantId || !isDirty}>
          {saving ? "Saving..." : "Save Routing"}
        </button>
      </div>

      {err ? <div className="mini" style={{ color: "var(--danger)", marginBottom: 8 }}>X {err}</div> : null}
      {msg ? <div className="mini" style={{ color: "rgba(74,222,128,0.95)", marginBottom: 8 }}>✓ {msg}</div> : null}

      <div className="moduleGrid hubSetupGrid" style={{ marginBottom: 12 }}>
        <div className="moduleCard">
          <p className="l moduleTitle">OpenClaw Base URL</p>
          <input
            className="input"
            value={openclawBaseUrl}
            onChange={(e) => setOpenclawBaseUrl(e.target.value)}
            placeholder="https://your-openclaw.up.railway.app"
          />
        </div>
        <div className="moduleCard">
          <p className="l moduleTitle">OpenClaw Workspace</p>
          <input
            className="input"
            value={openclawWorkspace}
            onChange={(e) => setOpenclawWorkspace(e.target.value)}
            placeholder="tenant-xyz"
          />
        </div>
        <div className="moduleCard">
          <p className="l moduleTitle">Auto Proposals</p>
          <label className="mini" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
            />
            Enabled (semi-autonomous cron per tenant)
          </label>
          <div style={{ display: "grid", gap: 8, marginTop: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="mini" style={{ marginBottom: 4 }}>Dedupe Hours (1-72)</div>
              <input
                className="input"
                type="number"
                min={1}
                max={72}
                value={autoDedupeHours}
                onChange={(e) => setAutoDedupeHours(e.target.value)}
              />
            </div>
            <div>
              <div className="mini" style={{ marginBottom: 4 }}>Max proposals/run (1-12)</div>
              <input
                className="input"
                type="number"
                min={1}
                max={12}
                value={autoMaxPerRun}
                onChange={(e) => setAutoMaxPerRun(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="moduleCard">
          <p className="l moduleTitle">Auto Execution (Approved)</p>
          <label className="mini" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={autoExecuteEnabled}
              onChange={(e) => setAutoExecuteEnabled(e.target.checked)}
            />
            Enabled (execute approved proposals by cron)
          </label>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <div>
              <div className="mini" style={{ marginBottom: 4 }}>Max executes/run (1-20)</div>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={autoExecuteMaxPerRun}
                onChange={(e) => setAutoExecuteMaxPerRun(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="moduleCard">
          <p className="l moduleTitle">Auto Approval Policy</p>
          <label className="mini" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={autoApprovalEnabled}
              onChange={(e) => setAutoApprovalEnabled(e.target.checked)}
            />
            Enabled (approve safe proposals automatically)
          </label>
          <div style={{ display: "grid", gap: 8, marginTop: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="mini" style={{ marginBottom: 4 }}>Max risk auto-approved</div>
              <select
                className="input"
                value={autoApprovalMaxRisk}
                onChange={(e) => setAutoApprovalMaxRisk(e.target.value as "low" | "medium" | "high")}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div>
              <div className="mini" style={{ marginBottom: 4 }}>Priority scope auto-approved</div>
              <select
                className="input"
                value={autoApprovalMaxPriority}
                onChange={(e) => setAutoApprovalMaxPriority(e.target.value as "P1" | "P2" | "P3")}
              >
                <option value="P3">P3 only</option>
                <option value="P2">P2 + P3</option>
                <option value="P1">P1 + P2 + P3</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="hubSetupRouting">
        <div className="hubSetupRoutingTop">
          <div>
            <div className="cardTitle">Agent Routing Matrix</div>
            <div className="cardSubtitle">Define which agent recommends per dashboard and what name appears in Notification Hub.</div>
          </div>
          <input
            className="input hubSetupSearch"
            value={routingSearch}
            onChange={(e) => setRoutingSearch(e.target.value)}
            placeholder="Search dashboard, agent id, display name..."
          />
        </div>

        <div className="hubRoutingList">
          {filteredRoutingRows.map((row) => {
            const node = agents[row.key] || { enabled: true, agentId: "", displayName: "" };
            return (
              <div key={row.key} className="hubRoutingRow">
                <div className="hubRoutingInfo">
                  <div className="hubRoutingLabel">{row.label}</div>
                  <div className="mini" style={{ opacity: 0.8 }}>key: {row.key}</div>
                </div>
                <label className="hubRoutingToggle mini">
                  <input
                    type="checkbox"
                    checked={node.enabled !== false}
                    onChange={(e) => setAgentField(row.key, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <div className="hubRoutingField">
                  <div className="mini">Agent Display Name</div>
                  <input
                    className="input"
                    value={s(node.displayName)}
                    onChange={(e) => setAgentField(row.key, { displayName: e.target.value })}
                    placeholder="Appointments Intelligence Agent"
                  />
                </div>
                <div className="hubRoutingField">
                  <div className="mini">Agent ID (soul)</div>
                  <input
                    className="input"
                    value={s(node.agentId)}
                    onChange={(e) => setAgentField(row.key, { agentId: e.target.value })}
                    placeholder={`soul_${row.key}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

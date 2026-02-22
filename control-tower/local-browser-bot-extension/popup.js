function byId(id) {
  return document.getElementById(id);
}

const STORAGE_KEYS = {
  workspaceBase: "delta_workspace_base_url",
  selectedTenantId: "delta_selected_tenant_id",
  authToken: "delta_auth_bearer_token",
  authEmail: "delta_auth_email",
};
const DEFAULT_WORKSPACE_BASE = "https://www.telahagocrecer.com";
const FORCE_WORKSPACE_BASE = true;

const homeState = {
  user: null,
  tenants: [],
  notificationStatsByTenant: new Map(),
  notificationsUi: {
    status: "proposed",
    limit: 20,
    step: 20,
    lastCount: 0,
  },
};
let homePollingTimer = null;
let startupShownAt = Date.now();

function setStartupStatus(text) {
  const el = byId("startupStatus");
  if (!el) return;
  el.textContent = String(text || "Initializing...");
}

function showStartupOverlay(text = "Initializing...") {
  startupShownAt = Date.now();
  const overlay = byId("startupOverlay");
  setStartupStatus(text);
  if (overlay) overlay.hidden = false;
}

async function hideStartupOverlay(minMs = 780) {
  const elapsed = Date.now() - startupShownAt;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
  const overlay = byId("startupOverlay");
  if (overlay) overlay.hidden = true;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function setHomeStatus(text, tone = "idle") {
  const nodes = [...document.querySelectorAll("[data-home-status]")];
  if (!nodes.length) return;
  for (const el of nodes) {
    el.textContent = String(text || "");
    if (tone === "error") el.style.color = "var(--err)";
    else if (tone === "success") el.style.color = "var(--ok)";
    else el.style.color = "var(--muted)";
  }
}

function setNotifError(text = "", tone = "idle") {
  const nodes = [byId("notifError"), byId("notifModalStatus")].filter(Boolean);
  for (const el of nodes) {
    el.textContent = String(text || "");
    if (tone === "error") el.style.color = "var(--err)";
    else if (tone === "success") el.style.color = "var(--ok)";
    else el.style.color = "var(--muted)";
  }
}

function setHomeAuthState(isAuthed) {
  const authView = byId("homeAuthView");
  const mainView = byId("homeMainView");
  const profileChip = byId("profileChip");
  const profilePanel = byId("profilePanel");
  const tabBar = document.querySelector(".tabBar");
  if (authView) authView.hidden = !!isAuthed;
  if (mainView) mainView.hidden = !isAuthed;
  if (profileChip) profileChip.hidden = !isAuthed;
  if (tabBar) tabBar.hidden = !isAuthed;
  if (profilePanel) profilePanel.hidden = true;
  if (!isAuthed) setActiveTabView("home");
}

function applyProfile(user = {}) {
  const name = String(user?.fullName || "User");
  const email = String(user?.email || "-");
  const roles = Array.isArray(user?.globalRoles) ? user.globalRoles : [];
  const role = String(roles[0] || "member");
  const avatar = String(user?.avatarUrl || "").trim() || "icon48.png";

  const chipName = byId("profileChipName");
  const chipRole = byId("profileChipRole");
  const chipAvatar = byId("profileChipAvatar");
  const panelName = byId("profilePanelName");
  const panelEmail = byId("profilePanelEmail");
  if (chipName) chipName.textContent = name;
  if (chipRole) chipRole.textContent = role;
  if (chipAvatar) chipAvatar.src = avatar;
  if (panelName) panelName.textContent = name;
  if (panelEmail) panelEmail.textContent = email;
}

function toWorkspaceBase(urlLike) {
  try {
    const u = new URL(String(urlLike || ""));
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

function ensureWorkspaceBase(urlLike) {
  const base = toWorkspaceBase(urlLike);
  if (!/^https?:\/\//i.test(base)) return "";
  return base;
}

function getWorkspaceBase() {
  return FORCE_WORKSPACE_BASE ? DEFAULT_WORKSPACE_BASE : ensureWorkspaceBase(byId("workspaceBase")?.value || "");
}

function formatLastAt(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatNumber(v) {
  const num = Number(v || 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(num));
}

function formatMoney(v) {
  const num = Number(v || 0);
  if (!Number.isFinite(num)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}

function severityRank(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "high" || s === "critical") return 3;
  if (s === "medium") return 2;
  return 1;
}

function normalizeSeverity(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "critical" || s === "high" || s === "p1") return "high";
  if (s === "medium" || s === "p2") return "medium";
  return "low";
}

function syncExtensionBadgeCount(openCount, severity = "low") {
  try {
    chrome.runtime.sendMessage({
      type: "DELTA_SET_BADGE_COUNT",
      count: Math.max(0, Number(openCount || 0)),
      severity: normalizeSeverity(severity),
    });
  } catch {
    // Ignore extension runtime blips while reloading.
  }
}

async function storageGet(keys) {
  return await chrome.storage.local.get(keys);
}

async function storageSet(values) {
  return await chrome.storage.local.set(values);
}

async function storageRemove(keys) {
  return await chrome.storage.local.remove(keys);
}

function setPrimaryNavActive(key) {
  const homeView = byId("homeView");
  const botView = byId("botView");
  const tenantsView = byId("tenantsView");
  const notificationsView = byId("notificationsView");
  const homeBtn = byId("tabHomeBtn");
  const botBtn = byId("tabBotBtn");
  const tenantsBtn = byId("tabTenantsBtn");
  const notificationsBtn = byId("tabNotificationsBtn");
  const v = String(key || "home").toLowerCase();
  if (homeBtn) homeBtn.classList.toggle("active", v === "home");
  if (botBtn) botBtn.classList.toggle("active", v === "bot");
  if (tenantsBtn) tenantsBtn.classList.toggle("active", v === "tenants");
  if (notificationsBtn) notificationsBtn.classList.toggle("active", v === "notifications");
  return { homeView, botView, tenantsView, notificationsView };
}

function setActiveTabView(view) {
  const { homeView, botView, tenantsView, notificationsView } = setPrimaryNavActive(view);
  const v = String(view || "home").toLowerCase();
  if (homeView) homeView.hidden = v !== "home";
  if (botView) botView.hidden = v !== "bot";
  if (tenantsView) tenantsView.hidden = v !== "tenants";
  if (notificationsView) notificationsView.hidden = v !== "notifications";
}

async function runFetchInWorkspaceContext(baseUrl, path, request = {}) {
  const base = toWorkspaceBase(baseUrl);
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("Invalid workspace URL. Use https://...");
  }
  const baseHost = (() => {
    try {
      return new URL(base).host;
    } catch {
      return "";
    }
  })();

  const tab = await resolveSessionTab(base);
  if (tab?.id) {
    try {
      const tabHost = (() => {
        try {
          return new URL(String(tab.url || "")).host;
        } catch {
          return "";
        }
      })();
      if (tabHost && baseHost && tabHost === baseHost) {
        return await executeFetchInTab(tab.id, base, path, request);
      }
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const isAccessError =
        /Cannot access contents of url/i.test(msg) ||
        /Cannot access a chrome:\/\//i.test(msg) ||
        /The extensions gallery cannot be scripted/i.test(msg) ||
        /Failed to fetch/i.test(msg) ||
        /NetworkError/i.test(msg);
      if (!isAccessError) throw e;
    }
  }

  let tempTabId = null;
  try {
    const tmp = await chrome.tabs.create({ url: `${base}/dashboard`, active: false });
    tempTabId = tmp?.id ?? null;
    if (!tempTabId) throw new Error("Could not open temporary workspace tab.");
    await waitTabLoaded(tempTabId, 45000);
    return await executeFetchInTab(tempTabId, base, path, request);
  } finally {
    if (tempTabId) await chrome.tabs.remove(tempTabId).catch(() => null);
  }
}

async function runFetchWithBearer(baseUrl, path, token, opts = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  const headers = {
    "content-type": "application/json",
    ...(opts.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${String(token).trim()}`;
  const out = await runFetchInWorkspaceContext(baseUrl, path, {
    method,
    headers,
    body: opts.body ?? null,
    includeCredentials: opts.includeCredentials === true,
    timeoutMs: Math.max(3000, Number(opts.timeoutMs || 20000)),
  });
  return {
    ok: !!out?.ok,
    status: Number(out?.status || 0),
    json: out?.json || null,
    text: out?.text || "",
  };
}

async function executeFetchInTab(tabId, baseUrl, path, request = {}) {
  const timeoutMs = Math.max(3000, Number(request?.timeoutMs || 15000));
  const method = String(request?.method || "GET").toUpperCase();
  const headers = request?.headers && typeof request.headers === "object" ? request.headers : {};
  const body = request?.body ?? null;
  const includeCredentials = request?.includeCredentials !== false;
  let execRes = null;
  try {
    execRes = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (input) => {
        const base = String(input?.baseUrl || "").trim();
        const path = String(input?.path || "").trim();
        const timeoutMs = Math.max(3000, Number(input?.timeoutMs) || 15000);
        const method = String(input?.method || "GET").toUpperCase();
        const headers = input?.headers && typeof input.headers === "object" ? input.headers : {};
        const body = input?.body ?? null;
        const includeCredentials = Boolean(input?.includeCredentials);
        if (!base) return { ok: false, status: 0, error: "Missing baseUrl" };
        let url = "";
        try {
          url = new URL(path, base).toString();
        } catch {
          return { ok: false, status: 0, error: "Invalid URL" };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method,
            headers,
            body: body == null ? undefined : JSON.stringify(body),
            credentials: includeCredentials ? "include" : "omit",
            cache: "no-store",
            signal: controller.signal,
          });
          const text = await res.text();
          return { ok: res.ok, status: res.status, text };
        } catch (e) {
          return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
        } finally {
          clearTimeout(timer);
        }
      },
      args: [{ baseUrl, path, timeoutMs, method, headers, body, includeCredentials }],
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }

  const [{ result }] = execRes || [];
  if (!result) throw new Error("Empty response.");
  if (result.error) throw new Error(result.error);
  const json = safeParseJson(String(result.text || ""));
  return { ok: !!result.ok, status: Number(result.status || 0), json, text: String(result.text || "") };
}

function setSelectOptions(selectId, tenants, preferredId = "") {
  const sel = byId(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  const list = Array.isArray(tenants) ? tenants : [];
  if (!list.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No tenants";
    sel.appendChild(opt);
    return;
  }
  for (const t of list) {
    const opt = document.createElement("option");
    opt.value = String(t.id || "");
    opt.textContent = String(t.name || t.slug || t.id || "Tenant");
    sel.appendChild(opt);
  }
  const selected = list.find((x) => String(x.id) === String(preferredId)) || list[0];
  sel.value = String(selected?.id || "");
}

function syncTenantDropdowns(tenantId) {
  const id = String(tenantId || "");
  const a = byId("tenantModalSelect");
  const b = byId("notifModalTenantSelect");
  if (a && id) a.value = id;
  if (b && id) b.value = id;
}

function normalizeTenantHref(base, tenantId) {
  const b = toWorkspaceBase(base);
  const t = String(tenantId || "").trim();
  if (!b || !t) return "";
  return `${b}/projects/${encodeURIComponent(t)}`;
}

function getTenantById(tenantId) {
  const id = String(tenantId || "");
  return homeState.tenants.find((t) => String(t.id) === id) || null;
}

function getCurrentTenantId() {
  const id = String(byId("tenantModalSelect")?.value || byId("notifModalTenantSelect")?.value || "").trim();
  if (id) return id;
  return String(homeState.tenants?.[0]?.id || "");
}

function renderTenantKpis(tenantId) {
  const tenant = getTenantById(tenantId);
  byId("tenantName").textContent = tenant ? String(tenant.name || "Tenant") : "Tenant";
  byId("tenantSlug").textContent = tenant ? `@${String(tenant.slug || "-")}` : "@-";
  byId("tenantLogo").src = tenant?.logo_url ? String(tenant.logo_url) : "icon48.png";
  byId("tenantKpiStates").textContent = formatNumber(tenant?.active_states || 0);
  byId("tenantKpiSubaccounts").textContent = formatNumber(tenant?.total_subaccounts || 0);
  byId("tenantKpiCalls").textContent = formatNumber(tenant?.total_calls || 0);
  byId("tenantKpiImpressions").textContent = formatNumber(tenant?.total_impressions || 0);
  byId("tenantKpiRevenue").textContent = formatMoney(tenant?.total_revenue || 0);
  byId("tenantKpiLeads").textContent = formatNumber(tenant?.total_leads || 0);
}

function updateHomeTotals() {
  byId("homeTenantCount").textContent = String(homeState.tenants.length || 0);
  let totalOpen = 0;
  let totalAll = 0;
  let maxSev = "low";
  for (const stats of homeState.notificationStatsByTenant.values()) {
    totalOpen += n(stats?.open);
    totalAll += n(stats?.total);
    const sev = normalizeSeverity(stats?.maxSeverity || "low");
    if (severityRank(sev) > severityRank(maxSev)) maxSev = sev;
  }
  byId("homeNotifOpenTotal").textContent = formatNumber(totalOpen);
  byId("homeNotifTotalTotal").textContent = formatNumber(totalAll);
  syncExtensionBadgeCount(totalOpen, maxSev);
  const badge = byId("agencyNotifBadge");
  if (!badge) return;
  badge.classList.remove("sev-high", "sev-medium", "sev-low");
  if (totalOpen > 0) {
    badge.hidden = false;
    badge.textContent = totalOpen > 99 ? "99+" : String(totalOpen);
    badge.classList.add(maxSev === "high" ? "sev-high" : maxSev === "medium" ? "sev-medium" : "sev-low");
  } else {
    badge.hidden = true;
    badge.textContent = "";
  }
}

function priorityClass(priority) {
  const p = String(priority || "P2").toLowerCase();
  if (p === "p1" || p === "critical" || p === "high") return "critical";
  if (p === "p3" || p === "low") return "low";
  return "medium";
}

function statusClass(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "executed") return "executed";
  if (s === "failed") return "failed";
  return "proposed";
}

function statusLabel(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return "proposed";
  return s;
}

function formatNotifDate(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString();
}

function renderNotificationsList(notifications = [], tenantId = "") {
  const box = byId("notificationsList");
  if (!box) return;
  box.innerHTML = "";
  if (!Array.isArray(notifications) || !notifications.length) {
    const empty = document.createElement("p");
    empty.className = "mini";
    empty.textContent = "No notifications found for this tenant.";
    box.appendChild(empty);
    return;
  }

  for (const row of notifications) {
    const id = String(row?.id || "").trim();
    const status = String(row?.status || "").toLowerCase();
    const actionable = status === "proposed";
    const canExecute = status === "approved";
    const stClass = statusClass(status);
    const prClass = priorityClass(row?.priority);
    const title = String(row?.summary || row?.title || "Notification");
    const dashboardId = String(row?.dashboard_id || "-");
    const actionType = String(row?.action_type || "-");
    const createdAt = formatNotifDate(row?.created_at || row?.createdAt || row?.updated_at || row?.updatedAt);
    const detail = String(row?.details || row?.message || "").trim();
    const item = document.createElement("article");
    item.className = `notifItem status-${stClass}`;
    item.innerHTML = `
      <div class="notifRow">
        <p class="notifTitle">${title}</p>
        <span class="statusPill ${stClass}">${statusLabel(status)}</span>
      </div>
      <div class="notifMetaRow">
        <p class="notifMeta">${dashboardId} · ${actionType}<br>${createdAt}</p>
        <span class="priorityPill ${prClass}">${String(row?.priority || "medium")}</span>
      </div>
      <p class="notifSummary">${detail || `${dashboardId} · ${actionType}`}</p>
      <div class="notifActionsWrap">
        <div class="notifActions">
          <button class="notifBtn notifBtnPrimary" data-action="approve_execute" data-id="${id}" ${actionable ? "" : "disabled"}>${actionable ? "Approve + Execute" : "Closed"}</button>
          <button class="secondaryBtn notifBtn" data-action="approve" data-id="${id}" ${actionable ? "" : "disabled"}>${actionable ? "Approve" : "Closed"}</button>
          <button class="secondaryBtn notifBtn" data-action="execute" data-id="${id}" ${canExecute ? "" : "disabled"}>${canExecute ? "Execute" : "Locked"}</button>
          <button class="secondaryBtn notifBtn notifBtnDanger" data-action="reject" data-id="${id}" ${actionable ? "" : "disabled"}>${actionable ? "Reject" : "Closed"}</button>
        </div>
      </div>
    `;
    box.appendChild(item);
  }

  box.querySelectorAll("button[data-action][data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = String(btn.getAttribute("data-action") || "");
      const id = String(btn.getAttribute("data-id") || "").trim();
      if (!id || !tenantId) return;
      if (action === "approve_execute") await approveAndMaybeExecuteProposal(tenantId, id, true);
      else if (action === "approve") await approveAndMaybeExecuteProposal(tenantId, id, false);
      else if (action === "execute") await executeProposal(tenantId, id);
      else if (action === "reject") await decideProposal(tenantId, id, "rejected");
      await refreshNotificationsModal();
      await refreshAgencyNotificationTotals();
    });
  });
}

async function fetchTenantNotifications(tenantId, opts = {}) {
  const base = getWorkspaceBase();
  const token = String((await storageGet([STORAGE_KEYS.authToken]))?.[STORAGE_KEYS.authToken] || "").trim();
  if (!base || !tenantId || !token) throw new Error("Missing auth/session for notifications.");

  const q = new URLSearchParams({
    organizationId: String(tenantId),
    status: String(opts.status || "proposed"),
    limit: String(Math.max(1, Number(opts.limit || 20))),
  });

  const out = await runFetchWithBearer(base, `/api/agents/proposals?${q.toString()}`, token);
  const data = out.json || {};
  if (!out.ok || !data?.ok) {
    throw new Error(data?.error || `Notifications HTTP ${out.status}`);
  }
  const proposals = Array.isArray(data?.proposals) ? data.proposals : [];
  const stats = { proposed: 0, approved: 0, rejected: 0, executed: 0, failed: 0 };
  let maxSeverity = "low";
  for (const row of proposals) {
    const st = String(row?.status || "").toLowerCase();
    if (st in stats) stats[st] += 1;
    const sev = normalizeSeverity(row?.priority);
    if (severityRank(sev) > severityRank(maxSeverity)) maxSeverity = sev;
  }
  return {
    proposals,
    stats: {
      open: stats.proposed,
      total: proposals.length,
      approved: stats.approved,
      rejected: stats.rejected,
      executed: stats.executed,
      failed: stats.failed,
      lastGeneratedAt: proposals[0]?.created_at || "",
      maxSeverity,
    },
  };
}

async function decideProposal(tenantId, proposalId, decision) {
  const base = getWorkspaceBase();
  const token = String((await storageGet([STORAGE_KEYS.authToken]))?.[STORAGE_KEYS.authToken] || "").trim();
  if (!base || !token) throw new Error("Missing auth token.");
  setNotifError("Applying action...");

  const out = await runFetchWithBearer(base, `/api/agents/approval`, token, {
    method: "POST",
    body: {
      organizationId: tenantId,
      proposalId,
      decision,
      note: decision === "approved" ? "Approved from Delta extension." : "Rejected from Delta extension.",
      actor: `user:${String(homeState.user?.id || "extension")}`,
    },
  });
  const data = out.json || {};
  if (!out.ok || !data?.ok) {
    throw new Error(data?.error || `Notification action HTTP ${out.status}`);
  }
  setNotifError(decision === "approved" ? "Proposal approved." : "Proposal rejected.", "success");
}

async function executeProposal(tenantId, proposalId) {
  const base = getWorkspaceBase();
  const token = String((await storageGet([STORAGE_KEYS.authToken]))?.[STORAGE_KEYS.authToken] || "").trim();
  if (!base || !token) throw new Error("Missing auth token.");
  setNotifError("Executing proposal...");
  const out = await runFetchWithBearer(base, `/api/agents/execute`, token, {
    method: "POST",
    body: {
      organizationId: tenantId,
      proposalId,
      actor: `user:${String(homeState.user?.id || "extension")}`,
    },
  });
  const data = out.json || {};
  if (!out.ok || !data?.ok) {
    throw new Error(data?.error || `Execute HTTP ${out.status}`);
  }
  setNotifError("Proposal executed.", "success");
}

async function approveAndMaybeExecuteProposal(tenantId, proposalId, alsoExecute) {
  await decideProposal(tenantId, proposalId, "approved");
  if (alsoExecute) {
    await executeProposal(tenantId, proposalId);
  }
}

async function refreshNotificationsModal() {
  const tenantId = String(byId("notifModalTenantSelect")?.value || "").trim();
  const status = String(byId("notifModalStatusFilter")?.value || homeState.notificationsUi.status || "proposed")
    .trim()
    .toLowerCase();
  const limit = Math.max(1, Number(homeState.notificationsUi.limit || 20));
  byId("notifModalOpen").textContent = "0";
  byId("notifModalTotal").textContent = "0";
  byId("notifModalLast").textContent = "-";
  byId("notifPagerInfo").textContent = "Showing 0";
  byId("notifLoadMoreBtn").disabled = true;
  if (!tenantId) {
    setNotifError("Select a tenant first.", "error");
    renderNotificationsList([], "");
    return;
  }
  try {
    setNotifError("Loading notifications...");
    const data = await fetchTenantNotifications(tenantId, { status, limit });
    const stats = data?.stats || {};
    byId("notifModalOpen").textContent = formatNumber(stats.open || 0);
    byId("notifModalTotal").textContent = formatNumber(stats.total || 0);
    byId("notifModalLast").textContent = formatLastAt(stats.lastGeneratedAt);
    const notifications = Array.isArray(data?.proposals) ? data.proposals : [];
    homeState.notificationsUi.status = status;
    homeState.notificationsUi.lastCount = notifications.length;
    renderNotificationsList(notifications, tenantId);
    byId("notifPagerInfo").textContent = `Showing ${notifications.length}`;
    byId("notifLoadMoreBtn").disabled = notifications.length < limit;
    homeState.notificationStatsByTenant.set(tenantId, {
      open: n(stats.open),
      total: n(stats.total),
      lastGeneratedAt: String(stats.lastGeneratedAt || ""),
    });
    updateHomeTotals();
    setNotifError("Notifications synced.", "success");
  } catch (e) {
    renderNotificationsList([], "");
    setNotifError(`Notifications error: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

async function refreshAgencyNotificationTotals() {
  if (!homeState.tenants.length) {
    homeState.notificationStatsByTenant.clear();
    updateHomeTotals();
    return;
  }
  const results = await Promise.all(
    homeState.tenants.map(async (t) => {
      try {
        const [allData, openData] = await Promise.all([
          fetchTenantNotifications(String(t.id), { status: "all", limit: 120 }),
          fetchTenantNotifications(String(t.id), { status: "proposed", limit: 120 }),
        ]);
        return {
          tenantId: String(t.id),
          stats: {
            open: n(openData?.stats?.total),
            total: n(allData?.stats?.total),
            lastGeneratedAt: String(allData?.stats?.lastGeneratedAt || openData?.stats?.lastGeneratedAt || ""),
            maxSeverity: normalizeSeverity(openData?.stats?.maxSeverity || "low"),
          },
        };
      } catch {
        return {
          tenantId: String(t.id),
          stats: {
            open: 0,
            total: 0,
            lastGeneratedAt: "",
            maxSeverity: "low",
          },
        };
      }
    }),
  );

  homeState.notificationStatsByTenant.clear();
  for (const row of results) {
    homeState.notificationStatsByTenant.set(row.tenantId, row.stats);
  }
  updateHomeTotals();
}

function startHomePolling() {
  if (homePollingTimer) clearInterval(homePollingTimer);
  homePollingTimer = setInterval(async () => {
    if (!homeState.user || !homeState.tenants.length) return;
    try {
      await refreshAgencyNotificationTotals();
      const activeNotifs = byId("notificationsView")?.hidden === false;
      if (activeNotifs) {
        await refreshNotificationsModal();
      }
    } catch {
      // Keep polling quiet; status shown in manual refresh paths.
    }
  }, 45000);
}

async function openTenantLink(tenantId) {
  const href = normalizeTenantHref(getWorkspaceBase(), tenantId);
  if (!href) {
    setHomeStatus("Select tenant first.", "error");
    return;
  }
  await chrome.tabs.create({ url: href, active: true });
}

async function refreshHome() {
  const base = getWorkspaceBase();
  setHomeAuthState(false);
  const saved = await storageGet([STORAGE_KEYS.authToken]);
  const token = String(saved?.[STORAGE_KEYS.authToken] || "").trim();

  if (!base) {
    setHomeStatus("Workspace URL is missing.", "error");
    setHomeAuthState(false);
    return;
  }

  try {
    setHomeStatus("Loading user session...");
    if (!token) {
      setHomeStatus("Ready. Sign in to load your data.");
      return;
    }

    const meOut = await runFetchWithBearer(base, "/api/auth/me", token);
    const meData = meOut.json || {};
    if (!meOut.ok || !meData?.ok) {
      throw new Error(meData?.error || `Auth HTTP ${meOut.status}`);
    }

    const tenantsOut = await runFetchWithBearer(base, "/api/tenants", token);
    const tenantsData = tenantsOut.json || {};
    let tenants = [];
    if (tenantsOut.ok && tenantsData?.ok && Array.isArray(tenantsData?.rows)) {
      tenants = tenantsData.rows;
    } else if (Array.isArray(meData?.tenants)) {
      tenants = meData.tenants;
    }

    homeState.user = meData?.user || null;
    homeState.tenants = tenants;

    applyProfile(homeState.user || {});
    setHomeAuthState(true);

    const prev = String((await storageGet([STORAGE_KEYS.selectedTenantId]))?.[STORAGE_KEYS.selectedTenantId] || "");
    setSelectOptions("tenantModalSelect", homeState.tenants, prev);
    setSelectOptions("notifModalTenantSelect", homeState.tenants, prev);
    const picked = getCurrentTenantId();
    syncTenantDropdowns(picked);
    if (picked) await storageSet({ [STORAGE_KEYS.selectedTenantId]: picked });
    renderTenantKpis(picked);

    setHomeStatus(`Connected. ${homeState.tenants.length} tenant(s) available.`, "success");
    await storageSet({ [STORAGE_KEYS.workspaceBase]: base });

    await refreshNotificationsModal();
    await refreshAgencyNotificationTotals();
  } catch (e) {
    homeState.user = null;
    homeState.tenants = [];
    homeState.notificationStatsByTenant.clear();
    setSelectOptions("tenantModalSelect", [], "");
    setSelectOptions("notifModalTenantSelect", [], "");
    renderTenantKpis("");
    renderNotificationsList([], "");
    setHomeAuthState(false);
    updateHomeTotals();
    setHomeStatus(`Not authenticated: ${e instanceof Error ? e.message : String(e)}`, "error");
    setNotifError("No notifications (auth required).");
  }
}

async function signInHome() {
  const base = getWorkspaceBase();
  const email = String(byId("homeEmail")?.value || "").trim().toLowerCase();
  const password = String(byId("homePassword")?.value || "").trim();
  const rememberMe = Boolean(byId("homeRememberMe")?.checked);
  setHomeAuthState(false);
  if (!base) {
    setHomeStatus("Workspace URL is missing.", "error");
    return;
  }
  if (!email || !password) {
    setHomeStatus("Email and password are required.", "error");
    return;
  }
  try {
    setHomeStatus("Signing in...");
    let out = await runFetchWithBearer(base, "/api/auth/token", "", {
      method: "POST",
      body: { email, password, rememberMe },
    });
    let data = out.json || {};

    if (!out.ok && [404, 405].includes(Number(out.status || 0))) {
      out = await runFetchWithBearer(base, "/api/auth/login", "", {
        method: "POST",
        body: { email, password, rememberMe },
      });
      data = out.json || {};
      if (!out.ok || !data?.ok) {
        throw new Error(data?.error || `Login HTTP ${out.status}`);
      }
      await storageRemove([STORAGE_KEYS.authToken]);
      await storageSet({
        [STORAGE_KEYS.authEmail]: email,
        [STORAGE_KEYS.workspaceBase]: base,
      });
      byId("homePassword").value = "";
      setHomeStatus("Authenticated via session login.", "success");
      await refreshHome();
      return;
    }

    if (!out.ok || !data?.ok || !data?.token) {
      throw new Error(data?.error || `Login HTTP ${out.status}`);
    }

    await storageSet({
      [STORAGE_KEYS.authToken]: String(data.token),
      [STORAGE_KEYS.authEmail]: email,
      [STORAGE_KEYS.workspaceBase]: base,
    });
    byId("homePassword").value = "";
    setHomeStatus("Authenticated with extension token.", "success");
    await refreshHome();
  } catch (e) {
    setHomeStatus(`Not authenticated: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

async function signOutHome() {
  await storageRemove([STORAGE_KEYS.authToken, STORAGE_KEYS.authEmail, STORAGE_KEYS.selectedTenantId]);
  homeState.user = null;
  homeState.tenants = [];
  homeState.notificationStatsByTenant.clear();
  setSelectOptions("tenantModalSelect", [], "");
  setSelectOptions("notifModalTenantSelect", [], "");
  renderTenantKpis("");
  renderNotificationsList([], "");
  setHomeAuthState(false);
  applyProfile({});
  updateHomeTotals();
  setNotifError("Signed out.");
  setHomeStatus("Signed out from extension token.", "success");
}

function setStatus(text, mode = "idle") {
  byId("status").textContent = String(text || "");
  const modeLabel = byId("statusMode");
  const dot = byId("statusDot");
  if (!modeLabel || !dot) return;

  const normalized = String(mode || "idle").toLowerCase();
  dot.classList.remove("running", "success", "error");

  if (normalized === "running") {
    modeLabel.textContent = "Running";
    dot.classList.add("running");
    return;
  }

  if (normalized === "success") {
    modeLabel.textContent = "Done";
    dot.classList.add("success");
    return;
  }

  if (normalized === "error") {
    modeLabel.textContent = "Error";
    dot.classList.add("error");
    return;
  }

  modeLabel.textContent = "Idle";
}

async function initializeHome() {
  setStartupStatus("Loading workspace...");
  const stored = await storageGet([
    STORAGE_KEYS.workspaceBase,
    STORAGE_KEYS.selectedTenantId,
    STORAGE_KEYS.authEmail,
    STORAGE_KEYS.authToken,
  ]);
  const base = FORCE_WORKSPACE_BASE
    ? DEFAULT_WORKSPACE_BASE
    : ensureWorkspaceBase(stored?.[STORAGE_KEYS.workspaceBase] || "") || DEFAULT_WORKSPACE_BASE;

  if (base) {
    setStartupStatus("Preparing secure session...");
    byId("workspaceBase").value = base;
    await storageSet({ [STORAGE_KEYS.workspaceBase]: base });
  }

  const savedEmail = String(stored?.[STORAGE_KEYS.authEmail] || "").trim();
  if (savedEmail) byId("homeEmail").value = savedEmail;

  setActiveTabView("home");

  byId("tabHomeBtn")?.addEventListener("click", () => setActiveTabView("home"));
  byId("tabBotBtn")?.addEventListener("click", () => setActiveTabView("bot"));
  byId("tabTenantsBtn")?.addEventListener("click", () => {
    setActiveTabView("tenants");
    const tid = getCurrentTenantId();
    syncTenantDropdowns(tid);
    renderTenantKpis(tid);
  });
  byId("tabNotificationsBtn")?.addEventListener("click", async () => {
    setActiveTabView("notifications");
    const tid = getCurrentTenantId();
    syncTenantDropdowns(tid);
    if (byId("notifModalStatusFilter")) byId("notifModalStatusFilter").value = homeState.notificationsUi.status || "proposed";
    homeState.notificationsUi.limit = homeState.notificationsUi.step;
    await refreshNotificationsModal();
  });

  byId("refreshHomeBtn")?.addEventListener("click", async () => {
    await refreshHome();
  });

  byId("homeSignInBtn")?.addEventListener("click", async () => {
    await signInHome();
  });

  byId("profileSignOutBtn")?.addEventListener("click", async () => {
    await signOutHome();
  });

  byId("profileOpenBtn")?.addEventListener("click", async () => {
    await chrome.tabs.create({ url: `${getWorkspaceBase()}/`, active: true });
  });

  byId("openTenantFromSelectedBtn")?.addEventListener("click", async () => {
    await openTenantLink(getCurrentTenantId());
  });

  byId("tenantModalSelect")?.addEventListener("change", async (e) => {
    const tenantId = String(e?.target?.value || "").trim();
    syncTenantDropdowns(tenantId);
    renderTenantKpis(tenantId);
    await storageSet({ [STORAGE_KEYS.selectedTenantId]: tenantId });
  });

  byId("notifModalTenantSelect")?.addEventListener("change", async (e) => {
    const tenantId = String(e?.target?.value || "").trim();
    syncTenantDropdowns(tenantId);
    renderTenantKpis(tenantId);
    await storageSet({ [STORAGE_KEYS.selectedTenantId]: tenantId });
    homeState.notificationsUi.limit = homeState.notificationsUi.step;
    await refreshNotificationsModal();
  });

  byId("notifApplyFilterBtn")?.addEventListener("click", async () => {
    homeState.notificationsUi.status = String(byId("notifModalStatusFilter")?.value || "proposed").toLowerCase();
    homeState.notificationsUi.limit = homeState.notificationsUi.step;
    await refreshNotificationsModal();
  });

  byId("refreshNotifModalBtn")?.addEventListener("click", async () => {
    homeState.notificationsUi.limit = homeState.notificationsUi.step;
    await refreshNotificationsModal();
    await refreshAgencyNotificationTotals();
  });

  byId("openTenantFromNotifBtn")?.addEventListener("click", async () => {
    await openTenantLink(String(byId("notifModalTenantSelect")?.value || ""));
  });

  byId("notifLoadMoreBtn")?.addEventListener("click", async () => {
    homeState.notificationsUi.limit = Math.max(1, Number(homeState.notificationsUi.limit || 20)) + Math.max(1, Number(homeState.notificationsUi.step || 20));
    await refreshNotificationsModal();
  });

  byId("openTenantCardBtn")?.addEventListener("click", async () => {
    await openTenantLink(String(byId("tenantModalSelect")?.value || ""));
  });

  byId("tenantHeroCard")?.addEventListener("click", async () => {
    await openTenantLink(String(byId("tenantModalSelect")?.value || ""));
  });

  byId("tenantHeroCard")?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      await openTenantLink(String(byId("tenantModalSelect")?.value || ""));
    }
  });

  byId("profileChip")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = byId("profilePanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
  });

  document.addEventListener("click", () => {
    const panel = byId("profilePanel");
    if (panel) panel.hidden = true;
  });
  byId("profilePanel")?.addEventListener("click", (e) => e.stopPropagation());

  const hasToken = !!String(stored?.[STORAGE_KEYS.authToken] || "").trim();
  startHomePolling();
  if (hasToken) {
    setStartupStatus("Restoring authenticated context...");
    await refreshHome();
  } else {
    setStartupStatus("Ready to sign in.");
    setHomeAuthState(false);
    setHomeStatus("Ready. Sign in to load your data.");
  }
}

function collectPayload() {
  return {
    activationUrl: byId("activationUrl").value.trim(),
    domainToPaste: byId("domainToPaste").value.trim(),
    executionProfile: String(byId("executionProfile")?.value || "safe").trim().toLowerCase(),
    faviconUrl: byId("faviconUrl").value.trim(),
    pageTypeNeedle: byId("pageTypeNeedle").value.trim() || "Home Page",
    robotsTxt: byId("robotsTxt").value,
    headCode: byId("headCode").value,
    bodyCode: byId("bodyCode").value,
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function isScriptableHttpTab(tab) {
  const url = String(tab?.url || "");
  return /^https?:\/\//i.test(url);
}

async function resolveSessionTab(baseUrl = "") {
  const active = await getActiveTab();
  if (isScriptableHttpTab(active)) return active;

  const tabs = await chrome.tabs.query({});
  const httpTabs = tabs.filter(isScriptableHttpTab);
  if (!httpTabs.length) return null;

  let baseHost = "";
  try {
    baseHost = new URL(String(baseUrl || "")).host;
  } catch {
    baseHost = "";
  }

  if (baseHost) {
    const sameHost = httpTabs.find((t) => {
      try {
        return new URL(String(t.url || "")).host === baseHost;
      } catch {
        return false;
      }
    });
    if (sameHost) return sameHost;
  }

  return httpTabs[0];
}

function waitTabLoaded(tabId, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const timer = setInterval(async () => {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) return;
      if (tab.status === "complete") {
        clearInterval(timer);
        resolve(tab);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Tab load timeout"));
      }
    }, 300);
  });
}

async function runInTab(tabId, payload) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (input) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

      function ensureOverlay() {
        let box = document.getElementById("__delta_local_bot_log");
        if (!box) {
          box = document.createElement("div");
          box.id = "__delta_local_bot_log";
          box.style.position = "fixed";
          box.style.right = "12px";
          box.style.bottom = "12px";
          box.style.width = "420px";
          box.style.maxHeight = "45vh";
          box.style.overflow = "auto";
          box.style.zIndex = "2147483647";
          box.style.background = "rgba(2,6,23,.95)";
          box.style.color = "#e2e8f0";
          box.style.font = "12px/1.35 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace";
          box.style.padding = "10px";
          box.style.border = "1px solid rgba(148,163,184,.4)";
          box.style.borderRadius = "10px";
          box.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
          document.body.appendChild(box);
        }
        return box;
      }

      function log(msg) {
        const box = ensureOverlay();
        const line = document.createElement("div");
        line.textContent = `[${new Date().toLocaleTimeString()}] ${String(msg)}`;
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
        // also keep console trace
        console.log("[DeltaLocalBot]", msg);
      }

      function visible(el) {
        if (!el) return false;
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity || "1") === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }

      async function waitFor(fn, timeoutMs, intervalMs, label) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const v = fn();
          if (v) return v;
          await sleep(intervalMs);
        }
        throw new Error(`Timeout: ${label}`);
      }

      async function clickSel(selectors, label) {
        const arr = Array.isArray(selectors) ? selectors : [selectors];
        const el = await waitFor(() => {
          for (const sel of arr) {
            const x = document.querySelector(sel);
            if (visible(x)) return x;
          }
          return null;
        }, 90000, 250, label || arr.join(" | "));
        el.click();
        log(`click -> ${label || arr[0]}`);
        await sleep(280);
        return el;
      }

      async function fillSel(selectors, value, label) {
        const arr = Array.isArray(selectors) ? selectors : [selectors];
        const el = await waitFor(() => {
          for (const sel of arr) {
            const x = document.querySelector(sel);
            if (visible(x)) return x;
          }
          return null;
        }, 90000, 250, label || arr.join(" | "));
        el.focus();
        el.value = String(value || "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.blur();
        log(`fill -> ${label || arr[0]}`);
        await sleep(280);
      }

      function findLabelFormItem(labelNeedle) {
        const labels = [...document.querySelectorAll(".n-form-item-label, .n-form-item-label__text")];
        const labelEl = labels.find((el) => norm(el.textContent).includes(norm(labelNeedle)));
        if (!labelEl) throw new Error(`Label not found: ${labelNeedle}`);
        return labelEl.closest(".n-form-item") || labelEl.parentElement?.parentElement?.parentElement;
      }

      function getVisibleMenu() {
        return [...document.querySelectorAll(".n-base-select-menu")].find((el) => el.offsetParent !== null) || null;
      }

      async function pickFromVirtualMenu(optionNeedle) {
        const menu = await waitFor(() => getVisibleMenu(), 40000, 220, "visible dropdown menu");
        const scroller = menu.querySelector(".v-vl, .v-vl-container, .n-base-select-menu__content") || menu;
        const seen = new Map();

        for (let i = 0; i < 180; i += 1) {
          const options = [...menu.querySelectorAll(".n-base-select-option,[role='option']")];
          for (const el of options) {
            const text = (el.textContent || "").replace(/\s+/g, " ").trim();
            const title = (el.getAttribute("title") || "").trim();
            const key = `${title}||${text}`;
            if (text || title) seen.set(key, el);
          }

          const hit = [...seen.entries()].find(([k]) => norm(k).includes(norm(optionNeedle)));
          if (hit) {
            hit[1].click();
            log(`pick option -> ${optionNeedle}`);
            await sleep(280);
            return;
          }

          const prev = scroller.scrollTop;
          scroller.scrollTop = prev + Math.max(140, scroller.clientHeight * 0.9);
          await sleep(120);
          if (scroller.scrollTop === prev) break;
        }

        throw new Error(`Option not found in virtual menu: ${optionNeedle}`);
      }

      async function openAndPick(labelNeedle, optionNeedle) {
        const formItem = findLabelFormItem(labelNeedle);
        const trigger = formItem?.querySelector(".n-base-selection-label,[class*='selection-label'],[tabindex='0']");
        if (!trigger) throw new Error(`Dropdown trigger not found for ${labelNeedle}`);
        trigger.click();
        log(`open dropdown -> ${labelNeedle}`);
        await sleep(240);
        await pickFromVirtualMenu(optionNeedle);
      }

      async function ensurePageReady() {
        await waitFor(() => String(location.href || "").includes("/settings/domain"), 120000, 300, "url /settings/domain");
        await sleep(2500);
      }

      try {
        log("Run started");
        await ensurePageReady();

        const connect = document.querySelector("#connect-domain-button, #connect-domain-button-text, [data-testid='connect-domain-button'], [id*='connect-domain'], button[id*='connect-domain']");
        const manage = document.querySelector("#manage-domain, [data-testid='manage-domain'], [id*='manage-domain'], button[id*='manage-domain']");
        const doConnect = visible(connect) || !visible(manage);

        if (doConnect) {
          if (visible(connect)) connect.click();
          log("connect flow");
          await sleep(350);
          await clickSel(["#connect-button-SITES", "[id*='connect-button-SITES']"], "connect-button-SITES");
          await fillSel([".n-input__input-el", "input[type='text']", "input[type='url']"], input.domainToPaste, "domain field");
          await clickSel(["#add-records", "[id*='add-records']"], "add-records");
          await clickSel(["#submit-manually", "[id*='submit-manually']"], "submit-manually");
          await clickSel(["#addedRecord", "[id*='addedRecord']"], "addedRecord");
          document.querySelector('input[type="radio"][value="website"]')?.click();
          log("radio website");
          await sleep(300);

          await openAndPick("Link domain with website", "County");
          await sleep(280);
          try {
            await openAndPick("Select default step/page for Domain", input.pageTypeNeedle || "Home Page");
          } catch {
            await openAndPick("Select product type", input.pageTypeNeedle || "Home Page");
          }

          const submit = document.querySelector("#submit");
          if (visible(submit)) {
            submit.click();
            log("submit clicked");
          }
        } else {
          log("skip connect flow (manage already visible)");
        }

        await clickSel(["#manage-domain", "[data-testid='manage-domain']", "[id*='manage-domain']", "button[id*='manage-domain']"], "manage-domain");
        await clickSel("#domain-hub-connected-product-table-drop-action-dropdown-trigger", "product action dropdown");

        const xml = [...document.querySelectorAll('.n-dropdown-option-body__label')].find((el) => (el.textContent || '').trim() === 'XML Sitemap');
        if (xml) {
          xml.click();
          log("XML Sitemap selected");
        }

        const collapse = document.querySelector('.n-collapse-item__header-main');
        if (visible(collapse)) {
          collapse.click();
          log('collapse opened');
        }

        const rows = [...document.querySelectorAll('div.flex.my-2.funnel-page')];
        let checked = 0;
        rows
          .filter((row) => ((row.querySelector('div.ml-2')?.textContent || '').trim().includes('**')))
          .forEach((row) => {
            const cb = row.querySelector('div.n-checkbox[role="checkbox"]');
            const on = cb?.getAttribute('aria-checked') === 'true';
            if (cb && !on) {
              cb.click();
              checked += 1;
            }
          });
        log(`checkboxes selected: ${checked}`);

        for (let i = 0; i < 3; i += 1) {
          const ok = document.querySelector('#modal-footer-btn-positive-action');
          if (visible(ok)) {
            ok.click();
            log(`modal positive ${i + 1}/3`);
            await sleep(350);
          }
        }

        await clickSel('#domain-hub-connected-product-table-drop-action-dropdown-trigger', 'product action dropdown 2');
        const edit = [...document.querySelectorAll('.n-dropdown-option-body__label')].find((el) => (el.textContent || '').trim() === 'Edit');
        if (edit) {
          edit.click();
          log('Edit selected');
        }

        if (input.robotsTxt) {
          await fillSel('textarea.n-input__textarea-el', input.robotsTxt, 'robots textarea');
        }

        const saveModal = document.querySelector('#modal-footer-btn-positive-action');
        if (visible(saveModal)) {
          saveModal.click();
          log('modal save');
        }

        const back = document.querySelector('#backButtonv2');
        if (visible(back)) {
          back.click();
          log('back button');
        }
        await sleep(300);

        const sbSites = document.querySelector('#sb_sites');
        if (visible(sbSites)) {
          sbSites.click();
          await sleep(240);
          sbSites.click();
          log('sb_sites x2');
        }

        await clickSel('#table1-drop-action-dropdown-trigger', 'table1 dropdown');
        const county = [...document.querySelectorAll('span')].find((el) => (el.textContent || '').trim() === 'County');
        if (county) {
          county.click();
          log('County selected');
        }

        await clickSel('#table1-drop-action-dropdown-trigger', 'table1 dropdown 2');
        const firstAction = document.querySelector('.n-dropdown-option-body__label');
        if (firstAction) {
          firstAction.click();
          log('first dropdown action clicked');
        }

        const settingsBtn = [...document.querySelectorAll('.hl-text-sm-medium')].find((el) => (el.textContent || '').trim() === 'Settings');
        if (settingsBtn) {
          settingsBtn.click();
          log('Settings clicked');
        }

        if (input.faviconUrl) {
          await fillSel(['#faviconUrl input', '.faviconUrl input', '.faviconUrl .n-input__input-el'], input.faviconUrl, 'favicon');
        }

        if (input.headCode) {
          await fillSel('textarea.n-input__textarea-el', input.headCode, 'generic textarea head');
          await fillSel('#head-tracking-code textarea.n-input__textarea-el, #head-tracking-code .n-input__textarea-el', input.headCode, 'head tracking');
        }

        if (input.bodyCode) {
          await fillSel('#body-tracking-code textarea.n-input__textarea-el, #body-tracking-code .n-input__textarea-el', input.bodyCode, 'body tracking');
        }

        const finalSave = document.querySelector('.n-button.n-button--primary-type.n-button--medium-type.mt-3');
        if (visible(finalSave)) {
          finalSave.click();
          log('final save clicked');
        }

        log('DONE');
        return { ok: true };
      } catch (e) {
        log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          href: location.href,
        };
      }
    },
    args: [payload],
  });

  return result || { ok: false, error: "No result from executeScript" };
}

byId("openBtn").addEventListener("click", async () => {
  try {
    const payload = collectPayload();
    if (!payload.activationUrl) {
      setStatus("Enter Activation URL first.", "error");
      return;
    }
    await chrome.tabs.create({ url: payload.activationUrl });
    setStatus("Activation URL opened in new tab.", "success");
  } catch (e) {
    setStatus(`Open failed: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
});

byId("runBtn").addEventListener("click", async () => {
  try {
    const payload = collectPayload();
    setStatus("Preparing tab...", "running");
    let tab = await getActiveTab();
    if (!tab) throw new Error("No active tab.");

    if (payload.activationUrl && !String(tab.url || "").includes("/settings/domain")) {
      const newTab = await chrome.tabs.create({ url: payload.activationUrl, active: true });
      await waitTabLoaded(newTab.id);
      tab = newTab;
      await new Promise((r) => setTimeout(r, 1200));
    }

    setStatus("Running bot in tab... you can watch it live.", "running");
    const result = await runInTab(tab.id, payload);
    if (result?.ok) setStatus("Done ✅", "success");
    else setStatus(`Failed ❌\n${result?.error || "Unknown error"}`, "error");
  } catch (e) {
    setStatus(`Run failed: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
});

showStartupOverlay("Launching Delta System...");
initializeHome()
  .catch((e) => {
    setHomeStatus(`Init error: ${e instanceof Error ? e.message : String(e)}`, "error");
    setStartupStatus("Initialization issue detected.");
  })
  .finally(async () => {
    await hideStartupOverlay(900);
  });

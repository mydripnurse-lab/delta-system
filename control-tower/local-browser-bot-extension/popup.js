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

const homeState = {
  tenants: [],
};

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function setHomeStatus(text, tone = "idle") {
  const el = byId("workspaceStatus");
  if (!el) return;
  el.textContent = String(text || "");
  if (tone === "error") el.style.color = "var(--err)";
  else if (tone === "success") el.style.color = "var(--ok)";
  else el.style.color = "var(--muted)";
}

function setNotifError(text = "", tone = "idle") {
  const el = byId("notifError");
  if (!el) return;
  el.textContent = String(text || "");
  if (tone === "error") el.style.color = "var(--err)";
  else if (tone === "success") el.style.color = "var(--ok)";
  else el.style.color = "var(--muted)";
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

function formatLastAt(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString();
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

function setActiveTabView(view) {
  const homeView = byId("homeView");
  const botView = byId("botView");
  const homeBtn = byId("tabHomeBtn");
  const botBtn = byId("tabBotBtn");
  const v = String(view || "home").toLowerCase();
  const isHome = v === "home";
  if (homeView) homeView.hidden = !isHome;
  if (botView) botView.hidden = isHome;
  if (homeBtn) homeBtn.classList.toggle("active", isHome);
  if (botBtn) botBtn.classList.toggle("active", !isHome);
}

async function guessWorkspaceBaseFromActiveTab() {
  const tab = await getActiveTab();
  const url = String(tab?.url || "");
  const base = toWorkspaceBase(url);
  if (!base) return "";
  if (
    base.includes("devasks.com") ||
    base.includes("telahagocrecer.com") ||
    base.includes("localhost") ||
    base.includes("127.0.0.1")
  ) {
    return base;
  }
  return base;
}

async function runFetchInActiveTab(baseUrl, path, timeoutMs = 15000) {
  return runFetchInWorkspaceContext(baseUrl, path, {
    timeoutMs,
    method: "GET",
    includeCredentials: true,
  });
}

async function runFetchInWorkspaceContext(baseUrl, path, request = {}) {
  const base = toWorkspaceBase(baseUrl);
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("Invalid workspace URL. Use https://...");
  }

  const tab = await resolveSessionTab(base);
  if (tab?.id) {
    try {
      return await executeFetchInTab(tab.id, base, path, request);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const isAccessError =
        /Cannot access contents of url/i.test(msg) ||
        /Cannot access a chrome:\/\//i.test(msg) ||
        /The extensions gallery cannot be scripted/i.test(msg);
      if (!isAccessError) throw e;
    }
  }

  // Fallback robusto: abrir una tab temporal del workspace para garantizar contexto/cookies correctos.
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
  const headers = {
    "content-type": "application/json",
    ...(opts.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${String(token).trim()}`;
  return runFetchInWorkspaceContext(baseUrl, path, {
    timeoutMs: Math.max(3000, Number(opts.timeoutMs || 20000)),
    method: String(opts.method || "GET").toUpperCase(),
    headers,
    body: opts.body || null,
    includeCredentials: false,
  });
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
  return { ok: !!result.ok, status: Number(result.status || 0), json };
}

function setTenantOptions(tenants, preferredId = "") {
  const sel = byId("tenantSelect");
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
  const selected =
    list.find((x) => String(x.id) === String(preferredId)) ||
    list[0];
  sel.value = String(selected?.id || "");
}

async function refreshNotifications() {
  const base = toWorkspaceBase(byId("workspaceBase")?.value || "");
  const tenantId = String(byId("tenantSelect")?.value || "").trim();
  const token = String((await storageGet([STORAGE_KEYS.authToken]))?.[STORAGE_KEYS.authToken] || "").trim();
  byId("notifOpen").textContent = "0";
  byId("notifTotal").textContent = "0";
  byId("notifLast").textContent = "-";
  if (!base || !tenantId) {
    setNotifError("Select workspace and tenant first.", "error");
    return;
  }
  try {
    setNotifError("Loading notifications...");
    const q = new URLSearchParams({
      tenantId,
      integrationKey: "default",
      status: "open",
      limit: "20",
      autoGenerate: "0",
    });
    let out = token
      ? await runFetchWithBearer(base, `/api/dashboard/ads/notifications?${q.toString()}`, token)
      : await runFetchInActiveTab(base, `/api/dashboard/ads/notifications?${q.toString()}`, 20000);
    if (token && [401, 403, 405].includes(Number(out?.status || 0))) {
      out = await runFetchInActiveTab(base, `/api/dashboard/ads/notifications?${q.toString()}`, 20000);
    }
    const data = out.json || {};
    if (!out.ok || !data?.ok) {
      throw new Error(data?.error || `Notifications HTTP ${out.status}`);
    }
    const stats = data?.stats || {};
    byId("notifOpen").textContent = String(Number(stats.open || 0));
    byId("notifTotal").textContent = String(Number(stats.total || 0));
    byId("notifLast").textContent = formatLastAt(stats.lastGeneratedAt);
    setNotifError("Notifications synced.", "success");
  } catch (e) {
    setNotifError(`Notifications error: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

async function refreshHome() {
  const wsInput = byId("workspaceBase");
  const base = toWorkspaceBase(wsInput?.value || "");
  const saved = await storageGet([STORAGE_KEYS.authToken]);
  const token = String(saved?.[STORAGE_KEYS.authToken] || "").trim();
  if (!base) {
    setHomeStatus("Enter workspace base URL first.", "error");
    return;
  }
  try {
    setHomeStatus("Loading user session...");
    let out = token
      ? await runFetchWithBearer(base, "/api/auth/me", token)
      : await runFetchInActiveTab(base, "/api/auth/me", 18000);
    if (token && [401, 403, 405].includes(Number(out?.status || 0))) {
      out = await runFetchInActiveTab(base, "/api/auth/me", 18000);
    }
    const data = out.json || {};
    if (!out.ok || !data?.ok) {
      throw new Error(data?.error || `Auth HTTP ${out.status}`);
    }

    byId("meName").textContent = String(data?.user?.fullName || "User");
    byId("meEmail").textContent = String(data?.user?.email || "-");
    const roles = Array.isArray(data?.user?.globalRoles) ? data.user.globalRoles : [];
    byId("meRoles").textContent = `Roles: ${roles.length ? roles.join(", ") : "-"}`;

    homeState.tenants = Array.isArray(data?.tenants) ? data.tenants : [];
    const prev = (await storageGet([STORAGE_KEYS.selectedTenantId]))?.[STORAGE_KEYS.selectedTenantId] || "";
    setTenantOptions(homeState.tenants, String(prev || ""));
    const picked = String(byId("tenantSelect")?.value || "");
    if (picked) await storageSet({ [STORAGE_KEYS.selectedTenantId]: picked });

    setHomeStatus(`Connected. ${homeState.tenants.length} tenant(s) available.`, "success");
    await storageSet({ [STORAGE_KEYS.workspaceBase]: base });
    await refreshNotifications();
  } catch (e) {
    byId("meName").textContent = "-";
    byId("meEmail").textContent = "-";
    byId("meRoles").textContent = "Roles: -";
    setTenantOptions([], "");
    setHomeStatus(`Not authenticated: ${e instanceof Error ? e.message : String(e)}`, "error");
    setNotifError("No notifications (auth required).");
  }
}

async function signInHome() {
  const base = toWorkspaceBase(byId("workspaceBase")?.value || "");
  const email = String(byId("homeEmail")?.value || "").trim().toLowerCase();
  const password = String(byId("homePassword")?.value || "").trim();
  if (!base) {
    setHomeStatus("Enter workspace URL first.", "error");
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
      body: { email, password, rememberMe: true },
    });
    let data = out.json || {};

    if (!out.ok && [404, 405].includes(Number(out.status || 0))) {
      out = await runFetchInWorkspaceContext(base, "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { email, password, rememberMe: true },
        includeCredentials: true,
        timeoutMs: 20000,
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
  byId("meName").textContent = "-";
  byId("meEmail").textContent = "-";
  byId("meRoles").textContent = "Roles: -";
  setTenantOptions([], "");
  byId("notifOpen").textContent = "0";
  byId("notifTotal").textContent = "0";
  byId("notifLast").textContent = "-";
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

async function openUrl(url) {
  const target = String(url || "").trim();
  if (!target) return;
  await chrome.tabs.create({ url: target, active: true });
}

function normalizeTenantHref(base, tenantId) {
  const b = toWorkspaceBase(base);
  const t = String(tenantId || "").trim();
  if (!b || !t) return "";
  return `${b}/projects/${encodeURIComponent(t)}`;
}

async function initializeHome() {
  const stored = await storageGet([
    STORAGE_KEYS.workspaceBase,
    STORAGE_KEYS.selectedTenantId,
    STORAGE_KEYS.authEmail,
    STORAGE_KEYS.authToken,
  ]);
  const savedBase = ensureWorkspaceBase(stored?.[STORAGE_KEYS.workspaceBase] || "");
  const guessedBase = ensureWorkspaceBase(await guessWorkspaceBaseFromActiveTab());
  const base = guessedBase || savedBase || DEFAULT_WORKSPACE_BASE;
  if (base) byId("workspaceBase").value = base;
  const savedEmail = String(stored?.[STORAGE_KEYS.authEmail] || "").trim();
  if (savedEmail) byId("homeEmail").value = savedEmail;
  setActiveTabView("home");

  byId("tabHomeBtn")?.addEventListener("click", () => setActiveTabView("home"));
  byId("tabBotBtn")?.addEventListener("click", () => setActiveTabView("bot"));

  byId("workspaceBase")?.addEventListener("change", async () => {
    const normalized = ensureWorkspaceBase(byId("workspaceBase")?.value || "");
    if (!normalized) {
      byId("workspaceBase").value = DEFAULT_WORKSPACE_BASE;
      await storageSet({ [STORAGE_KEYS.workspaceBase]: DEFAULT_WORKSPACE_BASE });
      setHomeStatus("Invalid URL detected. Reset to default workspace.", "error");
      return;
    }
    byId("workspaceBase").value = normalized;
    await storageSet({ [STORAGE_KEYS.workspaceBase]: normalized });
    setHomeStatus("Workspace updated. Click Refresh to sync.");
  });

  byId("refreshHomeBtn")?.addEventListener("click", async () => {
    await refreshHome();
  });
  byId("homeSignInBtn")?.addEventListener("click", async () => {
    await signInHome();
  });
  byId("homeSignOutBtn")?.addEventListener("click", async () => {
    await signOutHome();
  });

  byId("refreshNotifBtn")?.addEventListener("click", async () => {
    await refreshNotifications();
  });

  byId("tenantSelect")?.addEventListener("change", async (e) => {
    const tenantId = String(e?.target?.value || "").trim();
    await storageSet({ [STORAGE_KEYS.selectedTenantId]: tenantId });
    await refreshNotifications();
  });

  byId("openDashboardBtn")?.addEventListener("click", async () => {
    const baseUrl = toWorkspaceBase(byId("workspaceBase")?.value || "");
    if (!baseUrl) {
      setHomeStatus("Set workspace URL first.", "error");
      return;
    }
    await openUrl(`${baseUrl}/projects`);
  });

  byId("openLoginBtn")?.addEventListener("click", async () => {
    const baseUrl = toWorkspaceBase(byId("workspaceBase")?.value || "");
    if (!baseUrl) {
      setHomeStatus("Set workspace URL first.", "error");
      return;
    }
    await openUrl(`${baseUrl}/login`);
  });

  byId("openTenantBtn")?.addEventListener("click", async () => {
    const baseUrl = toWorkspaceBase(byId("workspaceBase")?.value || "");
    const tenantId = String(byId("tenantSelect")?.value || "").trim();
    const href = normalizeTenantHref(baseUrl, tenantId);
    if (!href) {
      setHomeStatus("Select tenant first.", "error");
      return;
    }
    await openUrl(href);
  });

  const hasToken = !!String(stored?.[STORAGE_KEYS.authToken] || "").trim();
  if (base && hasToken) {
    await refreshHome();
  } else if (base && !hasToken) {
    setHomeStatus("Ready. Sign in to load your data.");
  } else {
    setHomeStatus("Set workspace URL and click Refresh.");
  }
}

function collectPayload() {
  return {
    activationUrl: byId("activationUrl").value.trim(),
    domainToPaste: byId("domainToPaste").value.trim(),
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

initializeHome().catch((e) => {
  setHomeStatus(`Init error: ${e instanceof Error ? e.message : String(e)}`, "error");
});

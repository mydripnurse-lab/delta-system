function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const botRuntime = {
  running: false,
  activeKey: "",
  activePromise: null,
  watchWindowId: null,
};
const EXT_BADGE_STORAGE_KEY = "delta_action_badge_count";
const EXT_BADGE_SEVERITY_STORAGE_KEY = "delta_action_badge_severity";
const EXT_BADGE_ALARM = "delta_badge_refresh_alarm";
const EXT_EXECUTION_PROFILE_KEY = "delta_execution_profile";
const DEFAULT_WORKSPACE_BASE = "https://www.telahagocrecer.com";

function normalizeSeverity(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "critical" || s === "high" || s === "p1") return "high";
  if (s === "medium" || s === "p2") return "medium";
  return "low";
}

async function applyExtensionBadge(rawCount, rawSeverity = "low") {
  const count = Math.max(0, Number(rawCount || 0));
  const severity = normalizeSeverity(rawSeverity);
  const text = count > 999 ? "999+" : count > 0 ? String(count) : "";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({
    color: severity === "high" ? "#e43f5a" : severity === "medium" ? "#f59e0b" : "#4f7dff",
  });
  await chrome.action.setBadgeTextColor({ color: "#ffffff" });
}

async function hydrateBadgeFromStorage() {
  try {
    const st = await chrome.storage.local.get([EXT_BADGE_STORAGE_KEY, EXT_BADGE_SEVERITY_STORAGE_KEY]);
    await applyExtensionBadge(st?.[EXT_BADGE_STORAGE_KEY] || 0, st?.[EXT_BADGE_SEVERITY_STORAGE_KEY] || "low");
  } catch {
    await applyExtensionBadge(0);
  }
}

async function apiFetchJson(base, path, token) {
  const target = new URL(path, base).toString();
  const res = await fetch(target, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${String(token || "").trim()}`,
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text || "{}");
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function severityRank(sev) {
  const s = normalizeSeverity(sev);
  if (s === "high") return 3;
  if (s === "medium") return 2;
  return 1;
}

async function refreshBadgeFromApi() {
  try {
    const st = await chrome.storage.local.get(["delta_auth_bearer_token", "delta_workspace_base_url"]);
    const token = String(st?.delta_auth_bearer_token || "").trim();
    const base = String(st?.delta_workspace_base_url || DEFAULT_WORKSPACE_BASE).trim() || DEFAULT_WORKSPACE_BASE;
    if (!token || !/^https?:\/\//i.test(base)) {
      await chrome.storage.local.set({
        [EXT_BADGE_STORAGE_KEY]: 0,
        [EXT_BADGE_SEVERITY_STORAGE_KEY]: "low",
      });
      await applyExtensionBadge(0, "low");
      return;
    }

    const tenantsOut = await apiFetchJson(base, "/api/tenants", token);
    const rows = tenantsOut?.json?.ok && Array.isArray(tenantsOut?.json?.rows) ? tenantsOut.json.rows : [];
    if (!rows.length) {
      await chrome.storage.local.set({
        [EXT_BADGE_STORAGE_KEY]: 0,
        [EXT_BADGE_SEVERITY_STORAGE_KEY]: "low",
      });
      await applyExtensionBadge(0, "low");
      return;
    }

    let totalOpen = 0;
    let maxSeverity = "low";
    await Promise.all(
      rows.map(async (t) => {
        const tenantId = String(t?.id || "").trim();
        if (!tenantId) return;
        const q = new URLSearchParams({
          organizationId: tenantId,
          status: "proposed",
          limit: "120",
        });
        try {
          const out = await apiFetchJson(base, `/api/agents/proposals?${q.toString()}`, token);
          const proposals = out?.json?.ok && Array.isArray(out?.json?.proposals) ? out.json.proposals : [];
          totalOpen += proposals.length;
          for (const p of proposals) {
            const sev = normalizeSeverity(p?.priority);
            if (severityRank(sev) > severityRank(maxSeverity)) maxSeverity = sev;
          }
        } catch {
          // keep partial result
        }
      }),
    );

    await chrome.storage.local.set({
      [EXT_BADGE_STORAGE_KEY]: totalOpen,
      [EXT_BADGE_SEVERITY_STORAGE_KEY]: maxSeverity,
    });
    await applyExtensionBadge(totalOpen, maxSeverity);
  } catch {
    // keep existing badge on transient failures
  }
}

async function waitTabLoaded(tabId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      throw new Error("Activation tab was closed by user.");
    }
    if (tab?.status === "complete") return tab;
    await sleep(280);
  }
  throw new Error("Tab load timeout");
}

async function runInTab(tabId, payload) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (input) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const allLogs = [];
      const executionProfile = String(input?.executionProfile || "safe").toLowerCase();
      const speedFactor =
        executionProfile === "fast" ? 0.75 : executionProfile === "normal" ? 1 : 1.55;
      const sleepScaled = (ms) => sleep(Math.max(20, Math.round(Number(ms || 0) * speedFactor)));

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
        } else {
          box.innerHTML = "";
        }

        const statusRow = document.createElement("div");
        statusRow.style.display = "flex";
        statusRow.style.justifyContent = "space-between";
        statusRow.style.gap = "8px";
        statusRow.style.alignItems = "center";
        statusRow.style.marginBottom = "8px";

        const title = document.createElement("div");
        title.textContent = "Domain Bot";
        title.style.fontWeight = "700";
        title.style.letterSpacing = ".2px";

        const settingsPill = document.createElement("div");
        settingsPill.id = "__delta_local_bot_settings_persist";
        settingsPill.style.padding = "2px 8px";
        settingsPill.style.borderRadius = "999px";
        settingsPill.style.border = "1px solid rgba(148,163,184,.45)";
        settingsPill.style.background = "rgba(148,163,184,.18)";
        settingsPill.style.fontSize = "11px";
        settingsPill.textContent = "Settings persisted: Pending";

        statusRow.appendChild(title);
        statusRow.appendChild(settingsPill);
        box.appendChild(statusRow);

        const logsWrap = document.createElement("div");
        logsWrap.id = "__delta_local_bot_log_lines";
        box.appendChild(logsWrap);
        return { box, logsWrap, settingsPill };
      }

      const overlay = ensureOverlay();

      function setSettingsPersistStatus(state, detail = "") {
        const pill = document.getElementById("__delta_local_bot_settings_persist");
        if (!pill) return;
        const s = String(state || "").toLowerCase();
        if (s === "ok") {
          pill.textContent = `Settings persisted: OK${detail ? ` (${detail})` : ""}`;
          pill.style.border = "1px solid rgba(57,217,138,.55)";
          pill.style.background = "rgba(57,217,138,.2)";
          return;
        }
        if (s === "fail") {
          pill.textContent = `Settings persisted: Failed${detail ? ` (${detail})` : ""}`;
          pill.style.border = "1px solid rgba(255,94,121,.6)";
          pill.style.background = "rgba(255,94,121,.2)";
          return;
        }
        if (s === "na") {
          pill.textContent = "Settings persisted: N/A";
          pill.style.border = "1px solid rgba(148,163,184,.45)";
          pill.style.background = "rgba(148,163,184,.16)";
          return;
        }
        pill.textContent = "Settings persisted: Pending";
        pill.style.border = "1px solid rgba(148,163,184,.45)";
        pill.style.background = "rgba(148,163,184,.18)";
      }

      function log(msg) {
        const line = `[${new Date().toLocaleTimeString()}] ${String(msg)}`;
        allLogs.push(line);

        const d = document.createElement("div");
        d.textContent = line;
        (overlay.logsWrap || overlay.box).appendChild(d);
        overlay.box.scrollTop = overlay.box.scrollHeight;
        console.log("[DeltaLocalBot]", msg);
      }

      log(`execution profile: ${executionProfile} (x${speedFactor.toFixed(2)})`);

      function visible(el) {
        if (!el) return false;
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity || "1") === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }

      function fireClick(el) {
        if (!el) return false;
        try {
          el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        } catch {}
        const events = ["pointerdown", "mousedown", "mouseup", "click"];
        for (const name of events) {
          try {
            el.dispatchEvent(
              new MouseEvent(name, {
                bubbles: true,
                cancelable: true,
                view: window,
              }),
            );
          } catch {}
        }
        try {
          el.click();
        } catch {}
        return true;
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

      async function clickSel(selectors, label, timeoutMs = 120000, options = {}) {
        const exactId = options && options.exactId ? String(options.exactId) : "";
        const arr = Array.isArray(selectors) ? selectors : [selectors];
        const el = await waitFor(() => {
          for (const sel of arr) {
            const x = document.querySelector(sel);
            if (!visible(x)) continue;
            if (exactId && x.id !== exactId) continue;
            return x;
          }
          return null;
        }, timeoutMs, 260, label || arr.join(" | "));
        fireClick(el);
        log(`click -> ${label || arr[0]}`);
        await sleep(320);
        return el;
      }

      async function clickByText(needle, label, timeoutMs = 60000) {
        const wanted = norm(needle);
        const el = await waitFor(() => {
          const candidates = [
            ...document.querySelectorAll("button, a, [role='button'], span, div"),
          ];
          for (const c of candidates) {
            const txt = norm(c.textContent);
            if (!txt || !txt.includes(wanted)) continue;
            if (!visible(c)) continue;
            const clickable = c.closest("button, a, [role='button']") || c;
            if (visible(clickable)) return clickable;
          }
          return null;
        }, timeoutMs, 260, label || `text contains: ${needle}`);
        fireClick(el);
        log(`click text -> ${label || needle}`);
        await sleep(320);
        return el;
      }

      function collectConnectDomainCandidates() {
        const seen = new Set();
        const out = [];
        const push = (el, why) => {
          if (!el || !visible(el)) return;
          if (!(el instanceof HTMLElement)) return;
          if (seen.has(el)) return;
          seen.add(el);
          out.push({ el, why, text: norm(el.textContent), href: el.getAttribute("href") || "" });
        };

        // 1) Strong selectors first
        [
          "a[href*='connect-domain']",
          "a[href*='connect'][href*='domain']",
          "button[id*='connect-domain-button']",
          "[id*='connect-domain-button']",
          "[id*='connect-domain-button-text']",
          "[data-testid*='connect-domain']",
          "button[id*='connect-domain']",
          "[id*='connect-domain']",
        ].forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => push(el, `sel:${sel}`));
        });

        // 2) Exact text on clickable elements
        document.querySelectorAll("a, button, [role='button']").forEach((el) => {
          const t = norm(el.textContent);
          if (t === "connect a domain" || t.endsWith("connect a domain") || t.includes("connect a domain")) {
            push(el, "clickable-text");
          }
        });

        // 3) As fallback, nearest clickable parent from text nodes
        document.querySelectorAll("span, div, p, strong").forEach((raw) => {
          const t = norm(raw.textContent);
          if (!t.includes("connect a domain")) return;
          const clickable = raw.closest("a, button, [role='button']");
          if (clickable) push(clickable, "parent-clickable-text");
        });

        return out;
      }

      async function clickConnectDomainLink(timeoutMs = 30000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
          const candidates = collectConnectDomainCandidates();
          if (candidates.length) {
            for (const c of candidates) {
              fireClick(c.el);
              log(`click -> Connect a domain (${c.why}) text="${c.text.slice(0, 60)}"`);
              await sleep(500);

              // If it's a link, force navigation when click is intercepted.
              const href = String(c.href || "").trim();
              if (href && (href.startsWith("/") || href.startsWith("http"))) {
                try {
                  const before = location.href;
                  if (before === location.href) {
                    location.assign(href);
                    log(`navigate -> ${href}`);
                    await sleep(900);
                  }
                } catch {}
              }
            }
            return true;
          }
          await sleep(260);
        }
        return false;
      }

      function fireSingleNativeClick(el) {
        if (!el) return false;
        try {
          el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        } catch {}
        try {
          el.click();
          return true;
        } catch {
          return false;
        }
      }

      async function waitForConnectUiReady(timeoutMs = 12000) {
        try {
          await waitFor(() => {
            const strictSelectors = [
              "[id*='connect-button-SITES']",
              "button[id*='SITES']",
              "[id*='add-records']",
              "[id*='submit-manually']",
              "[id*='addedRecord']",
              "input[placeholder*='domain' i]",
              "input[aria-label*='domain' i]",
            ];
            return strictSelectors.some((sel) => {
              const el = document.querySelector(sel);
              return visible(el);
            });
          }, timeoutMs, 220, "connect ui ready");
          return true;
        } catch {
          return false;
        }
      }

      async function fillSel(selectors, value, label, timeoutMs = 120000) {
        const arr = Array.isArray(selectors) ? selectors : [selectors];
        const el = await waitFor(() => {
          for (const sel of arr) {
            const x = document.querySelector(sel);
            if (visible(x)) return x;
          }
          return null;
        }, timeoutMs, 260, label || arr.join(" | "));
        el.focus();
        el.value = String(value || "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.blur();
        log(`fill -> ${label || arr[0]}`);
        await sleep(300);
      }

      async function fillDomainCalmly(value) {
        const input = await waitFor(() => {
          const byDomainPlaceholder = document.querySelector(
            "input[placeholder*='domain' i], input[aria-label*='domain' i]",
          );
          if (visible(byDomainPlaceholder)) return byDomainPlaceholder;

          const labels = [...document.querySelectorAll("label, .n-form-item-label, .n-form-item-label__text")];
          const domainLabel = labels.find((el) => norm(el.textContent).includes("domain"));
          if (domainLabel) {
            const formItem =
              domainLabel.closest(".n-form-item") ||
              domainLabel.parentElement?.parentElement?.parentElement ||
              domainLabel.parentElement;
            const labeledInput = formItem?.querySelector("input");
            if (visible(labeledInput)) return labeledInput;
          }

          const strictFallback = document.querySelector("[id*='domain'], [id*='domain-input']");
          if (visible(strictFallback)) return strictFallback;

          return null;
        }, 120000, 220, "domain input");

        input.focus();
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(input, "");
        else input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(260);

        const text = String(value || "");
        for (let i = 0; i < text.length; i += 1) {
          if (setter) setter.call(input, text.slice(0, i + 1));
          else input.value = text.slice(0, i + 1);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          if (i % 4 === 0) await sleep(70);
        }
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
        log(`fill calm -> domain field (${text})`);

        await waitFor(
          () => String(input.value || "").trim() === text,
          12000,
          180,
          "domain input value confirmed",
        );
        await sleep(900);
      }

      async function clickAddRecordsCalmly() {
        if (window.__ct_add_records_click_lock) {
          log("skip duplicate (lock) -> add-records");
          return;
        }

        const btn = await waitFor(() => {
          const candidates = [
            ...document.querySelectorAll("[id*='add-records'], [data-testid='continue-domain-connect']"),
          ];
          const el = candidates.find((node) => {
            if (!visible(node)) return false;
            const idOk = String(node.id || "").trim() === "add-records";
            const dtOk = String(node.getAttribute("data-testid") || "").trim() === "continue-domain-connect";
            const textOk = norm(node.textContent) === "continue";
            const typeOk = String(node.getAttribute("type") || "").toLowerCase() === "button";
            return idOk && dtOk && textOk && typeOk;
          }) || null;
          if (!el) return null;
          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.classList.contains("disabled");
          return disabled ? null : el;
        }, 45000, 250, "add-records enabled");

        // Anti double-click guard for this sensitive step.
        if (window.__ct_add_records_clicked_once) {
          log("skip duplicate -> add-records");
          return;
        }

        window.__ct_add_records_click_lock = true;
        try {
          await sleep(1200);
          fireSingleNativeClick(btn);
          window.__ct_add_records_clicked_once = true;
          log("click calm (single exact) -> add-records/continue-domain-connect");

          // Wait until button changes state or disappears, signaling first click was accepted.
          await waitFor(() => {
            const el = document.querySelector("[id*='add-records']");
            if (!el) return true;
            if (!visible(el)) return true;
            const disabled =
              el.hasAttribute("disabled") ||
              el.getAttribute("aria-disabled") === "true" ||
              el.classList.contains("disabled");
            return disabled;
          }, 12000, 180, "add-records accepted").catch(() => null);

          await sleep(700);
        } finally {
          window.__ct_add_records_click_lock = false;
        }
      }

      function countManualDnsRows() {
        const modal =
          document.querySelector("div.n-card.n-modal.hl-modal[role='dialog']") ||
          [...document.querySelectorAll('[role="dialog"], .n-modal, .modal, [data-testid*="modal"]')]
            .find((el) => visible(el)) ||
          document;

        // Prefer inputs that represent manual DNS rows; CNAME rows typically have host/value fields.
        const hostInputs = modal.querySelectorAll("input");
        if (hostInputs.length >= 2) {
          // Heuristic: pair by rows, minimum 1
          return Math.max(1, Math.round(hostInputs.length / 2));
        }

        const cnameTextRows = [...modal.querySelectorAll("div, span, p")]
          .map((el) => (el.textContent || "").trim().toLowerCase())
          .filter((t) => t === "cname");
        if (cnameTextRows.length) return cnameTextRows.length;
        return 0;
      }

      function closeVisibleModal() {
        const candidates = [
          "[aria-label='Close']",
          "[aria-label*='close' i]",
          ".n-base-close",
          ".n-modal .n-base-icon",
          ".modal [role='button']",
        ];
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (visible(el)) {
            fireSingleNativeClick(el);
            return true;
          }
        }
        return false;
      }

      async function clickManualSubmitCalmly() {
        if (window.__ct_manual_submit_click_lock) {
          log("skip duplicate (lock) -> manual-submit-button");
          return;
        }
        if (window.__ct_manual_submit_clicked_once) {
          log("skip duplicate -> manual-submit-button");
          return;
        }

        const btn = await waitFor(() => {
          const byTestId = document.querySelector('[data-testid="manual-submit-button"]');
          const byAria = document.querySelector(
            '[aria-label="Add record manually"], [aria-label*="Add record manually" i]',
          );
          const candidates = [byTestId, byAria].filter(Boolean);
          for (const el of candidates) {
            if (!visible(el)) continue;
            const disabled =
              el.hasAttribute("disabled") ||
              el.getAttribute("aria-disabled") === "true" ||
              el.classList.contains("disabled");
            if (disabled) continue;
            return el;
          }
          return null;
        }, 90000, 250, "manual-submit-button enabled");

        window.__ct_manual_submit_click_lock = true;
        try {
          await sleep(1200);
          fireSingleNativeClick(btn);
          window.__ct_manual_submit_clicked_once = true;
          log("click calm (single) -> manual-submit-button");

          // Wait for modal/content transition to render before next click.
          const modalReady = await waitFor(() => {
            const addedRecord = document.querySelector("[id*='addedRecord']");
            if (visible(addedRecord)) return true;
            const modal =
              document.querySelector("div.n-card.n-modal.hl-modal[role='dialog']") ||
              document.querySelector('[role="dialog"], .n-modal, .modal, [data-testid*="modal"]');
            return visible(modal);
          }, 30000, 220, "manual submit modal/content ready").catch(() => false);

          if (modalReady) {
            log("manual submit modal/content ready");
          }

          const rows = countManualDnsRows();
          log(`manual DNS rows detected: ${rows}`);
          await sleep(900);
        } finally {
          window.__ct_manual_submit_click_lock = false;
        }
      }

      async function clickAddedRecordCalmly() {
        const btn = await waitFor(() => {
          const modal = document.querySelector("div.n-card.n-modal.hl-modal[role='dialog']");
          if (!modal) return null;

          const exact = modal.querySelector(
            "#addedRecord[data-testid='verify-records-button'][aria-label='Verify records']",
          );
          if (!visible(exact)) return null;
          const disabled =
            exact.hasAttribute("disabled") ||
            exact.getAttribute("aria-disabled") === "true" ||
            exact.classList.contains("disabled");
          return disabled ? null : exact;
        }, 90000, 250, "verify-records-button rendered/enabled");

        await sleep(1400);
        fireSingleNativeClick(btn);
        log("click calm (single exact) -> addedRecord/verify-records-button");
        await sleep(1200);
      }

      async function clickContinueCalmly() {
        const btn = await waitFor(() => {
          const all = [...document.querySelectorAll("[id*='continue'], button, [role='button']")];
          for (const el of all) {
            if (!visible(el)) continue;
            const idHit = String(el.id || "").toLowerCase() === "continue";
            const textHit = norm(el.textContent) === "continue";
            if (!idHit && !textHit) continue;
            const disabled =
              el.hasAttribute("disabled") ||
              el.getAttribute("aria-disabled") === "true" ||
              el.classList.contains("disabled");
            if (disabled) continue;
            return el;
          }
          return null;
        }, 90000, 250, "continue button enabled");

        await sleep(1200);
        fireClick(btn);
        await sleep(300);
        // second click helps when first click only focuses/enables transition
        fireClick(btn);
        log("click calm -> continue");
        await sleep(900);
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
        const menu = await waitFor(() => getVisibleMenu(), 50000, 220, "visible dropdown menu");
        const scroller = menu.querySelector(".v-vl, .v-vl-container, .n-base-select-menu__content") || menu;
        const seen = new Map();
        for (let i = 0; i < 220; i += 1) {
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
            await sleep(320);
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

      async function openAndPickAnyLabel(labelNeedles, optionNeedle) {
        let lastError = null;
        for (const label of labelNeedles) {
          try {
            await openAndPick(label, optionNeedle);
            return label;
          } catch (e) {
            lastError = e;
          }
        }
        throw lastError || new Error(`No label matched for option ${optionNeedle}`);
      }

      async function openActionMenuAndPickExact(optionText, triggerSelector, timeoutMs = 45000) {
        const wanted = norm(optionText);
        const started = Date.now();
        let attempt = 0;
        let lastErr = null;

        const pickVisibleTrigger = () => {
          const all = [...document.querySelectorAll(triggerSelector)].filter((el) => visible(el));
          if (!all.length) return null;
          // Prefer the visible trigger closest to viewport center.
          const cy = window.innerHeight / 2;
          const cx = window.innerWidth / 2;
          all.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const da = Math.abs((ra.top + ra.height / 2) - cy) + Math.abs((ra.left + ra.width / 2) - cx);
            const db = Math.abs((rb.top + rb.height / 2) - cy) + Math.abs((rb.left + rb.width / 2) - cx);
            return da - db;
          });
          return all[0];
        };

        while (Date.now() - started < timeoutMs) {
          attempt += 1;
          try {
            // If menu is already open and contains exact option, click it immediately.
            const alreadyOpenOption = (() => {
              const menus = [...document.querySelectorAll(".v-binder-follower-content")]
                .filter((el) => visible(el));
              for (const menu of menus) {
                const labels = [...menu.querySelectorAll(".n-dropdown-option-body__label")];
                for (const label of labels) {
                  const t = norm(label?.textContent || "");
                  if (t === wanted) {
                    const opt = label.closest(".n-dropdown-option") || label;
                    return { opt, label };
                  }
                }
              }
              return null;
            })();
            if (alreadyOpenOption) {
              fireSingleNativeClick(alreadyOpenOption.label);
              await sleep(120);
              fireSingleNativeClick(alreadyOpenOption.opt);
              log(`menu pick exact -> ${optionText} (already open)`);
              await sleep(520);
              return;
            }

            // Ensure trigger exists/visible and is stable before opening menu.
            const trigger = await waitFor(() => {
              const el = pickVisibleTrigger();
              return visible(el) ? el : null;
            }, Math.min(12000, timeoutMs), 220, `action menu trigger visible (${triggerSelector})`);

            await sleep(280);
            fireSingleNativeClick(trigger);
            log(`open action menu -> ${optionText} (attempt ${attempt})`);
            await sleep(380);

            const option = await waitFor(() => {
              const menus = [...document.querySelectorAll(".v-binder-follower-content")]
                .filter((el) => visible(el));
              if (!menus.length) return null;

              for (const menu of menus) {
                const labels = [...menu.querySelectorAll(".n-dropdown-option-body__label")];
                for (const label of labels) {
                  const t = norm(label?.textContent || "");
                  if (t === wanted) {
                    const opt = label.closest(".n-dropdown-option") || label;
                    return { opt, label };
                  }
                }
              }
              return null;
            }, 8000, 220, `dropdown option exact: ${optionText}`);

            fireSingleNativeClick(option.label);
            await sleep(120);
            fireSingleNativeClick(option.opt);
            log(`menu pick exact -> ${optionText}`);
            await sleep(520);
            return;
          } catch (e) {
            lastErr = e;
            // Try to close a stuck menu and retry.
            try {
              document.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "Escape",
                  code: "Escape",
                  bubbles: true,
                }),
              );
            } catch {}
            await sleep(320);
          }
        }

        throw lastErr || new Error(`Timeout: dropdown option exact: ${optionText}`);
      }

      async function selectAsteriskPageCheckboxes() {
        await waitFor(
          () =>
            document.querySelectorAll(
              ".n-collapse-item--active .n-collapse-item__content-inner div.flex.my-2.funnel-page",
            ).length > 0,
          45000,
          220,
          "funnel-page rows present",
        );
        await sleep(350);

        const rows = [
          ...document.querySelectorAll(
            ".n-collapse-item--active .n-collapse-item__content-inner div.flex.my-2.funnel-page",
          ),
        ];
        let clicked = 0;
        let matched = 0;
        let alreadyChecked = 0;
        for (const row of rows) {
          const labelEl = row.querySelector("div.ml-2");
          const txt = (labelEl?.textContent || "").trim();
          if (!txt.startsWith("**")) continue;
          matched += 1;

          const cb =
            row.querySelector("div.n-checkbox[role='checkbox']") ||
            row.querySelector("[role='checkbox']");
          if (!cb || !visible(cb)) continue;
          const checked = cb.getAttribute("aria-checked") === "true";
          if (checked) {
            alreadyChecked += 1;
            continue;
          }

          fireSingleNativeClick(cb);
          await sleep(180);
          const nowChecked = cb.getAttribute("aria-checked") === "true";
          if (nowChecked) clicked += 1;
        }
        log(
          `checkboxes selected (**): matched=${matched} clicked=${clicked} alreadyChecked=${alreadyChecked} rows=${rows.length}`,
        );
      }

      async function clickPositiveModalActionStrict(expectedText = "Proceed", timeoutMs = 45000) {
        const wanted = norm(expectedText);
        const btn = await waitFor(() => {
          const modal = [...document.querySelectorAll("div.n-card.n-modal.hl-modal[role='dialog']")]
            .find((el) => visible(el));
          if (!modal) return null;

          const exact = [...modal.querySelectorAll("#modal-footer-btn-positive-action")]
            .filter((el) => visible(el));
          if (exact.length !== 1) return null;

          const el = exact[0];
          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.classList.contains("disabled");
          if (disabled) return null;

          const txt = norm(el.textContent);
          if (wanted && txt && txt !== wanted) return null;
          return el;
        }, timeoutMs, 220, "strict modal positive action");

        await sleep(450);
        fireSingleNativeClick(btn);
        log(`modal positive strict -> ${expectedText || "positive action"}`);
        await sleep(500);
      }

      async function fillRobotsTxtInModalStrict(value, timeoutMs = 45000) {
        const ta = await waitFor(() => {
          const modal = [...document.querySelectorAll("div.n-card.n-modal.hl-modal[role='dialog']")]
            .find((el) => visible(el));
          if (!modal) return null;

          const wrapper = modal.querySelector("#robotsTxtCode[data-testid='robots-txt-input']");
          const textarea =
            wrapper?.querySelector("textarea.n-input__textarea-el") ||
            modal.querySelector("textarea.n-input__textarea-el[placeholder*='robots.txt' i]") ||
            modal.querySelector("textarea.n-input__textarea-el");
          return visible(textarea) ? textarea : null;
        }, timeoutMs, 220, "robots textarea in modal");

        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )?.set;

        ta.focus();
        if (setter) setter.call(ta, String(value || ""));
        else ta.value = String(value || "");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new Event("change", { bubbles: true }));
        ta.blur();

        await waitFor(
          () => String(ta.value || "") === String(value || ""),
          8000,
          180,
          "robots textarea value persisted",
        );
        log(`robots txt set (strict modal) len=${String(value || "").length}`);
      }

      async function clickBackButtonStrict(timeoutMs = 45000) {
        const btn = await waitFor(() => {
          const exact = [...document.querySelectorAll("div#backButtonv2")]
            .filter((el) => visible(el));
          if (exact.length !== 1) return null;

          const el = exact[0];
          const txt = norm(el.textContent);
          if (txt !== "go back") return null;

          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.classList.contains("disabled");
          if (disabled) return null;

          return el;
        }, timeoutMs, 220, "strict backButtonv2 Go Back");

        await sleep(280);
        fireSingleNativeClick(btn);
        log("back button strict -> Go Back");
        await sleep(350);
      }

      async function clickSbSitesStrict(timeoutMs = 45000) {
        const target = await waitFor(() => {
          const container = document.querySelector(
            "div.flex.flex-col.w-full.overflow-x-hidden.overflow-y-auto.hl_nav-header",
          );
          if (!container || !visible(container)) return null;

          const exact = [...container.querySelectorAll("#sb_sites, [id='sb_sites']")]
            .filter((el) => visible(el));
          if (exact.length !== 1) return null;

          const el = exact[0];
          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.classList.contains("disabled");
          if (disabled) return null;

          return el;
        }, timeoutMs, 220, "strict sb_sites in nav container");

        await sleep(280);
        fireSingleNativeClick(target);
        log("sb_sites strict -> Sites");
        await sleep(350);
      }

      async function clickTbWebsitesStrict(timeoutMs = 45000) {
        const target = await waitFor(() => {
          const header = document.querySelector("div.hl_header, .hl_header");
          if (!header || !visible(header)) return null;

          const exact = [...header.querySelectorAll("a#tb_websites, a[id='tb_websites']")]
            .filter((el) => visible(el));
          if (exact.length !== 1) return null;

          const el = exact[0];
          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.classList.contains("disabled");
          if (disabled) return null;

          return el;
        }, timeoutMs, 220, "strict tb_websites in hl_header");

        await sleep(280);
        fireSingleNativeClick(target);
        log("tb_websites strict -> Websites");
        await sleep(450);
      }

      async function clickCountyTableEntryStrict(timeoutMs = 45000) {
        const target = await waitFor(() => {
          const bodies = [...document.querySelectorAll(
            "div.n-data-table-base-table-body.n-scrollbar",
          )].filter((el) => visible(el));

          const matches = [];
          for (const body of bodies) {
            const content = body.querySelector("div.n-scrollbar-content");
            if (!visible(content)) continue;

            const table = content.querySelector("table.n-data-table-table");
            if (!visible(table)) continue;

            const tbody = table.querySelector("tbody.n-data-table-tbody");
            if (!visible(tbody)) continue;

            const rows = [...tbody.querySelectorAll("tr.n-data-table-tr")];
            for (const tr of rows) {
              const tds = [...tr.querySelectorAll("td.n-data-table-td.n-data-table-td--last-row")];
              for (const td of tds) {
                const card = td.querySelector(
                  "div.text-gray-900.hover\\:text-primary-600.cursor-pointer.flex.hl-text-sm-medium",
                );
                if (!visible(card)) continue;

                const span = [...card.querySelectorAll("span")]
                  .find((s) => norm(s.textContent) === "county");
                if (!span) continue;
                matches.push(card);
              }
            }
          }

          if (matches.length !== 1) return null;
          return matches[0];
        }, timeoutMs, 220, "strict County table entry");

        await sleep(260);
        fireSingleNativeClick(target);
        log("county table entry strict -> County");
        await sleep(360);
      }

      async function clickSettingsTabStrict(timeoutMs = 45000) {
        const target = await waitFor(() => {
          const root = document.querySelector("div.n-tabs-nav-scroll-content");
          if (!root || !visible(root)) return null;

          const wrapper = root.querySelector("div.n-tabs-wrapper");
          if (!wrapper || !visible(wrapper)) return null;

          const exact = [...wrapper.querySelectorAll(
            "div.n-tabs-tab-wrapper div.n-tabs-tab[data-name='settings']",
          )].filter((el) => visible(el));

          const matches = exact.filter((el) => norm(el.textContent).includes("settings"));
          if (matches.length !== 1) return null;

          const el = matches[0];
          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            /disabled/i.test(String(el.className || ""));
          if (disabled) return null;

          return el;
        }, timeoutMs, 220, "strict settings tab in tabs root");

        await sleep(260);
        fireSingleNativeClick(target);
        log("settings tab strict -> Settings");
        await sleep(360);
      }

      function normalizeDomainLike(value) {
        return String(value || "")
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/\/+$/, "")
          .replace(/\s+/g, "");
      }

      function readFunnelsSelectedDomainCandidates() {
        const roots = [
          ...document.querySelectorAll(
            "#funnels, [id='funnels'], .funnel-setting-input, [id*='funnel' i]",
          ),
        ].filter((el) => visible(el));

        const out = [];
        for (const root of roots) {
          const inputWrap = root.querySelector(".n-base-selection-input");
          const contentEl = root.querySelector(".n-base-selection-input__content");
          const inputLike = root.querySelector("input, [role='combobox']");
          const titleVal = String(inputWrap?.getAttribute("title") || "").trim();
          const contentVal = String(contentEl?.textContent || "").trim();
          const ariaVal = String(inputLike?.getAttribute("aria-label") || "").trim();
          const valueVal = String(inputLike?.value || "").trim();
          const raw = titleVal || contentVal || valueVal || ariaVal;
          if (raw) {
            out.push({
              raw,
              source: titleVal
                ? "title"
                : contentVal
                  ? "content"
                  : valueVal
                    ? "value"
                    : "aria",
            });
          }
        }
        return out;
      }

      function matchesExpectedDomain(expected, got) {
        const a = normalizeDomainLike(expected);
        const b = normalizeDomainLike(got);
        if (!a || !b) return false;
        if (a === b) return true;
        // Handle UI variants where value can include prefixes/suffixes.
        return a.includes(b) || b.includes(a);
      }

      async function waitForFunnelsSelectedMatch(expectedDomainLike, timeoutMs = 20000) {
        const expected = normalizeDomainLike(expectedDomainLike);
        const started = Date.now();
        let lastRaw = "";
        let lastSource = "";
        while (Date.now() - started < timeoutMs) {
          const candidates = readFunnelsSelectedDomainCandidates();
          if (candidates.length) {
            const hit = candidates.find((c) => matchesExpectedDomain(expected, c.raw));
            if (hit) {
              log(`funnels selected ready (${hit.source}) -> ${hit.raw}`);
              return true;
            }
            const first = candidates[0];
            lastRaw = first.raw;
            lastSource = first.source;
          }
          await sleepScaled(240);
        }
        const gotNorm = normalizeDomainLike(lastRaw);
        if (!lastRaw) {
          throw new Error(
            `STEP_SETTINGS_FUNNELS_EMPTY: #funnels value not available within ${Math.round(
              timeoutMs / 1000,
            )}s`,
          );
        }
        throw new Error(
          `STEP_SETTINGS_FUNNELS_MISMATCH: expected="${expected}" got="${gotNorm}" raw="${lastRaw}" source="${lastSource || "unknown"}"`,
        );
      }

      async function waitForSettingsFormReady(timeoutMs = 90000) {
        await waitFor(() => {
          const card = document.querySelector("div.my-3.py-5.px-3.bg-white.rounded.hl-card");
          if (!card || !visible(card)) return null;
          const content = card.querySelector("div.hl-card-content");
          if (!content || !visible(content)) return null;
          const form = content.querySelector("form#funnel-settings");
          if (!form || !visible(form)) return null;

          const faviconInput = form.querySelector("div#faviconUrl input, #faviconUrl .n-input__input-el");
          if (!faviconInput || !visible(faviconInput)) return null;
          return form;
        }, timeoutMs, 220, "settings funnel form ready");
        await sleepScaled(650);
      }

      async function retryFieldFill(label, fn, attempts = 3) {
        let lastErr = null;
        for (let i = 0; i < attempts; i += 1) {
          try {
            await fn();
            if (i > 0) log(`${label} recovered on retry ${i + 1}/${attempts}`);
            return;
          } catch (e) {
            lastErr = e;
            log(`${label} retry ${i + 1}/${attempts} failed: ${e instanceof Error ? e.message : String(e)}`);
            await sleepScaled(700 + i * 250);
          }
        }
        throw lastErr || new Error(`${label} failed`);
      }

      async function fillFaviconStrict(value, timeoutMs = 45000) {
        const inputEl = await waitFor(() => {
          const card = document.querySelector("div.my-3.py-5.px-3.bg-white.rounded.hl-card");
          if (!card || !visible(card)) return null;

          const content = card.querySelector("div.hl-card-content");
          if (!content || !visible(content)) return null;

          const form = content.querySelector("form#funnel-settings");
          if (!form || !visible(form)) return null;

          const block = form.querySelector("div#faviconUrl");
          if (!block || !visible(block)) return null;

          const input =
            block.querySelector("input.n-input__input-el") ||
            block.querySelector(".n-input__input input") ||
            block.querySelector("input");
          if (!input || !visible(input)) return null;

          const disabled =
            input.hasAttribute("disabled") ||
            input.getAttribute("aria-disabled") === "true" ||
            input.readOnly;
          if (disabled) return null;

          return input;
        }, timeoutMs, 220, "strict favicon input in funnel-settings");

        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;

        inputEl.focus();
        if (setter) setter.call(inputEl, String(value || ""));
        else inputEl.value = String(value || "");
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        inputEl.blur();

        await waitFor(
          () => String(inputEl.value || "") === String(value || ""),
          8000,
          180,
          "favicon value persisted",
        );
        log(`favicon strict set len=${String(value || "").length}`);
      }

      async function fillHeadTrackingStrict(value, timeoutMs = 45000) {
        const textarea = await waitFor(() => {
          const card = document.querySelector("div.my-3.py-5.px-3.bg-white.rounded.hl-card");
          if (!card || !visible(card)) return null;

          const content = card.querySelector("div.hl-card-content");
          if (!content || !visible(content)) return null;

          const form = content.querySelector("form#funnel-settings");
          if (!form || !visible(form)) return null;

          const section = form.querySelector("div#c-head-tracking-code");
          if (!section || !visible(section)) return null;

          const blank = section.querySelector("div.n-form-item-blank");
          if (!blank || !visible(blank)) return null;

          const holder = blank.querySelector("div#head-tracking-code");
          if (!holder || !visible(holder)) return null;

          const ta =
            holder.querySelector("textarea.n-input__textarea-el") ||
            holder.querySelector(".n-input__textarea-el") ||
            holder.querySelector("textarea");
          if (!ta || !visible(ta)) return null;

          const disabled =
            ta.hasAttribute("disabled") ||
            ta.getAttribute("aria-disabled") === "true" ||
            ta.readOnly;
          if (disabled) return null;

          return ta;
        }, timeoutMs, 220, "strict head tracking textarea in funnel-settings");

        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )?.set;

        textarea.focus();
        if (setter) setter.call(textarea, String(value || ""));
        else textarea.value = String(value || "");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        textarea.blur();

        await waitFor(
          () => String(textarea.value || "") === String(value || ""),
          8000,
          180,
          "head tracking value persisted",
        );
        log(`head tracking strict set len=${String(value || "").length}`);
      }

      async function fillBodyTrackingStrict(value, timeoutMs = 45000) {
        const textarea = await waitFor(() => {
          const card = document.querySelector("div.my-3.py-5.px-3.bg-white.rounded.hl-card");
          if (!card || !visible(card)) return null;

          const content = card.querySelector("div.hl-card-content");
          if (!content || !visible(content)) return null;

          const form = content.querySelector("form#funnel-settings");
          if (!form || !visible(form)) return null;

          const section =
            form.querySelector("div#c-body-tracking-code") ||
            form.querySelector("div[id*='body-tracking-code']");
          if (!section || !visible(section)) return null;

          const blank = section.querySelector("div.n-form-item-blank");
          if (!blank || !visible(blank)) return null;

          const holder =
            blank.querySelector("div#body-tracking-code") ||
            blank.querySelector("div[id*='body-tracking-code']");
          if (!holder || !visible(holder)) return null;

          const wrapper = holder.querySelector("div.n-input-wrapper");
          if (!wrapper || !visible(wrapper)) return null;

          const scroller = wrapper.querySelector("div.n-input__textarea.n-scrollbar");
          if (!scroller || !visible(scroller)) return null;

          const ta =
            scroller.querySelector("textarea.n-input__textarea-el") ||
            holder.querySelector("textarea.n-input__textarea-el") ||
            holder.querySelector("textarea");
          if (!ta || !visible(ta)) return null;

          const disabled =
            ta.hasAttribute("disabled") ||
            ta.getAttribute("aria-disabled") === "true" ||
            ta.readOnly;
          if (disabled) return null;

          return ta;
        }, timeoutMs, 220, "strict body tracking textarea in funnel-settings");

        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )?.set;

        textarea.focus();
        if (setter) setter.call(textarea, String(value || ""));
        else textarea.value = String(value || "");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        textarea.blur();

        await waitFor(
          () => String(textarea.value || "") === String(value || ""),
          8000,
          180,
          "body tracking value persisted",
        );
        log(`body tracking strict set len=${String(value || "").length}`);
      }

      function readSettingsValuesStrict() {
        const card = document.querySelector("div.my-3.py-5.px-3.bg-white.rounded.hl-card");
        if (!card || !visible(card)) return null;
        const form = card.querySelector("form#funnel-settings");
        if (!form || !visible(form)) return null;

        const favicon =
          form.querySelector("div#faviconUrl input") ||
          form.querySelector("#faviconUrl .n-input__input-el") ||
          null;
        const head =
          form.querySelector("#head-tracking-code textarea.n-input__textarea-el") ||
          form.querySelector("#c-head-tracking-code textarea.n-input__textarea-el") ||
          null;
        const body =
          form.querySelector("#body-tracking-code textarea.n-input__textarea-el") ||
          form.querySelector("#c-body-tracking-code textarea.n-input__textarea-el") ||
          null;

        return {
          favicon: String(favicon?.value || ""),
          head: String(head?.value || ""),
          body: String(body?.value || ""),
        };
      }

      function sameText(a, b) {
        return String(a || "").trim() === String(b || "").trim();
      }

      function getSettingsMismatches(expected) {
        const current = readSettingsValuesStrict();
        if (!current) return { current: null, mismatches: ["form-not-ready"] };
        const out = [];
        if (typeof expected.favicon === "string" && expected.favicon.length) {
          if (!sameText(current.favicon, expected.favicon)) out.push("favicon");
        }
        if (typeof expected.head === "string" && expected.head.length) {
          if (!sameText(current.head, expected.head)) out.push("head");
        }
        if (typeof expected.body === "string" && expected.body.length) {
          if (!sameText(current.body, expected.body)) out.push("body");
        }
        return { current, mismatches: out };
      }

      async function verifySavedSettingsAndRepair(expected, attempts = 2) {
        const hasExpectedPayload =
          !!String(expected?.favicon || "").trim() ||
          !!String(expected?.head || "").trim() ||
          !!String(expected?.body || "").trim();
        if (!hasExpectedPayload) return true;

        for (let i = 0; i < attempts; i += 1) {
          try {
            await waitForSettingsFormReady(12000);
          } catch {
            // After clicking final Save, some variants navigate/hide settings form.
            // In that case, do not block finalization.
            log(`settings form not visible after save (${i + 1}/${attempts}) -> assume persisted`);
            setSettingsPersistStatus("ok");
            return true;
          }
          const check = getSettingsMismatches(expected);
          if (check.mismatches.length === 0) {
            log(`settings persisted verified (${i + 1}/${attempts})`);
            setSettingsPersistStatus("ok");
            return true;
          }

          log(`settings mismatch (${i + 1}/${attempts}): ${check.mismatches.join(", ")}`);
          if (check.mismatches.includes("favicon")) {
            await retryFieldFill("favicon repair", () => fillFaviconStrict(expected.favicon, 60000), 2);
            await sleepScaled(350);
          }
          if (check.mismatches.includes("head")) {
            await retryFieldFill("head repair", () => fillHeadTrackingStrict(expected.head, 60000), 2);
            await sleepScaled(350);
          }
          if (check.mismatches.includes("body")) {
            await retryFieldFill("body repair", () => fillBodyTrackingStrict(expected.body, 60000), 2);
            await sleepScaled(350);
          }

          await clickFinalSaveStrict(45000);
          await waitForUiSettle("post-save repair", 30000);
          await sleepScaled(500);
        }

        const finalCheck = getSettingsMismatches(expected);
        if (finalCheck.mismatches.length) {
          setSettingsPersistStatus("fail", finalCheck.mismatches.join(","));
          log(`WARNING: settings validation mismatch after retries: ${finalCheck.mismatches.join(", ")}`);
          return false;
        }
        setSettingsPersistStatus("ok");
        return true;
      }

      async function clickFinalSaveStrict(timeoutMs = 45000) {
        const target = await waitFor(() => {
          const card = document.querySelector("div.my-3.py-5.px-3.bg-white.rounded.hl-card");
          if (!card || !visible(card)) return null;

          const exact = [...card.querySelectorAll("button#delete-funnel")]
            .filter((el) => visible(el));
          const matches = exact.filter((el) => {
            const txt = norm(
              el.querySelector("span.n-button__content")?.textContent || el.textContent,
            );
            const disabled =
              el.hasAttribute("disabled") ||
              el.getAttribute("aria-disabled") === "true" ||
              el.classList.contains("disabled");
            return txt === "save" && !disabled;
          });
          if (matches.length !== 1) return null;
          return matches[0];
        }, timeoutMs, 220, "strict final save button #delete-funnel label Save");

        await sleep(280);
        fireSingleNativeClick(target);
        log("final save strict -> Save");
        await sleep(900);
      }

      async function selectWebsiteRadioStrict() {
        const label = await waitFor(() => {
          const el =
            document.querySelector("label#website.n-radio.hl-radio") ||
            document.querySelector("label#website") ||
            null;
          if (!visible(el)) return null;
          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            /disabled/i.test(String(el.className || ""));
          return disabled ? null : el;
        }, 45000, 220, "label#website available");

        await sleep(500);
        fireSingleNativeClick(label);
        log("radio website (strict label#website)");

        await waitFor(() => {
          const el = document.querySelector("label#website");
          if (!el) return false;
          const input = el.querySelector("input[type='radio'][value='website']");
          const byInput = !!input && input.checked === true;
          const byClass = /n-radio--checked/i.test(String(el.className || ""));
          return byInput || byClass;
        }, 10000, 180, "website radio checked");
      }

      function getFormLabelsText() {
        return [...document.querySelectorAll(".n-form-item-label, .n-form-item-label__text, label, h3, h4")]
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean);
      }

      async function waitForPostAddedRecordScreen(timeoutMs = 120000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
          const labels = getFormLabelsText();
          const joined = labels.join(" | ").toLowerCase();
          const hasLinkLabel =
            joined.includes("link domain with website") ||
            joined.includes("link domain with funnel") ||
            joined.includes("link domain with");
          const hasProductType =
            joined.includes("select product type") ||
            !!document.querySelector('input[type="radio"][value="website"], input[type="radio"][value="funnel"]');
          const hasDefaultStep =
            joined.includes("select default step/page for domain") ||
            joined.includes("select product type");

          if (hasLinkLabel || (hasProductType && hasDefaultStep)) {
            return { ok: true, labels };
          }
          await sleep(350);
        }
        return { ok: false, labels: getFormLabelsText() };
      }

      function isDomainContinueScreen() {
        const hasDomainInput = !!document.querySelector(
          "input[placeholder*='domain' i], input[aria-label*='domain' i], [id*='domain']",
        );
        const hasContinue = [...document.querySelectorAll("[id*='continue'], button, [role='button']")]
          .some((el) => visible(el) && norm(el.textContent) === "continue");
        return hasDomainInput && hasContinue;
      }

      function isManageOrHubReady() {
        const manage = document.querySelector(
          "[id*='manage-domain'], [data-testid='manage-domain'], button[id*='manage-domain']",
        );
        if (visible(manage)) return true;
        const hubTrigger = document.querySelector(
          "[id*='domain-hub-connected-product-table-drop-action-dropdown-trigger']",
        );
        return visible(hubTrigger);
      }

      async function advanceAfterVerifyToProductType() {
        const started = Date.now();
        const timeoutMs = 180000;

        // First, wait until verification modal is gone.
        await waitFor(() => {
          const verifyModal = document.querySelector("div.n-card.n-modal.hl-modal[role='dialog']");
          return !visible(verifyModal);
        }, 120000, 300, "verify modal closed");
        log("verify modal closed");

        while (Date.now() - started < timeoutMs) {
          const post = await waitForPostAddedRecordScreen(1200);
          if (post.ok) {
            log(
              `post-verify screen ready. labels: ${(post.labels || [])
                .slice(0, 4)
                .join(" | ")}`,
            );
            return { ok: true, labels: post.labels || [], mode: "product" };
          }

          if (isManageOrHubReady()) {
            log("post-verify path detected as manage/hub");
            return { ok: true, labels: getFormLabelsText(), mode: "manage" };
          }

          if (isDomainContinueScreen()) {
            log("post-verify path detected as domain+continue");
            await clickContinueCalmly();
            await sleep(1200);
            continue;
          }

          await sleep(450);
        }

        const labels = getFormLabelsText();
        if (isManageOrHubReady()) {
          log("post-verify timeout but manage/hub is visible -> continue");
          return { ok: true, labels, mode: "manage" };
        }
        log(
          `WARNING: Post-verify transition timeout. Labels: ${(labels || [])
            .slice(0, 8)
            .join(" || ")} -> continuing to manage flow`,
        );
        return { ok: true, labels, mode: "assume_manage" };
      }

      function hasVisibleLoading() {
        const loaders = [
          ...document.querySelectorAll(
            ".n-base-loading, .n-spin, .n-skeleton, .n-loading, [aria-label='loading']",
          ),
        ];
        return loaders.some((el) => visible(el));
      }

      async function waitForUiSettle(stage, timeoutMs = 90000) {
        await sleep(700);
        try {
          await waitFor(
            () => !hasVisibleLoading(),
            timeoutMs,
            240,
            `ui settle (${stage})`,
          );
          log(`ui settled -> ${stage}`);
        } catch {
          log(`ui settle timeout (soft) -> ${stage}`);
        }
        await sleep(520);
      }

      async function waitForDomainHubActionTriggerReady(timeoutMs = 120000) {
        await waitFor(() => {
          const trigger = document.querySelector(
            "[id*='domain-hub-connected-product-table-drop-action-dropdown-trigger']",
          );
          if (!visible(trigger)) return null;
          const disabled =
            trigger.hasAttribute("disabled") ||
            trigger.getAttribute("aria-disabled") === "true" ||
            trigger.classList.contains("disabled");
          if (disabled) return null;
          return trigger;
        }, timeoutMs, 240, "domain-hub action trigger ready");
        await sleep(550);
      }

      try {
        log("Run started");
        const runWarnings = [];
        await waitFor(() => document.readyState === "complete", 120000, 200, "document ready");
        await waitFor(
          () => String(location.href || "").includes("/settings/domain"),
          150000,
          320,
          "url /settings/domain",
        );
        await sleepScaled(3000);

        const connect = document.querySelector("[id*='connect-domain-button'], [id*='connect-domain-button-text'], [data-testid='connect-domain-button'], [id*='connect-domain'], button[id*='connect-domain']");
        const manage = document.querySelector("[id*='manage-domain'], [data-testid='manage-domain'], [id*='manage-domain'], button[id*='manage-domain']");
        const doConnect = visible(connect) || !visible(manage);

        if (doConnect) {
          // Prefer the actual CTA link in this page variant.
          const linkHit = await clickConnectDomainLink(12000);
          if (!linkHit) {
            if (visible(connect)) {
              fireClick(connect);
              log("connect entry clicked (selector)");
            } else {
              try {
                await clickByText("Connect a domain", "connect entry by text", 12000);
              } catch {
                log("connect entry text not found, trying direct flow selectors");
              }
            }
          }
          log("connect flow");
          await sleep(420);

          let ready = await waitForConnectUiReady(9000);
          if (!ready) {
            log("connect ui not ready, retry connect link");
            const hit = await clickConnectDomainLink(15000);
            if (!hit) {
              await clickByText("Connect a domain", "connect a domain link", 15000);
            }
            ready = await waitForConnectUiReady(12000);
          }
          if (!ready) {
            throw new Error("Connect UI did not open after clicking entry/link.");
          }

          // If we're already at the Domain + Continue screen, skip SITES button step.
          const isDomainContinueVariant = !!document.querySelector(
            "input[placeholder*='domain' i], input[aria-label*='domain' i]",
          );

          if (!isDomainContinueVariant) {
            try {
              await clickSel(
                "[id*='connect-button-SITES']",
                "connect-button-SITES",
                30000,
                { exactId: "connect-button-SITES" },
              );
            } catch {
              log("connect-button-SITES not found, continuing");
            }
          } else {
            log("domain+continue screen detected -> skip connect-button-SITES");
          }
          await fillDomainCalmly(input.domainToPaste);

          // Variant-aware step after domain input.
          if (document.querySelector("[id*='add-records']")) {
            await clickAddRecordsCalmly();
            await clickManualSubmitCalmly();
            await clickAddedRecordCalmly();
          } else {
            await clickContinueCalmly();
          }

          const postScreen = await advanceAfterVerifyToProductType();

          if (postScreen.mode === "product") {
            // Force Website product type when available.
            try {
              await selectWebsiteRadioStrict();
            } catch {
              const funnelRadio = document.querySelector("input[type='radio'][value='funnel']");
              if (funnelRadio && visible(funnelRadio)) {
                fireSingleNativeClick(funnelRadio);
                log("radio funnel (fallback: website radio missing)");
              } else {
                throw new Error("Website radio not found.");
              }
            }
            await sleep(350);

            // After selecting Website, wait for label to switch if UI is reactive.
            try {
              await waitFor(() => {
                const labels = getFormLabelsText().map((t) => norm(t));
                return labels.some((t) => t.includes("link domain with website"));
              }, 10000, 220, "label switched to website");
            } catch {
              log("website label switch not detected, using label fallback");
            }

            await openAndPickAnyLabel(
              ["Link domain with website", "Link domain with funnel"],
              "County",
            );
            await sleep(350);
            try {
              await openAndPick("Select default step/page for Domain", input.pageTypeNeedle || "Home Page");
            } catch {
              await openAndPick("Select product type", input.pageTypeNeedle || "Home Page");
            }

            const submit = document.querySelector("[id*='submit']");
            if (visible(submit)) {
              submit.click();
              log("submit clicked");
              await waitForUiSettle("after submit", 90000);
            }
          } else {
            log(`skip product form path -> ${postScreen.mode}`);
          }
        } else {
          log("skip connect flow (manage already visible)");
        }

        await waitForUiSettle("before manage-domain", 90000);
        await clickSel(["[id*='manage-domain']", "[data-testid='manage-domain']", "[id*='manage-domain']", "button[id*='manage-domain']"], "manage-domain", 240000);
        await waitForUiSettle("after manage-domain click", 120000);
        await waitForDomainHubActionTriggerReady(120000);
        await openActionMenuAndPickExact(
          "XML Sitemap",
          "[id*='domain-hub-connected-product-table-drop-action-dropdown-trigger']",
          120000,
        );

        const collapse = document.querySelector(".n-collapse-item__header-main");
        if (visible(collapse)) {
          collapse.click();
          log("collapse opened");
        }

        await selectAsteriskPageCheckboxes();

        await clickPositiveModalActionStrict("Proceed", 45000);
        await clickPositiveModalActionStrict("Generate & Save", 60000);
        await clickPositiveModalActionStrict("Okay", 60000);
        await waitForUiSettle("before edit menu", 90000);
        await waitForDomainHubActionTriggerReady(120000);

        await openActionMenuAndPickExact(
          "Edit",
          "[id*='domain-hub-connected-product-table-drop-action-dropdown-trigger']",
          120000,
        );

        if (input.robotsTxt) {
          await fillRobotsTxtInModalStrict(input.robotsTxt, 45000);
        }
        await clickPositiveModalActionStrict("Save", 45000);

        await clickBackButtonStrict(45000);

        await clickSbSitesStrict(45000);
        await clickTbWebsitesStrict(45000);

        await clickSel("[id*='table1-drop-action-dropdown-trigger']", "table1 dropdown");
        await clickCountyTableEntryStrict(45000);

        await clickSel("[id*='table1-drop-action-dropdown-trigger']", "table1 dropdown 2");
        const firstAction = document.querySelector(".n-dropdown-option-body__label");
        if (firstAction) {
          fireSingleNativeClick(firstAction);
          log("table1 first dropdown action clicked");
          await sleep(420);
        }

        let settingsPersisted = true;
        try {
          await clickSettingsTabStrict(45000);
          await waitForFunnelsSelectedMatch(input.domainToPaste, 20000);
          await waitForSettingsFormReady(30000);
          await waitForUiSettle("settings form render", 15000);

          if (input.faviconUrl) {
            await retryFieldFill("favicon", () => fillFaviconStrict(input.faviconUrl, 60000), 3);
            await sleepScaled(450);
          }
          if (input.headCode) {
            await retryFieldFill("head tracking", () => fillHeadTrackingStrict(input.headCode, 60000), 3);
            await sleepScaled(450);
          }
          if (input.bodyCode) {
            await retryFieldFill("body tracking", () => fillBodyTrackingStrict(input.bodyCode, 60000), 3);
            await sleepScaled(450);
          }

          await clickFinalSaveStrict(45000);
          await waitForUiSettle("after final save", 45000);
          const hasSettingsPayload =
            !!String(input.faviconUrl || "").trim() ||
            !!String(input.headCode || "").trim() ||
            !!String(input.bodyCode || "").trim();
          if (!hasSettingsPayload) {
            setSettingsPersistStatus("na");
          }
          const verifyOutcome = await Promise.race([
            verifySavedSettingsAndRepair(
              {
                favicon: String(input.faviconUrl || ""),
                head: String(input.headCode || ""),
                body: String(input.bodyCode || ""),
              },
              2,
            ),
            sleepScaled(25000).then(() => "__verify_timeout__"),
          ]);
          if (verifyOutcome === "__verify_timeout__") {
            settingsPersisted = false;
            runWarnings.push("settings_verify_timeout");
            setSettingsPersistStatus("na");
            log("WARNING: settings verify timeout -> continuing finalization");
          } else {
            settingsPersisted = Boolean(verifyOutcome);
          }
          if (!settingsPersisted) {
            runWarnings.push("settings_mismatch");
            log("continuing with warning: final settings verification returned mismatches");
          }
        } catch (settingsErr) {
          const msg = settingsErr instanceof Error ? settingsErr.message : String(settingsErr);
          if (/^STEP_SETTINGS_FUNNELS_(EMPTY|MISMATCH):/i.test(msg)) {
            runWarnings.push(`settings_funnels_guard:${msg}`);
            setSettingsPersistStatus("na");
            log(`WARNING: settings funnels guard -> ${msg} (continuing)`);
            // Do not block account completion if this strict guard misses.
          } else {
            runWarnings.push(`settings_phase_skipped:${msg}`);
            setSettingsPersistStatus("na");
            log(`WARNING: settings phase skipped -> ${msg}`);
          }
        }

        log("DONE");
        return { ok: true, logs: allLogs, warnings: runWarnings };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        setSettingsPersistStatus("fail");
        log(`ERROR: ${error}`);
        return { ok: false, error, href: location.href, logs: allLogs };
      }
    },
    args: [payload],
  });

  return result || { ok: false, error: "No result from executeScript." };
}

async function runLocalDomainBot(payload) {
  const url = String(payload?.activationUrl || "").trim();
  if (!url) throw new Error("Missing activationUrl for local bot.");

  let tabId = null;
  let reused = false;
  const closeAfterRun = payload?.closeAfterRun !== false;
  const isTabClosedError = (err) => {
    const msg = String(err instanceof Error ? err.message : err || "").toLowerCase();
    return (
      msg.includes("activation tab was closed by user") ||
      msg.includes("no tab with id") ||
      msg.includes("tabs cannot be edited right now") ||
      msg.includes("tab was closed")
    );
  };

  const closeRunSurface = async () => {
    if (!tabId) return;
    const targetTabId = tabId;
    tabId = null;
    try {
      await chrome.tabs.remove(targetTabId);
    } catch {}

    if (!botRuntime.watchWindowId) return;
    const win = await chrome.windows.get(botRuntime.watchWindowId, { populate: true }).catch(() => null);
    if (!win) {
      botRuntime.watchWindowId = null;
      return;
    }
    const remainingTabs = Array.isArray(win.tabs) ? win.tabs.length : 0;
    if (remainingTabs <= 0) {
      try {
        await chrome.windows.remove(win.id);
      } catch {}
      botRuntime.watchWindowId = null;
    }
  };

  if (botRuntime.watchWindowId) {
    const existingWin = await chrome.windows.get(botRuntime.watchWindowId, { populate: true }).catch(() => null);
    const existingTabId = existingWin?.tabs?.[0]?.id || null;
    if (existingTabId) {
      await chrome.tabs.update(existingTabId, { url, active: true });
      await chrome.windows.update(existingWin.id, { focused: true });
      tabId = existingTabId;
      reused = true;
    }
  }

  if (!tabId) {
    const createdWindow = await chrome.windows.create({
      url,
      focused: true,
      type: "normal",
    });
    tabId = createdWindow?.tabs?.[0]?.id || null;
    botRuntime.watchWindowId = createdWindow?.id || null;
  }

  if (!tabId) throw new Error("Could not create activation window/tab.");

  const resolveExecutionProfile = async () => {
    const explicit = String(payload?.executionProfile || "").trim().toLowerCase();
    if (explicit === "fast" || explicit === "normal" || explicit === "safe") return explicit;
    const stored = await chrome.storage.local.get([EXT_EXECUTION_PROFILE_KEY]);
    const raw = String(stored?.[EXT_EXECUTION_PROFILE_KEY] || "").trim().toLowerCase();
    return raw === "fast" || raw === "normal" || raw === "safe" ? raw : "safe";
  };

  try {
    const executionProfile = await resolveExecutionProfile();
    let attempt = 0;
    while (attempt < 2) {
      attempt += 1;
      try {
        await waitTabLoaded(tabId, 150000);
        await sleep(reused ? 900 : 1200);
        return await runInTab(tabId, { ...payload, executionProfile });
      } catch (err) {
        if (attempt < 2 && isTabClosedError(err)) {
          try {
            if (botRuntime.watchWindowId) {
              await chrome.windows.remove(botRuntime.watchWindowId);
            }
          } catch {}
          botRuntime.watchWindowId = null;
          tabId = null;
          const createdWindow = await chrome.windows.create({
            url,
            focused: true,
            type: "normal",
          });
          tabId = createdWindow?.tabs?.[0]?.id || null;
          botRuntime.watchWindowId = createdWindow?.id || null;
          reused = false;
          if (!tabId) {
            throw new Error("Could not recreate activation window/tab after manual close.");
          }
          continue;
        }
        throw err;
      }
    }
    throw new Error("Unexpected bot runner state.");
  } finally {
    if (closeAfterRun) {
      await closeRunSurface();
    }
  }
}

function isBridgeInjectableUrl(url) {
  const u = String(url || "");
  return (
    /^https:\/\/(?:[^/]+\.)?devasks\.com\//i.test(u) ||
    /^https:\/\/(?:[^/]+\.)?mydripnurse\.com\//i.test(u) ||
    /^https:\/\/www\.telahagocrecer\.com\//i.test(u) ||
    /^https:\/\/(?:[^/]+\.)?telahagocrecer\.com\//i.test(u) ||
    /^https:\/\/[^/]+\.onrender\.com\//i.test(u) ||
    /^https:\/\/[^/]+\.vercel\.app\//i.test(u) ||
    /^http:\/\/localhost(?::\d+)?\//i.test(u) ||
    /^http:\/\/127\.0\.0\.1(?::\d+)?\//i.test(u)
  );
}

async function ensureBridgeInjected(tabId, url) {
  const targetUrl = String(url || "");
  if (!tabId || !isBridgeInjectableUrl(targetUrl)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["bridge-content.js"],
    });
  } catch {
    // Ignore restricted tabs and transient navigation states.
  }
}

async function reinjectBridgeInAllOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map((tab) => ensureBridgeInjected(tab.id, tab.url)),
    );
  } catch {
    // no-op
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DELTA_SET_BADGE_COUNT") {
    const count = Math.max(0, Number(message?.count || 0));
    const severity = normalizeSeverity(message?.severity || "low");
    chrome.storage.local
      .set({ [EXT_BADGE_STORAGE_KEY]: count, [EXT_BADGE_SEVERITY_STORAGE_KEY]: severity })
      .then(() => applyExtensionBadge(count, severity))
      .then(() => sendResponse({ ok: true, count, severity }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    return true;
  }

  if (message?.type !== "DELTA_LOCAL_BOT_RUN") return undefined;
  const payload = message.payload || {};
  const requestId = String(message.requestId || "").trim();
  const locationId = String(payload?.locationId || payload?.locId || "").trim();
  const activationUrl = String(payload?.activationUrl || "").trim();
  const runKey = requestId || locationId || activationUrl || `run-${Date.now()}`;

  if (botRuntime.running) {
    if (botRuntime.activeKey === runKey && botRuntime.activePromise) {
      botRuntime.activePromise
        .then((result) => {
          sendResponse(result || { ok: false, error: "Empty result from active run." });
        })
        .catch((err) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return true;
    }

    sendResponse({
      ok: false,
      error: "Bot already running. Wait until current account finishes.",
    });
    return true;
  }

  botRuntime.running = true;
  botRuntime.activeKey = runKey;
  botRuntime.activePromise = runLocalDomainBot(payload);

  botRuntime.activePromise
    .then((result) => {
      sendResponse(result || { ok: false, error: "Empty result from runLocalDomainBot." });
    })
    .catch((err) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      botRuntime.running = false;
      botRuntime.activeKey = "";
      botRuntime.activePromise = null;
    });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void reinjectBridgeInAllOpenTabs();
  void hydrateBadgeFromStorage();
  chrome.alarms.create(EXT_BADGE_ALARM, { periodInMinutes: 1 });
  void refreshBadgeFromApi();
});

chrome.runtime.onStartup.addListener(() => {
  void reinjectBridgeInAllOpenTabs();
  void hydrateBadgeFromStorage();
  chrome.alarms.create(EXT_BADGE_ALARM, { periodInMinutes: 1 });
  void refreshBadgeFromApi();
});

void hydrateBadgeFromStorage();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== EXT_BADGE_ALARM) return;
  void refreshBadgeFromApi();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  void ensureBridgeInjected(tabId, tab?.url || "");
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    void ensureBridgeInjected(tabId, tab?.url || "");
  } catch {
    // ignore
  }
});

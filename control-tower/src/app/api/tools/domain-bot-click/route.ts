import { NextResponse } from "next/server";
import { execFile } from "child_process";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeAppleScriptString(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

async function openDomainPageInBrowser(browserApp: string, url: string) {
  const script = `
tell application "${escapeAppleScriptString(browserApp)}"
  activate
  if (count of windows) = 0 then
    make new window
  end if
  tell front window
    set t to make new tab with properties {URL:"${escapeAppleScriptString(url)}"}
    set active tab index to (count of tabs)
  end tell
end tell
`;
  await runAppleScript(script);
}

async function executeJavaScriptOnMatchingTab(
  browserApp: string,
  urlNeedle: string,
  js: string,
): Promise<string> {
  const script = `
tell application "${escapeAppleScriptString(browserApp)}"
  if (count of windows) = 0 then return "no-window"
  set needle to "${escapeAppleScriptString(urlNeedle)}"
  repeat with w in windows
    set tabCount to (count of tabs of w)
    repeat with i from 1 to tabCount
      set t to tab i of w
      try
        set u to URL of t
      on error
        set u to ""
      end try
      if u contains needle then
        set active tab index of w to i
        set index of w to 1
        activate
        try
          set resultValue to (execute t javascript "${escapeAppleScriptString(js)}")
          return resultValue
        on error errMsg
          return "script-error:" & errMsg
        end try
      end if
    end repeat
  end repeat
  return "no-matching-tab:" & needle
end tell
`;
  return runAppleScript(script);
}

async function tryClickButtonsInActiveTab(
  browserApp: string,
  locationId: string,
  attempt: number,
  maxAttempts: number,
): Promise<string> {
  const js = `(function(){
  var CONNECT_ID = "connect-domain-button";
  var CONNECT_FALLBACK_ID = "connect-domain-button-text";
  var MANAGE_ID = "manage-domain";
  var ATTEMPT = ${attempt};
  var MAX_ATTEMPTS = ${maxAttempts};

  function setStatus(text, tone) {
    var id = "__ct_domain_bot_status";
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.position = "fixed";
      el.style.right = "12px";
      el.style.bottom = "12px";
      el.style.zIndex = "2147483647";
      el.style.padding = "8px 10px";
      el.style.borderRadius = "8px";
      el.style.font = "12px/1.25 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif";
      el.style.boxShadow = "0 6px 20px rgba(0,0,0,.35)";
      document.body.appendChild(el);
    }
    el.style.background = tone === "ok" ? "rgba(16,185,129,.92)" : tone === "warn" ? "rgba(234,179,8,.92)" : "rgba(51,65,85,.92)";
    el.style.color = "white";
    el.textContent = "[DomainBot " + ATTEMPT + "/" + MAX_ATTEMPTS + "] " + text;
  }

  function isVisible(el) {
    if (!el) return false;
    var st = window.getComputedStyle(el);
    if (!st) return true;
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity || "1") === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function fireClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}
    var events = ["pointerdown", "mousedown", "mouseup", "click"];
    for (var i = 0; i < events.length; i++) {
      try {
        el.dispatchEvent(new MouseEvent(events[i], { bubbles: true, cancelable: true, view: window }));
      } catch {}
    }
    try {
      var rect = el.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var topEl = document.elementFromPoint(cx, cy);
      if (topEl && topEl !== el) {
        try { topEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); } catch {}
      }
    } catch {}
    try { if (typeof el.click === "function") el.click(); } catch {}
    return true;
  }

  function asClickable(el) {
    if (!el) return null;
    if (el.closest) {
      var parentBtn = el.closest("button,[role='button'],a,[onclick],[class*='btn'],[class*='button']");
      if (parentBtn) return parentBtn;
    }
    return el;
  }

  function findInRoot(root, id) {
    if (!root) return null;
    var direct = null;
    try { direct = root.getElementById ? root.getElementById(id) : null; } catch {}
    if (direct) return direct;
    try {
      if (root.querySelector) {
        var qs = root.querySelector("#" + id);
        if (qs) return qs;
      }
    } catch {}
    var all = [];
    try { all = root.querySelectorAll ? root.querySelectorAll("*") : []; } catch {}
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n && n.shadowRoot) {
        var found = findInRoot(n.shadowRoot, id);
        if (found) return found;
      }
    }
    return null;
  }

  function findWithFrameFallback(id) {
    var own = findInRoot(document, id);
    if (own) return own;
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      try {
        var d = f.contentWindow && f.contentWindow.document;
        if (!d) continue;
        var hit = findInRoot(d, id);
        if (hit) return hit;
      } catch {}
    }
    return null;
  }

  function listRoots() {
    var roots = [document];
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      try {
        var d = f.contentWindow && f.contentWindow.document;
        if (d) roots.push(d);
      } catch {}
    }
    return roots;
  }

  function collectSelectorHits(selector) {
    var hits = [];
    var roots = listRoots();
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      try {
        var list = root.querySelectorAll(selector);
        for (var j = 0; j < list.length; j++) hits.push(list[j]);
      } catch {}
      try {
        var all = root.querySelectorAll("*");
        for (var k = 0; k < all.length; k++) {
          var n = all[k];
          if (n && n.shadowRoot) {
            try {
              var inner = n.shadowRoot.querySelectorAll(selector);
              for (var z = 0; z < inner.length; z++) hits.push(inner[z]);
            } catch {}
          }
        }
      } catch {}
    }
    return hits;
  }

  function normalizeText(v) {
    return String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function pickClickableCandidates(nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var base = asClickable(nodes[i]);
      if (!base) continue;
      if (!isVisible(base)) continue;
      if (base.disabled || base.getAttribute("aria-disabled") === "true") continue;
      out.push(base);
    }
    return out;
  }

  function clickFirstBySelectors(selectors, reasonLabel) {
    var all = [];
    for (var i = 0; i < selectors.length; i++) {
      var hits = collectSelectorHits(selectors[i]);
      for (var j = 0; j < hits.length; j++) all.push(hits[j]);
    }
    var candidates = pickClickableCandidates(all);
    if (!candidates.length) return { ok: false, reason: "not-found:" + reasonLabel };
    fireClick(candidates[0]);
    return { ok: true, reason: "clicked:" + reasonLabel };
  }

  function clickByTextTokens(reasonLabel, tokenGroups) {
    var roots = listRoots();
    var raw = [];
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      try {
        var nodes = root.querySelectorAll("button,[role='button'],a,span,div");
        for (var j = 0; j < nodes.length; j++) raw.push(nodes[j]);
      } catch {}
    }
    var candidates = pickClickableCandidates(raw);
    for (var g = 0; g < tokenGroups.length; g++) {
      var group = tokenGroups[g];
      for (var c = 0; c < candidates.length; c++) {
        var txt = normalizeText(candidates[c].innerText || candidates[c].textContent);
        var ok = true;
        for (var t = 0; t < group.length; t++) {
          if (txt.indexOf(group[t]) < 0) {
            ok = false;
            break;
          }
        }
        if (ok) {
          fireClick(candidates[c]);
          return { ok: true, reason: "clicked:" + reasonLabel + ":text=" + group.join("+") };
        }
      }
    }
    return { ok: false, reason: "not-found-text:" + reasonLabel };
  }

  function clickConnectDomainStrict() {
    var exact = clickFirstBySelectors(
      [
        "button#connect-domain-button",
        "button[data-testid='connect-domain-button']",
        "button[aria-label='Connect a domain']",
        "#connect-domain-button-text"
      ],
      "connect-domain-strict"
    );
    if (exact.ok) return exact;
    var textNode = collectSelectorHits("#connect-domain-button-text")[0];
    if (textNode && textNode.closest) {
      var parentBtn = textNode.closest("button");
      if (parentBtn && isVisible(parentBtn)) {
        fireClick(parentBtn);
        return { ok: true, reason: "clicked:connect-domain-button-text.closest(button)" };
      }
    }
    return { ok: false, reason: "not-found:connect-domain-strict" };
  }

  function hasBusyUi() {
    var busySelectors = [
      "[aria-busy='true']",
      "[role='progressbar']",
      ".spinner",
      ".loading",
      ".loader"
    ];
    for (var i = 0; i < busySelectors.length; i++) {
      try {
        if (document.querySelector(busySelectors[i])) return true;
      } catch {}
    }
    return false;
  }

  function clickById(id) {
    var target = findWithFrameFallback(id);
    if (!target) return { ok: false, reason: "not-found:" + id };
    var clickable = asClickable(target);
    var visible = isVisible(clickable);
    if (!visible) return { ok: false, reason: "hidden:" + id };
    fireClick(clickable);
    return { ok: true, reason: "clicked:" + id };
  }

  if (document.readyState !== "complete") {
    setStatus("Waiting DOM ready (" + document.readyState + ")", "warn");
    return "waiting:dom:" + document.readyState + " href=" + location.href;
  }

  if (hasBusyUi()) {
    setStatus("Waiting page assets/components...", "warn");
    return "waiting:busy-ui href=" + location.href;
  }

  var dividerReady = collectSelectorHits('[data-testid="connect-domain-divider"]').length > 0;
  if (!dividerReady) {
    setStatus("Waiting connect-domain section...", "warn");
    return "waiting:connect-domain-divider href=" + location.href;
  }

  if (!String(location.href || "").includes("/settings/domain")) {
    setStatus("Waiting domain settings page...", "warn");
    return "waiting:url href=" + location.href;
  }

  setStatus("Searching target button...", "idle");
  var c = clickConnectDomainStrict();
  if (!c.ok) c = clickById(CONNECT_ID);
  if (!c.ok) c = clickById(CONNECT_FALLBACK_ID);
  if (!c.ok) {
    c = clickFirstBySelectors(
      [
        "#connect-domain-button",
        "#connect-domain-button-text",
        "[data-testid='connect-domain-button']",
        "[data-test='connect-domain-button']",
        "[name='connect-domain-button']",
        "[id*='connect-domain']",
        "[id*='connectDomain']",
        "[class*='connect-domain']",
        "[class*='connectDomain']",
        "button[id*='connect-domain']",
        "button[class*='connect-domain']",
        "[role='button'][id*='connect-domain']"
      ],
      "connect-domain-selector"
    );
  }
  if (!c.ok) {
    c = clickByTextTokens("connect-domain-text", [
      ["connect", "domain"],
      ["connect"],
      ["add", "domain"]
    ]);
  }
  if (c.ok) {
    setStatus("Clicked " + c.reason.replace("clicked:", "#"), "ok");
    return c.reason;
  }
  var m = clickById(MANAGE_ID);
  if (!m.ok) {
    m = clickFirstBySelectors(
      [
        "#manage-domain",
        "[data-testid='manage-domain']",
        "[data-test='manage-domain']",
        "[id*='manage-domain']",
        "[id*='manageDomain']",
        "[class*='manage-domain']",
        "[class*='manageDomain']",
        "button[id*='manage-domain']",
        "button[class*='manage-domain']",
        "[role='button'][id*='manage-domain']"
      ],
      "manage-domain-selector"
    );
  }
  if (!m.ok) {
    m = clickByTextTokens("manage-domain-text", [
      ["manage", "domain"],
      ["manage"]
    ]);
  }
  if (m.ok) {
    setStatus("Clicked #manage-domain", "ok");
    return m.reason;
  }

  setStatus("Button not found yet...", "warn");
  return "not-found connect=" + c.reason + " manage=" + m.reason + " href=" + location.href + " ready=" + document.readyState;
})();`;

  const needle = `/v2/location/${encodeURIComponent(locationId)}/settings/domain`;
  return executeJavaScriptOnMatchingTab(browserApp, needle, js);
}

export async function POST(req: Request) {
  try {
    const isMacLocal = process.platform === "darwin" && !process.env.VERCEL;
    if (!isMacLocal) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "domain-bot-click is only supported on local macOS runtime. Deploy a browser worker for cloud environments.",
        },
        { status: 501 },
      );
    }

    const body = (await req.json().catch(() => null)) as
      | { locationId?: string; browserApp?: string; maxAttempts?: number; intervalMs?: number }
      | null;
    const locationId = s(body?.locationId);
    if (!locationId) {
      return NextResponse.json({ ok: false, error: "Missing locationId" }, { status: 400 });
    }

    const browserApp = s(body?.browserApp) || "Google Chrome";
    const maxAttempts = Math.max(1, Math.min(240, Number(body?.maxAttempts || 60)));
    const intervalMs = Math.max(150, Math.min(3000, Number(body?.intervalMs || 500)));
    const url = `https://app.devasks.com/v2/location/${encodeURIComponent(locationId)}/settings/domain`;

    await openDomainPageInBrowser(browserApp, url);
    await sleep(1200);

    let lastResult = "not-started";
    for (let i = 0; i < maxAttempts; i += 1) {
      const out = s(await tryClickButtonsInActiveTab(browserApp, locationId, i + 1, maxAttempts));
      lastResult = out;
      if (out.startsWith("clicked:")) {
        return NextResponse.json({
          ok: true,
          locationId,
          browserApp,
          url,
          clicked: out.replace("clicked:", ""),
          attempts: i + 1,
        });
      }
      await sleep(intervalMs);
    }

    return NextResponse.json(
      {
        ok: false,
        locationId,
        browserApp,
        url,
        error:
          `Buttons not found after retries. Expected #connect-domain-button (or #connect-domain-button-text) / #manage-domain.`,
        lastResult,
      },
      { status: 408 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

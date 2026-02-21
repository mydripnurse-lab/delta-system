import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "2mb" }));

function s(v) {
  return String(v ?? "").trim();
}

function n(v, fallback, min, max) {
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureScreenshotDataUrl(page, label) {
  try {
    if (!page || page.isClosed()) return "";
    const shot = await page.screenshot({
      fullPage: true,
      type: "jpeg",
      quality: 60,
    });
    return `data:image/jpeg;base64,${shot.toString("base64")}`;
  } catch (e) {
    return `capture-failed:${label}:${e instanceof Error ? e.message : String(e)}`;
  }
}

function deepRender(value, variables) {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) =>
      s(variables?.[key]),
    );
  }
  if (Array.isArray(value)) return value.map((x) => deepRender(x, variables));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepRender(v, variables);
    return out;
  }
  return value;
}

function parseAuthToken(req) {
  const bearer = s(req.headers.authorization).replace(/^Bearer\s+/i, "");
  const apiKey = s(req.headers["x-api-key"]);
  return bearer || apiKey;
}

function assertAuthorized(req, res) {
  const required = s(process.env.WORKER_API_KEY);
  if (!required) return true;
  const got = parseAuthToken(req);
  if (got && got === required) return true;
  res.status(401).json({ ok: false, error: "Unauthorized worker request" });
  return false;
}

function pickLocator(page, selector, text) {
  const sel = s(selector);
  const txt = s(text);
  if (sel) return page.locator(sel).first();
  if (txt) return page.getByText(txt, { exact: false }).first();
  return null;
}

async function runSteps(page, steps, variables, outLog) {
  if (!Array.isArray(steps) || steps.length === 0) return { ok: false, reason: "no-steps" };
  const defaultStepDelayMs = n(process.env.WORKER_STEP_DELAY_MS, 220, 0, 5000);

  for (let i = 0; i < steps.length; i += 1) {
    const step = deepRender(steps[i] || {}, variables);
    const action = s(step.action).toLowerCase();
    const timeout = n(step.timeoutMs, 20_000, 500, 120_000);
    const selector = s(step.selector);
    const text = s(step.text);
    const key = s(step.valueKey);
    const rawValue = step.value;
    const value = key ? s(variables?.[key]) : s(rawValue);

    if (!action) return { ok: false, reason: `step-${i + 1}:missing-action` };
    outLog.push(`step ${i + 1}: start ${action}`);

    try {
      if (action === "goto") {
        const target = s(step.url);
        if (!target) return { ok: false, reason: `step-${i + 1}:missing-url` };
        await page.goto(target, { waitUntil: "domcontentloaded", timeout });
        outLog.push(`step ${i + 1}: goto ${target}`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "wait_ms") {
        await sleep(n(step.ms, 500, 50, 60_000));
        outLog.push(`step ${i + 1}: wait_ms`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "wait_for_timeout") {
        await sleep(n(step.ms, 500, 50, 60_000));
        outLog.push(`step ${i + 1}: wait_for_timeout`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "wait_for_selector") {
        if (!selector) return { ok: false, reason: `step-${i + 1}:missing-selector` };
        await page.waitForSelector(selector, { timeout, state: "visible" });
        outLog.push(`step ${i + 1}: wait_for_selector ${selector}`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "wait_for_url_contains") {
        const needle = s(step.value || step.urlContains || step.url || "");
        if (!needle) return { ok: false, reason: `step-${i + 1}:missing-url-needle` };
        await page.waitForFunction(
          (x) => String(window.location.href || "").includes(String(x || "")),
          needle,
          { timeout },
        );
        outLog.push(`step ${i + 1}: wait_for_url_contains ${needle}`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "evaluate") {
        const script = s(step.script);
        if (!script) return { ok: false, reason: `step-${i + 1}:missing-script` };
        const result = await page.evaluate(
          ({ code, args }) => {
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            // eslint-disable-next-line no-new-func
            const fn = new AsyncFunction("args", code);
            return fn(args);
          },
          { code: script, args: step.args || {} },
        );
        outLog.push(`step ${i + 1}: evaluate`);
        if (step.expect) {
          const exp = s(step.expect).toLowerCase();
          const got = s(result).toLowerCase();
          if (exp && !got.includes(exp)) {
            return { ok: false, reason: `step-${i + 1}:evaluate-expect-failed got=${s(result)}` };
          }
        }
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "close_page") {
        outLog.push(`step ${i + 1}: close_page`);
        await page.close({ runBeforeUnload: true });
        return { ok: true, reason: "page-closed" };
      }

      const locator = pickLocator(page, selector, text);
      if (!locator) return { ok: false, reason: `step-${i + 1}:missing-selector-or-text` };

      if (action === "click") {
        await locator.click({ timeout });
        outLog.push(`step ${i + 1}: click`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "fill") {
        await locator.fill(value, { timeout });
        outLog.push(`step ${i + 1}: fill`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "type") {
        await locator.type(value, { timeout });
        outLog.push(`step ${i + 1}: type`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "press") {
        await locator.press(s(step.key) || "Enter", { timeout });
        outLog.push(`step ${i + 1}: press`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }
      if (action === "select") {
        await locator.selectOption(value, { timeout });
        outLog.push(`step ${i + 1}: select`);
        await sleep(n(step.postDelayMs, defaultStepDelayMs, 0, 10000));
        continue;
      }

      return { ok: false, reason: `step-${i + 1}:unsupported-action:${action}` };
    } catch (error) {
      return {
        ok: false,
        reason: `step-${i + 1}:${action}:failed:${error instanceof Error ? error.message : String(error)}`,
        screenshotDataUrl: await captureScreenshotDataUrl(page, `step-${i + 1}`),
      };
    }
  }

  return { ok: true, reason: "steps-completed" };
}

async function runDefaultDomainAction(page, maxAttempts, intervalMs, outLog) {
  const selectors = [
    "button#connect-domain-button",
    "button[data-testid='connect-domain-button']",
    "#connect-domain-button",
    "#connect-domain-button-text",
    "#manage-domain"
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const selector of selectors) {
      const loc = page.locator(selector).first();
      const count = await loc.count();
      if (count > 0) {
        try {
          await loc.click({ timeout: 1200 });
          outLog.push(`attempt ${attempt}: clicked ${selector}`);
          return { ok: true, clicked: selector, attempts: attempt, lastResult: `clicked:${selector}` };
        } catch {
          outLog.push(`attempt ${attempt}: present-but-not-clickable ${selector}`);
        }
      }
    }
    outLog.push(`attempt ${attempt}: no target yet`);
    await sleep(intervalMs);
  }

  return {
    ok: false,
    clicked: "",
    attempts: maxAttempts,
    lastResult: "not-found connect/manage selector after retries",
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "domain-bot-worker", ts: new Date().toISOString() });
});

app.post("/run", async (req, res) => {
  if (!assertAuthorized(req, res)) return;

  const body = req.body || {};
  const locationId = s(body.locationId);
  const openActivationUrl = s(body.openActivationUrl);
  const providedUrl = s(body.url);
  const targetUrl = openActivationUrl || providedUrl;

  if (!locationId) {
    return res.status(400).json({ ok: false, error: "Missing locationId" });
  }
  if (!targetUrl) {
    return res.status(400).json({ ok: false, error: "Missing url/openActivationUrl" });
  }

  const maxAttempts = n(body.maxAttempts, 120, 1, 400);
  const intervalMs = n(body.intervalMs, 700, 100, 5000);
  const navigationTimeoutMs = n(process.env.WORKER_NAV_TIMEOUT_MS, 60_000, 5_000, 180_000);

  const logs = [];
  const startAt = Date.now();

  let browser;
  let page;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
    logs.push(`goto ok: ${targetUrl}`);

    const steps = Array.isArray(body.steps) ? body.steps : [];
    let result;

    if (steps.length > 0) {
      const stepResult = await runSteps(page, steps, body.variables || {}, logs);
      if (!stepResult.ok) {
        return res.status(408).json({
          ok: false,
          error: "Step execution failed",
          lastResult: stepResult.reason,
          screenshotDataUrl: s(stepResult.screenshotDataUrl),
          attempts: 0,
          clicked: "",
          elapsedMs: Date.now() - startAt,
          logs,
        });
      }
      result = {
        ok: true,
        clicked: "steps",
        attempts: 1,
        lastResult: stepResult.reason,
      };
    } else {
      result = await runDefaultDomainAction(page, maxAttempts, intervalMs, logs);
      if (!result.ok) {
        return res.status(408).json({
          ok: false,
          error: "Button not found after retries",
          lastResult: result.lastResult,
          screenshotDataUrl: await captureScreenshotDataUrl(page, "default-flow-not-found"),
          attempts: result.attempts,
          clicked: "",
          elapsedMs: Date.now() - startAt,
          logs,
        });
      }
    }

    return res.json({
      ok: true,
      clicked: result.clicked,
      attempts: result.attempts,
      lastResult: result.lastResult,
      elapsedMs: Date.now() - startAt,
      logs,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      screenshotDataUrl: await captureScreenshotDataUrl(page, "top-level-error"),
      attempts: 0,
      clicked: "",
      elapsedMs: Date.now() - startAt,
      logs,
    });
  } finally {
    try {
      if (page) await page.close();
    } catch {}
    try {
      if (browser) await browser.close();
    } catch {}
  }
});

const port = n(process.env.PORT, 3000, 1, 65535);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`domain-bot-worker listening on :${port}`);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitTabLoaded(tabId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
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

      function log(msg) {
        const line = `[${new Date().toLocaleTimeString()}] ${String(msg)}`;
        allLogs.push(line);

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
        const d = document.createElement("div");
        d.textContent = line;
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
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

      async function clickSel(selectors, label, timeoutMs = 120000) {
        const arr = Array.isArray(selectors) ? selectors : [selectors];
        const el = await waitFor(() => {
          for (const sel of arr) {
            const x = document.querySelector(sel);
            if (visible(x)) return x;
          }
          return null;
        }, timeoutMs, 260, label || arr.join(" | "));
        el.click();
        log(`click -> ${label || arr[0]}`);
        await sleep(320);
        return el;
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

      try {
        log("Run started");
        await waitFor(
          () => String(location.href || "").includes("/settings/domain"),
          150000,
          320,
          "url /settings/domain",
        );
        await sleep(3000);

        const connect = document.querySelector("#connect-domain-button, #connect-domain-button-text, [data-testid='connect-domain-button'], [id*='connect-domain'], button[id*='connect-domain']");
        const manage = document.querySelector("#manage-domain, [data-testid='manage-domain'], [id*='manage-domain'], button[id*='manage-domain']");
        const doConnect = visible(connect) || !visible(manage);

        if (doConnect) {
          if (visible(connect)) connect.click();
          log("connect flow");
          await sleep(420);
          await clickSel(["#connect-button-SITES", "[id*='connect-button-SITES']"], "connect-button-SITES");
          await fillSel([".n-input__input-el", "input[type='text']", "input[type='url']"], input.domainToPaste, "domain field");
          await clickSel(["#add-records", "[id*='add-records']"], "add-records");
          await clickSel(["#submit-manually", "[id*='submit-manually']"], "submit-manually");
          await clickSel(["#addedRecord", "[id*='addedRecord']"], "addedRecord");
          document.querySelector('input[type="radio"][value="website"]')?.click();
          log("radio website");
          await sleep(350);

          await openAndPick("Link domain with website", "County");
          await sleep(350);
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

        await clickSel(["#manage-domain", "[data-testid='manage-domain']", "[id*='manage-domain']", "button[id*='manage-domain']"], "manage-domain", 240000);
        await clickSel("#domain-hub-connected-product-table-drop-action-dropdown-trigger", "product action dropdown");
        const xml = [...document.querySelectorAll(".n-dropdown-option-body__label")].find((el) => (el.textContent || "").trim() === "XML Sitemap");
        if (xml) {
          xml.click();
          log("XML Sitemap selected");
        }

        const collapse = document.querySelector(".n-collapse-item__header-main");
        if (visible(collapse)) {
          collapse.click();
          log("collapse opened");
        }

        const rows = [...document.querySelectorAll("div.flex.my-2.funnel-page")];
        let checked = 0;
        rows
          .filter((row) => ((row.querySelector("div.ml-2")?.textContent || "").trim().includes("**")))
          .forEach((row) => {
            const cb = row.querySelector("div.n-checkbox[role='checkbox']");
            const on = cb?.getAttribute("aria-checked") === "true";
            if (cb && !on) {
              cb.click();
              checked += 1;
            }
          });
        log(`checkboxes selected: ${checked}`);

        for (let i = 0; i < 3; i += 1) {
          const ok = document.querySelector("#modal-footer-btn-positive-action");
          if (visible(ok)) {
            ok.click();
            log(`modal positive ${i + 1}/3`);
            await sleep(400);
          }
        }

        await clickSel("#domain-hub-connected-product-table-drop-action-dropdown-trigger", "product action dropdown 2");
        const edit = [...document.querySelectorAll(".n-dropdown-option-body__label")].find((el) => (el.textContent || "").trim() === "Edit");
        if (edit) {
          edit.click();
          log("Edit selected");
        }

        if (input.robotsTxt) {
          await fillSel("textarea.n-input__textarea-el", input.robotsTxt, "robots textarea");
        }
        const saveModal = document.querySelector("#modal-footer-btn-positive-action");
        if (visible(saveModal)) {
          saveModal.click();
          log("modal save");
        }

        const back = document.querySelector("#backButtonv2");
        if (visible(back)) {
          back.click();
          log("back button");
        }
        await sleep(350);

        const sbSites = document.querySelector("#sb_sites");
        if (visible(sbSites)) {
          sbSites.click();
          await sleep(260);
          sbSites.click();
          log("sb_sites x2");
        }

        await clickSel("#table1-drop-action-dropdown-trigger", "table1 dropdown");
        const county = [...document.querySelectorAll("span")].find((el) => (el.textContent || "").trim() === "County");
        if (county) {
          county.click();
          log("County selected");
        }

        await clickSel("#table1-drop-action-dropdown-trigger", "table1 dropdown 2");
        const firstAction = document.querySelector(".n-dropdown-option-body__label");
        if (firstAction) {
          firstAction.click();
          log("first dropdown action clicked");
        }

        const settingsBtn = [...document.querySelectorAll(".hl-text-sm-medium")].find((el) => (el.textContent || "").trim() === "Settings");
        if (settingsBtn) {
          settingsBtn.click();
          log("Settings clicked");
        }

        if (input.faviconUrl) {
          await fillSel(["#faviconUrl input", ".faviconUrl input", ".faviconUrl .n-input__input-el"], input.faviconUrl, "favicon");
        }
        if (input.headCode) {
          await fillSel("textarea.n-input__textarea-el", input.headCode, "generic textarea head");
          await fillSel("#head-tracking-code textarea.n-input__textarea-el, #head-tracking-code .n-input__textarea-el", input.headCode, "head tracking");
        }
        if (input.bodyCode) {
          await fillSel("#body-tracking-code textarea.n-input__textarea-el, #body-tracking-code .n-input__textarea-el", input.bodyCode, "body tracking");
        }

        const finalSave = document.querySelector(".n-button.n-button--primary-type.n-button--medium-type.mt-3");
        if (visible(finalSave)) {
          finalSave.click();
          log("final save clicked");
        }

        log("DONE");
        return { ok: true, logs: allLogs };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
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

  let tab = null;
  const existing = await chrome.tabs.query({ url: ["https://app.devasks.com/*"] });
  if (existing?.length) {
    tab = existing[0];
    await chrome.tabs.update(tab.id, { active: true, url });
  } else {
    tab = await chrome.tabs.create({ url, active: true });
  }
  await waitTabLoaded(tab.id, 150000);
  await sleep(1200);
  return runInTab(tab.id, payload);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "DELTA_LOCAL_BOT_RUN") return undefined;

  runLocalDomainBot(message.payload || {})
    .then((result) => {
      sendResponse(result || { ok: false, error: "Empty result from runLocalDomainBot." });
    })
    .catch((err) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return true;
});

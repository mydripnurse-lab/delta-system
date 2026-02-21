function byId(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  byId("status").textContent = String(text || "");
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
      setStatus("Enter Activation URL first.");
      return;
    }
    await chrome.tabs.create({ url: payload.activationUrl });
    setStatus("Activation URL opened in new tab.");
  } catch (e) {
    setStatus(`Open failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

byId("runBtn").addEventListener("click", async () => {
  try {
    const payload = collectPayload();
    setStatus("Preparing tab...");
    let tab = await getActiveTab();
    if (!tab) throw new Error("No active tab.");

    if (payload.activationUrl && !String(tab.url || "").includes("/settings/domain")) {
      const newTab = await chrome.tabs.create({ url: payload.activationUrl, active: true });
      await waitTabLoaded(newTab.id);
      tab = newTab;
      await new Promise((r) => setTimeout(r, 1200));
    }

    setStatus("Running bot in tab... you can watch it live.");
    const result = await runInTab(tab.id, payload);
    if (result?.ok) setStatus("Done ✅");
    else setStatus(`Failed ❌\n${result?.error || "Unknown error"}`);
  } catch (e) {
    setStatus(`Run failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

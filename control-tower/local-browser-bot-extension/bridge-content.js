(() => {
  const bridgeId = `delta-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.__DELTA_LOCAL_BOT_BRIDGE_ACTIVE_ID = bridgeId;

  function isActiveBridge() {
    return window.__DELTA_LOCAL_BOT_BRIDGE_ACTIVE_ID === bridgeId;
  }

  function postReady() {
    if (!isActiveBridge()) return;
    window.postMessage(
      {
        type: "DELTA_LOCAL_BOT_BRIDGE_READY",
        source: "delta-local-bot-extension",
      },
      "*",
    );
  }

  postReady();

  window.addEventListener("message", (event) => {
  if (!isActiveBridge()) return;
  if (event.source !== window) return;
  const data = event.data || {};
  if (data.type === "DELTA_LOCAL_BOT_BRIDGE_PING") {
    postReady();
    return;
  }
  if (data.type !== "DELTA_LOCAL_BOT_RUN") return;

  try {
    if (!chrome?.runtime?.id) {
      // Let a newer injected bridge instance answer; avoid poisoning the request.
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "DELTA_LOCAL_BOT_RUN",
        requestId: data.requestId,
        payload: data.payload || {},
      },
      (response) => {
        if (!isActiveBridge()) return;
        const err = chrome.runtime.lastError;
        if (err) {
          if (/context invalidated/i.test(String(err.message || ""))) {
            // Stale context: suppress error and allow newest bridge to answer.
            return;
          }
          window.postMessage(
            {
              type: "DELTA_LOCAL_BOT_RESULT",
              requestId: data.requestId,
              ok: false,
              error: err.message || "Bridge runtime error",
            },
            "*",
          );
          return;
        }

        window.postMessage(
          {
            type: "DELTA_LOCAL_BOT_RESULT",
            requestId: data.requestId,
            ...(response || { ok: false, error: "No response from extension background." }),
          },
          "*",
        );
      },
    );
  } catch (e) {
    if (!isActiveBridge()) return;
    const msg = e instanceof Error ? e.message : "Bridge sendMessage failed";
    if (/context invalidated/i.test(String(msg))) return;
    window.postMessage(
      {
        type: "DELTA_LOCAL_BOT_RESULT",
        requestId: data.requestId,
        ok: false,
        error: msg,
      },
      "*",
    );
  }
  });
})();

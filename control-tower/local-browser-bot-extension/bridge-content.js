window.postMessage(
  {
    type: "DELTA_LOCAL_BOT_BRIDGE_READY",
    source: "delta-local-bot-extension",
  },
  "*",
);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data || {};
  if (data.type === "DELTA_LOCAL_BOT_BRIDGE_PING") {
    window.postMessage(
      {
        type: "DELTA_LOCAL_BOT_BRIDGE_READY",
        source: "delta-local-bot-extension",
      },
      "*",
    );
    return;
  }
  if (data.type !== "DELTA_LOCAL_BOT_RUN") return;

  try {
    if (!chrome?.runtime?.id) {
      window.postMessage(
        {
          type: "DELTA_LOCAL_BOT_RESULT",
          requestId: data.requestId,
          ok: false,
          error: "Extension context invalidated. Reload extension and refresh this page.",
        },
        "*",
      );
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "DELTA_LOCAL_BOT_RUN",
        requestId: data.requestId,
        payload: data.payload || {},
      },
      (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
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
    window.postMessage(
      {
        type: "DELTA_LOCAL_BOT_RESULT",
        requestId: data.requestId,
        ok: false,
        error: e instanceof Error ? e.message : "Bridge sendMessage failed",
      },
      "*",
    );
  }
});

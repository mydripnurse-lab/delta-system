window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data || {};
  if (data.type !== "DELTA_LOCAL_BOT_RUN") return;

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
});

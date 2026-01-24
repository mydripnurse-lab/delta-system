// public/ui/locations-widget.js
(function () {
    function withDefaults(config) {
        const cfg = config || {};
        return {
            statesIndexUrl: cfg.statesIndexUrl || "",
            redirectMode: cfg.redirectMode || "county",
            bookPath: cfg.bookPath || "/book-service",
            stickyBook: cfg.stickyBook !== false,
            placeholder: cfg.placeholder || "Choose your City, State, or Country",
        };
    }

    async function mount(selector, config) {
        const cfg = withDefaults(config);

        if (!cfg.statesIndexUrl) {
            throw new Error("statesIndexUrl is required");
        }

        const root = document.querySelector(selector);
        if (!root) {
            throw new Error(`Root element not found: ${selector}`);
        }

        // 🔥 DEBUG útil
        console.log("[MDNLocationsWidget] mount()", cfg);

        // TODO: tu render real aquí...
        root.innerHTML = `
      <div style="max-width:900px">
        <input
          id="mdn-loc-input"
          placeholder="${cfg.placeholder}"
          style="width:100%;padding:14px 12px;font-size:16px;border:1px solid #ddd;border-radius:10px"
        />
        <div id="mdn-loc-results" style="margin-top:12px"></div>
      </div>
    `;

        // Ejemplo de fetch (tu lógica real puede ser distinta)
        const res = await fetch(cfg.statesIndexUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load statesIndexUrl: ${res.status}`);
        const data = await res.json();
        console.log("[MDNLocationsWidget] statesIndex loaded:", data);
    }

    // ✅ Export global
    window.MDNLocationsWidget = { mount };
})();

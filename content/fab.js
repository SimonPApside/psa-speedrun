(() => {
  // Avoid double-injection
  if (document.getElementById("__ext-fab-root")) return;

  /* ─── State ─────────────────────────────────────────────── */
  let isPanelOpen = false;

  /* ─── Build DOM ──────────────────────────────────────────── */
  const root = document.createElement("div");
  root.id = "__ext-fab-root";

  root.innerHTML = `
    <button id="__ext-fab" aria-label="Toggle extension panel" title="Toggle Panel">
      <span class="fab-icon fab-icon--open">
        <!-- chevron-up / panel-open icon -->
        <img src="${chrome.runtime.getURL("icons/favicon-48x48.png")}" />
      </span>
      <span class="fab-icon fab-icon--close">
        <!-- X / close icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </span>
      <span class="fab-ring"></span>
    </button>
    <div id="__ext-tooltip">Open Panel</div>
  `;

  document.body.appendChild(root);

  const fab     = root.querySelector("#__ext-fab");
  const tooltip = root.querySelector("#__ext-tooltip");

  /* ─── Helpers ─────────────────────────────────────────────── */
  function setOpen(open, { animate = true } = {}) {
    isPanelOpen = open;
    fab.classList.toggle("is-open", open);
    tooltip.textContent = open ? "Panel Open" : "Open Panel";

    if (animate) {
      fab.classList.add("pop");
      fab.addEventListener("animationend", () => fab.classList.remove("pop"), { once: true });
    }

    chrome.storage.local.set({ panelOpen: open });
  }

  /* ─── Click: toggle popup via extension API ──────────────── */
  fab.addEventListener("click", () => {
    isPanelOpen = !isPanelOpen;
    setOpen(isPanelOpen);
    chrome.runtime.sendMessage({ type: "FAB_TOGGLE", open: isPanelOpen }).catch(() => {});
  });

  /* ─── Tooltip hover ──────────────────────────────────────── */
  fab.addEventListener("mouseenter", () => tooltip.classList.add("visible"));
  fab.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));

  /* ─── Listen for popup close/open events ─────────────────── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "PANEL_STATE_CHANGED") {
      setOpen(msg.open, { animate: true });
    }
  });

  /* ─── Sync initial state from storage ───────────────────── */
  chrome.storage.local.get("panelOpen", ({ panelOpen }) => {
    setOpen(!!panelOpen, { animate: false });
  });

  /* ─── Watch storage changes (cross-context sync) ─────────── */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "panelOpen" in changes) {
      const next = changes.panelOpen.newValue;
      if (next !== isPanelOpen) setOpen(next, { animate: true });
    }
  });
})();

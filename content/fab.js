(() => {
  // Avoid double-injection
  if (document.getElementById("__ext-fab-root")) return;

  /* ─── State ─────────────────────────────────────────────── */
  let isPanelOpen = false;
  let isReady = false;

  /* ─── Build DOM ──────────────────────────────────────────── */
  const root = document.createElement("div");
  root.id = "__ext-fab-root";

  root.innerHTML = `
    <div id="__ext-fab-group">
      <div id="__ext-fab-sub-actions">
        <button id="__ext-fab-settings">
        Paramètres
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
          </svg>
        </button>
      </div>
      <button id="__ext-fab" aria-label="Toggle extension panel">
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
        <span class="fab-icon fab-icon--fill">
          Remplir
        </span>
        <span class="fab-ring"></span>
      </button>
    </div>
    <div id="__ext-tooltip">Open Panel</div>
    <div id="__ext-settings-tooltip">Ouvrir le panneau</div>
  `;

  document.body.appendChild(root);

  const fab = root.querySelector("#__ext-fab");
  const settings = root.querySelector("#__ext-fab-settings");
  const tooltip = root.querySelector("#__ext-tooltip");
  const settingsTooltip = root.querySelector("#__ext-settings-tooltip");

  /* ─── Helpers ─────────────────────────────────────────────── */
  function setOpen(open, { animate = true } = {}) {
    isPanelOpen = open;
    fab.classList.toggle("is-open", open);
    updateTooltip();

    if (animate) {
      fab.classList.add("pop");
      fab.addEventListener("animationend", () => fab.classList.remove("pop"), { once: true });
    }

    chrome.storage.local.set({ panelOpen: open });
  }

  function setReady(ready) {
    isReady = ready;
    fab.classList.toggle("is-ready", ready);
    updateTooltip();
  }

  function updateTooltip() {
    if (isPanelOpen) {
      tooltip.textContent = "Fermer le panneau";
    } else if (isReady) {
      tooltip.textContent = "Remplir la feuille de temps";
    } else {
      tooltip.textContent = "Feuille de temps non détectée";
    }
  }

  /* ─── Click: settings bubble ────────────────────────────── */
  settings.addEventListener("click", (e) => {
    e.stopPropagation();
    isPanelOpen = true;
    setOpen(isPanelOpen);
    chrome.runtime.sendMessage({ type: "FAB_TOGGLE", open: true }).catch(() => { });
  });

  /* ─── Click: toggle popup OR fill form ──────────────────── */
  fab.addEventListener("click", () => {
    if (isReady && !isPanelOpen) {
      // Trigger fill instead of toggle
      chrome.runtime.sendMessage({ type: "FILL_FORM_FROM_FAB" }).catch(() => { });
      return;
    }

    isPanelOpen = !isPanelOpen;
    setOpen(isPanelOpen);
    chrome.runtime.sendMessage({ type: "FAB_TOGGLE", open: isPanelOpen }).catch(() => { });
  });

  /* ─── Tooltip hover ──────────────────────────────────────── */
  fab.addEventListener("mouseenter", () => {
    updateTooltip();
    tooltip.classList.add("visible");
  });
  fab.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));

  /* ─── Settings Tooltip hover ────────────────────────────── */
  settings.addEventListener("mouseenter", () => {
    settingsTooltip.classList.add("visible");
  });
  settings.addEventListener("mouseleave", () => {
    settingsTooltip.classList.remove("visible");
  });

  /* ─── Listen for events ──────────────────────────────────── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "PANEL_STATE_CHANGED") {
      setOpen(msg.open, { animate: true });
    } else if (msg.type === "TABLES_READY") {
      setReady(true);
    } else if (msg.type === "TABLES_NOT_READY") {
      setReady(false);
    }
  });

  /* ─── Sync initial state from storage & background ───────── */
  chrome.storage.local.get("panelOpen", ({ panelOpen }) => {
    setOpen(!!panelOpen, { animate: false });
  });

  // Check if tables are already detected
  chrome.runtime.sendMessage({ type: 'GET_STATUS', tabId: null }, (response) => {
    if (response && response.status) {
      setReady(!!response.status.loaded);
    }
  });

  /* ─── Watch storage changes (cross-context sync) ─────────── */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "panelOpen" in changes) {
      const next = changes.panelOpen.newValue;
      if (next !== isPanelOpen) setOpen(next, { animate: true });
    }
  });
})();
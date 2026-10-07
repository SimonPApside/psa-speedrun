'use strict';

/** Returns the iframe document that contains the requested PSA elements. */
function getIframeDoc(requiredMarkerSelector = PSA_DOM_ELEMENTS.timesheetTableId) {
  const marker = typeof requiredMarkerSelector === 'string'
    ? requiredMarkerSelector : DOMElementSelectorUtil.toSelector(requiredMarkerSelector);

  for (const frame of document.querySelectorAll('iframe')) {
    let frameDoc;
    try {
      frameDoc = frame.contentDocument ?? frame.contentWindow?.document;
    } catch {
      // Ignore frames that are not accessible from the PSA page.
      continue;
    }

    if (frameDoc?.querySelector(marker)) return frameDoc;
  }

  // Do not return an unrelated iframe: PSA can switch to an AJAX panel document.
  return null;
}

/** Sets an element's value and fires a change event so PSA reacts. */
function setAndDispatch(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

/** Sets an element's value only if it's currently empty or zero. */
function setIfEmpty(el, value) {
  const current = el.value?.trim();
  if (!current || current === '0') setAndDispatch(el, value);
}

/**
 * Injects a web-accessible script into the page's main world.
 * Pass a `data` object to expose values via dataset on the script tag,
 * which the injected script can read with `document.currentScript.dataset`.
 */
function injectCode(src, data = {}) {
  const script = document.createElement('script');
  script.src = src;
  for (const [key, value] of Object.entries(data)) {
    if (value != null) script.dataset[key] = value;
  }
  script.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(script);
}

/** Parses a French date string "dd/MM/YYYY" into a Date object. */
function parseFrenchDate(dateStr) {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function notifyContentScript(message) {
  // Send to all content scripts in all matching tabs
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message)
        .catch(() => {}); // tab may not have content script
    }
  });
}

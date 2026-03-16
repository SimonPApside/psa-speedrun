'use strict';

/** Returns the document inside the PSA iframe. */
function getIframeDoc() {
  return document.getElementsByTagName('iframe')[0]?.contentWindow?.document ?? null;
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

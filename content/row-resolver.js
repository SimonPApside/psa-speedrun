'use strict';

/**
 * Resolves the correct DOM row element (`tr[id^="trEX_TRC_MAP_VW$0_row"]`)
 * for a given label string, healing stale row IDs in-memory.
 *
 * Strategy:
 *  1. If the element with `storedId` exists AND its text contains `label` → use it directly.
 *  2. Otherwise, scan all `trEX_TRC_MAP_VW$0_row*` rows and find the one
 *     whose text content includes `label`.
 *  3. If found, update the in-memory config object so subsequent calls skip the scan.
 *  4. If not found, log a warning and return null.
 *
 * @param {Document}    doc      - The iframe document to search within.
 * @param {string}      storedId - The row ID currently stored in config (may be stale).
 * @param {string}      label    - The label text to match against row text content.
 * @param {object}      entry    - The config entry object whose `.value` will be updated in-memory.
 * @returns {Element|null} The resolved row element, or null if not found.
 */
function resolveRowByLabel(doc, storedId, label, entry) {
  // 1. Fast path: stored ID is still valid.
  const knownEl = storedId ? doc.getElementById(storedId) : null;
  if (knownEl && rowContainsLabel(knownEl, label)) {
    return knownEl;
  }

  // 2. Slow path: scan all candidate rows.
  const allRows = doc.querySelectorAll('[id^="trEX_TRC_MAP_VW$0_row"]');
  for (const row of allRows) {
    if (rowContainsLabel(row, label)) {
      const correctedId = row.id;
      console.warn(
        `[PSA Speedrun] Row ID for "${label}" was stale (was: "${storedId}", now: "${correctedId}"). Corrected in-memory.`
      );
      // Heal the in-memory config entry so future calls use the fast path.
      if (entry) entry.value = correctedId;
      return row;
    }
  }

  console.error(`[PSA Speedrun] Could not find any row matching label "${label}".`);
  return null;
}

/**
 * Returns true if the row element's text content includes the given label,
 * using a case-insensitive trimmed comparison.
 *
 * @param {Element} row
 * @param {string}  label
 * @returns {boolean}
 */
function rowContainsLabel(row, label) {
  return row.textContent.toLowerCase().includes(label.toLowerCase().trim());
}

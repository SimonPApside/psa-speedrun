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
function resolveRowByLabel(doc, storedId, label) {
  // 1. Fast path: stored ID is still valid.
  const knownEl = storedId ? doc.getElementById(storedId) : null;
  if (knownEl && rowContainsLabel(knownEl, label)) {
    return knownEl;
  }

  // 2. Slow path: scan all candidate rows.
  const matches = findRowsByLabel(doc, label);
  if (matches.length) return matches[0];

  console.error(`[PSA Speedrun] Could not find any row matching label "${label}".`);
  return null;
}

/** Returns every activity row whose visible text contains the configured label. */
function findRowsByLabel(doc, label) {
  if (!label) return [];
  return Array.from(doc.querySelectorAll(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityCodeRowsId)))
    .filter(row => rowContainsLabel(row, label));
}

/**
 * Asks the user to resolve ambiguous activity matches before any hours are
 * changed. The dialog is mounted in the top-level PSA document so it remains
 * visible even when the timesheet itself is inside an iframe.
 * @param {Array<{day: string, key: string, label: string, rows: Element[]}>} ambiguities
 * @returns {Promise<Map<string, Element>|null>} selection by day/label, or null on cancel.
 */
function askForActivityRows(ambiguities) {
  if (!ambiguities.length) return Promise.resolve(new Map());

  return new Promise(resolve => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .backdrop { position:fixed; inset:0; display:grid; place-items:center; padding:20px; background:#0008; font:14px system-ui,sans-serif; color:#172033; }
      .dialog { box-sizing:border-box; width:min(520px,100%); max-height:90vh; overflow:auto; padding:22px; border-radius:12px; background:white; box-shadow:0 16px 48px #0004; }
      h2 { margin:0 0 8px; font-size:18px; } p { margin:0 0 18px; color:#475569; }
      fieldset { margin:0 0 14px; padding:12px; border:1px solid #cbd5e1; border-radius:8px; }
      legend { padding:0 5px; font-weight:650; } label { display:flex; gap:9px; align-items:flex-start; padding:7px 2px; cursor:pointer; }
      .actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
      button { padding:8px 14px; border:0; border-radius:6px; cursor:pointer; font:inherit; }
      .cancel { background:#e2e8f0; color:#172033; } .confirm { background:#4f46e5; color:white; }
    `;
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const form = document.createElement('form');
    form.className = 'dialog';
    const title = document.createElement('h2');
    title.textContent = 'Choisir les activités';
    const intro = document.createElement('p');
    intro.textContent = 'Plusieurs activités correspondent à votre configuration. Choisissez celle à utiliser pour chaque jour.';
    form.append(title, intro);

    ambiguities.forEach((item, groupIndex) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = `${item.day} — ${item.label}`;
      fieldset.append(legend);
      item.rows.forEach((row, rowIndex) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `activity-${groupIndex}`;
        input.value = String(rowIndex);
        input.required = true;
        const rowName = document.createElement('span');
        const rowCopy = row.cloneNode(true);
        rowCopy.querySelectorAll('input, select, textarea, button').forEach(control => control.remove());
        const cells = Array.from(rowCopy.querySelectorAll('td, th'));
        const cellLabels = cells
          .map(cell => cell.innerText.trim().replace(/\s+/g, ' '))
          .filter(text => text && !/^[+-]?\d+(?:[,.]\d+)?$/.test(text));
        rowName.textContent = (cellLabels.length ? cellLabels.join(' · ') : rowCopy.innerText)
          .trim().replace(/\s+/g, ' ');
        label.append(input, rowName);
        fieldset.append(label);
      });
      form.append(fieldset);
    });

    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = 'Annuler';
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'confirm';
    confirm.textContent = 'Continuer';
    actions.append(cancel, confirm);
    form.append(actions);
    backdrop.append(form);
    shadow.append(style, backdrop);
    document.documentElement.append(host);

    const finish = selections => {
      host.remove();
      resolve(selections);
    };
    cancel.addEventListener('click', () => finish(null));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const selections = new Map();
      ambiguities.forEach((item, index) => {
        const selected = form.querySelector(`input[name="activity-${index}"]:checked`);
        selections.set(`${item.key}:${item.label}`, item.rows[Number(selected.value)]);
      });
      finish(selections);
    });
    form.querySelector('input')?.focus();
  });
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

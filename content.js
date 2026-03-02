'use strict';

const CONFIG_URL = chrome.runtime.getURL('resources/config.json');

let isReady = false;
let config;

// ============================================================
// INIT — Load config.json and poll for PSA tables
// ============================================================

(async () => {
  config = await fetch(CONFIG_URL).then(res => res.json());

  // Poll until the required PSA tables are present in the iframe
  const intervalId = setInterval(() => {
    const iframe = document.getElementsByTagName('iframe')[0];
    if (!iframe) return;

    const doc = iframe.contentWindow.document;
    const allTablesPresent = config.tables
      .filter(t => t.required)
      .every(t => doc.getElementById(t.id));

    if (!allTablesPresent) return;

    isReady = true;
    clearInterval(intervalId);

    // Notify background so it can update the extension badge
    chrome.runtime.sendMessage({
      type: 'TABLES_DETECTED',
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
  }, 500);
})();

// ============================================================
// MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_STATUS') {
    sendResponse({ loaded: isReady, url: window.location.href });

  } else if (request.type === 'FILL_FORM') {
    if (!config) {
      sendResponse({ success: false });
      return true;
    }
    // Handle async fillInputs
    (async () => {
      await fillInputs();
      injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), { targetId: "UC_EX_WRK_UC_TI_FRA_LINK" });
      fillInputsRest(() => sendResponse({ success: true }));
    })();
  }

  return true;
});

// ============================================================
// FILL — Project hours
// ============================================================

async function fillInputs() {
  const { currentConfig: settings } = await chrome.storage.sync.get({
    currentConfig: {
      workHours: 8,
      monday: 'NA', mondayExtra: 'NONE', mondayProject: '',
      tuesday: 'NA', tuesdayExtra: 'NONE', tuesdayProject: '',
      wednesday: 'NA', wednesdayExtra: 'NONE', wednesdayProject: '',
      thursday: 'NA', thursdayExtra: 'NONE', thursdayProject: '',
      friday: 'NA', fridayExtra: 'NONE', fridayProject: ''
    }
  });

  const iframe = document.getElementsByTagName('iframe')[0];
  const doc = iframe.contentWindow.document;

  // Determine daily hours — prefer the page's scheduled hours if available
  let dailyHours = settings.workHours;
  const scheduledEl = doc.getElementById('UC_EX_TIME_HDR_UC_SCHEDULED_HRS');
  if (scheduledEl) {
    const weekly = parseFloat(scheduledEl.textContent.replace(',', '.'));
    if (!isNaN(weekly) && weekly > 0) dailyHours = weekly / 5;
  }
  const hoursValue = dailyHours.toString().replace('.', ',');

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  for (let i = 0; i < 5; i++) {
    const dayKey = days[i];
    const extraRowId = settings[dayKey + 'Extra'];
    const projectCode = settings[dayKey + 'Project'];

    // 1- Extra priority
    if (extraRowId && extraRowId !== 'NONE') {
      const row = doc.getElementById(extraRowId);
      const input = row?.querySelector(`input[name^="POL_TIME${i + 2}$"]`);
      if (input) setAndDispatch(input, hoursValue);
      continue;
    }

    // 2- Project logic (if no extra)
    if (projectCode) {
      const targetRow = await getOrCreateProjectRow(doc, projectCode);
      if (targetRow) {
        const ti = targetRow.querySelectorAll('input[name^="TIME"]')[i + 1];
        if (ti) setAndDispatch(ti, hoursValue);
      }
    }
  }
}

/**
 * Finds a row with the matching projectCode, or an empty one, 
 * or creates a new one by clicking the "New" button.
 */
async function getOrCreateProjectRow(doc, projectCode) {
  const projectRows = Array.from(doc.querySelectorAll('[id^="trEX_TIME_DTL"]'));

  // 1. Find matching projectCode
  let row = projectRows.find(r => r.querySelector('input[name^="PROJECT_CODE"]')?.value.trim() === projectCode.trim());
  if (row) return row;

  // 2. Find empty row
  row = projectRows.find(r => r.querySelector('input[name^="PROJECT_CODE"]')?.value.trim() === '');
  if (row) {
    const ci = row.querySelector('input[name^="PROJECT_CODE"]');
    const ai = row.querySelector('input[name^="ACTIVITY_CODE"]');
    if (ci) setAndDispatch(ci, projectCode);
    if (ai) setAndDispatch(ai, 'PROJET');
    return row;
  }

  // 3. Click "New Row"
  const newRowLink = doc.querySelector('a[name^="EX_TIME_DTL$new"]');
  if (newRowLink) {
    injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
      targetId: newRowLink.id,
      targetName: newRowLink.getAttribute('name')
    });
    return new Promise(resolve => {
      const check = setInterval(() => {
        const updatedRows = Array.from(doc.querySelectorAll('[id^="trEX_TIME_DTL"]'));
        const newRow = updatedRows.find(r => r.querySelector('input[name^="PROJECT_CODE"]')?.value.trim() === '');
        if (newRow) {
          clearInterval(check);
          const ci = newRow.querySelector('input[name^="PROJECT_CODE"]');
          const ai = newRow.querySelector('input[name^="ACTIVITY_CODE"]');
          if (ci) setAndDispatch(ci, projectCode);
          if (ai) setAndDispatch(ai, 'PROJET');
          resolve(newRow);
        }
      }, 200);
    });
  }

  return null;
}


// ============================================================
// FILL — Rest time and transport codes
// ============================================================

function fillInputsRest(onDone) {
  const intervalId = setInterval(async () => {
    if (!document.getElementById('PT_AGSTARTPAGE_NUI')) return;

    const { currentConfig: settings } = await chrome.storage.sync.get({
      currentConfig: {
        restTime: 1,
        monday: 'NA', tuesday: 'NA', wednesday: 'NA', thursday: 'NA', friday: 'NA',
        mondayExtra: 'NONE', tuesdayExtra: 'NONE', wednesdayExtra: 'NONE',
        thursdayExtra: 'NONE', fridayExtra: 'NONE'
      }
    });

    const iframe = document.getElementsByTagName('iframe')[0];
    const doc = iframe.contentWindow.document;

    // Build a per-day skip mask: true if the day uses an absence type that
    // should not populate rest time or location (e.g. RTT, Maladie).
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const skipDay = days.map(day => {
      const extraId = settings[day + 'Extra'];
      if (!extraId || extraId === 'NONE') return false;
      const option = config.extraInputOptions.find(o => o.value === extraId);
      return option?.skipRestAndLocation === true;
    });

    // --- Daily rest checkboxes (3 groups of 7 days) ---
    const restCheckboxes = Array.from(doc.querySelectorAll('[name^="UC_DAILYREST"]'));
    for (let i = 0; i < 3; i++) {
      const group = restCheckboxes.slice(i * 7, i * 7 + 7);
      group.forEach((el, y) => setAndDispatch(el, y === 0 || y === 6 || skipDay[y - 1] ? 'NA' : 'Y'));
    }

    // --- Rest time values (Mon–Fri = indices 1–5, weekends = 0) ---
    // Skip days flagged as absence types (leave them at '0').
    const restValue = settings.restTime.toString().replace('.', ',');
    const restInputs = Array.from(doc.querySelectorAll('[name^="UC_TIME_LIN_WRK_UC_DAILYREST"]'));
    restInputs.forEach((el, y) => {
      const isWeekday = y > 0 && y < 6;
      const value = isWeekday && !skipDay[y - 1] ? restValue : '0';
      setAndDispatch(el, value);
    });

    // --- Transport / location codes (Mon–Fri = indices 1–5 in each 7-day group) ---
    // Skip days flagged as absence types (leave them at 'NA').
    const dailyCodes = days.map(day => settings[day]);
    const locationInputs = Array.from(doc.querySelectorAll('[name^="UC_LOCATION_A"]'));
    for (let i = 0; i < 2; i++) {
      const group = locationInputs.slice(i * 7, i * 7 + 7);
      for (let y = 1; y <= 5; y++) {
        if (group[y]) setAndDispatch(group[y], skipDay[y - 1] ? 'NA' : dailyCodes[y - 1]);
      }
    }

    // injectCode(chrome.runtime.getURL('resources/closeForm.js'));
    const link = doc.querySelector('input[name="#ICSave"]');
    link.click();

    clearInterval(intervalId);
    if (onDone) onDone();
  }, 1000);
}

// ============================================================
// UTILS
// ============================================================

/** Sets an element's value and fires a change event. */
function setAndDispatch(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

/** 
 * Injects an external script into the page context.
 * Use data object to pass variables via dataset (read via document.currentScript.dataset).
 */
function injectCode(src, data = {}) {
  const script = document.createElement('script');
  script.src = src;
  for (const [key, value] of Object.entries(data)) {
    if (value) script.dataset[key] = value;
  }
  script.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(script);
}
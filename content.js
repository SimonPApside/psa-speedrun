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
    fillInputs();
    injectCode(chrome.runtime.getURL('resources/triggerForm.js'));
    fillInputsRest(() => sendResponse({ success: true }));
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
      defaultProject: '',
      defaultActivity: '',
      monday: 'NA', mondayExtra: 'NONE',
      tuesday: 'NA', tuesdayExtra: 'NONE',
      wednesday: 'NA', wednesdayExtra: 'NONE',
      thursday: 'NA', thursdayExtra: 'NONE',
      friday: 'NA', fridayExtra: 'NONE'
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

  // Fill project code + activity if at least one day uses the standard project row
  const hasProjectRow = days.some(day => settings[day + 'Extra'] === 'NONE');
  if (hasProjectRow && settings.defaultProject) {
    const projectInput = doc.querySelector('[name^="PROJECT_CODE"]');
    if (projectInput) {
      setAndDispatch(projectInput, settings.defaultProject);
      const activityInput = doc.querySelector('input[name^="ACTIVITY_CODE"]');
      if (activityInput) setAndDispatch(activityInput, settings.defaultActivity);
    }
  }

  // Fill hours for each weekday
  const timeInputs = doc.querySelectorAll('[id^="trEX_TIME_DTL"] input[name^="TIME"]');

  for (let i = 0; i < 5; i++) {
    const dayKey = days[i];
    const extraRowId = settings[dayKey + 'Extra'];

    if (extraRowId && extraRowId !== 'NONE') {
      // Extra activity row (e.g. Avant-vente, RTT) — PSA index: Monday = 2
      const row = doc.getElementById(extraRowId);
      const input = row?.querySelector(`input[name^="POL_TIME${i + 2}$"]`);
      if (input) setAndDispatch(input, hoursValue);
    } else {
      // Standard project row — inputs[0] is Sunday, so Monday starts at index 1
      const input = timeInputs[i + 1];
      if (input) setAndDispatch(input, hoursValue);
    }
  }
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

/** Injects an external script into the page context. */
function injectCode(src) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(script);
}
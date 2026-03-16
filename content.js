'use strict';

const CONFIG_URL = chrome.runtime.getURL('resources/config.json');

let isReady = false;
let config;

(async () => {
  config = await fetch(CONFIG_URL).then(res => res.json());

  const intervalId = setInterval(() => {
    const doc = getIframeDoc();
    if (!doc) return;

    const allTablesPresent = config.tables
      .filter(t => t.required)
      .every(t => doc.getElementById(t.id));

    if (!allTablesPresent) return;

    isReady = true;
    clearInterval(intervalId);

    chrome.runtime.sendMessage({
      type: 'TABLES_DETECTED',
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
  }, 500);
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_STATUS') {
    sendResponse({ loaded: isReady, url: window.location.href });

  } else if (request.type === 'FILL_FORM') {
    if (!config) {
      sendResponse({ success: false });
      return true;
    }

    (async () => {
      const confirmedHolidays = await askForHolidayConfirmation();
      await fillInputs(confirmedHolidays);

      injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
        targetId: 'UC_EX_WRK_UC_TI_FRA_LINK'
      });

      fillInputsRest(() => sendResponse({ success: true }));
    })();
  }

  return true; // Keep the message channel open for async sendResponse
});

/**
 * Reads the period end date from the PSA page, asks the background worker
 * for any French bank holidays that week, and prompts the user to confirm.
 * @returns {Promise<Array>} Confirmed holiday objects, or empty array.
 */
async function askForHolidayConfirmation() {
  const doc = getIframeDoc();
  const periodEndEl = doc?.getElementById('EX_TIME_HDR_PERIOD_END_DT');
  if (!periodEndEl?.innerText) return [];

  const periodDate = parseFrenchDate(periodEndEl.innerText);
  const holidays = await chrome.runtime.sendMessage({
    message: 'GET_PUBLIC_HOLIDAYS',
    data: periodDate.toISOString()
  });

  if (!holidays?.length) return [];

  const names = holidays.map(h => `• ${h.name}`).join('\n');
  const confirmed = confirm(
    `🗓️ Des jours fériés ont été détectés cette semaine :\n${names}\n\nVoulez-vous les remplir automatiquement ?`
  );

  return confirmed ? holidays : [];
}
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

    // Auto-scrape projects once a month
    scrapeProjectCodes();

    chrome.runtime.sendMessage({
      type: 'TABLES_DETECTED',
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
  }, 500);
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(request, sender, sendResponse);
  if (request.type === 'CHECK_STATUS') {
    sendResponse({ loaded: isReady, url: window.location.href });

  } else if (request.type === 'GET_PERIOD_INFO') {
    const doc = getIframeDoc();
    const periodEndEl = doc?.getElementById('EX_TIME_HDR_PERIOD_END_DT');
    sendResponse({ periodEndDate: periodEndEl?.innerText || null });

  } else if (request.type === 'FILL_FORM') {
    if (!config) {
      sendResponse({ success: false });
      return true;
    }

    (async () => {
      const confirmedHolidays = await askForHolidayConfirmation();
      const startTime = performance.now();
      await fillInputs(confirmedHolidays);

      injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
        targetId: 'UC_EX_WRK_UC_TI_FRA_LINK'
      });

      fillInputsRest(confirmedHolidays, () => {
        const doc = getIframeDoc();
        const periodEndEl = doc?.getElementById('EX_TIME_HDR_PERIOD_END_DT');
        if (periodEndEl?.innerText) {
          chrome.storage.local.set({ saisieEffectuee: periodEndEl.innerText });
        }
        const endTime = performance.now();
        sendResponse({ success: true });
        chrome.runtime.sendMessage({
          message: 'CREATE_NOTIFICATION',
          data: `🏁 PSA Time remplit en  ${Number.parseFloat((endTime - startTime) / 1000).toFixed(2)} secondes`
        });
      });
    })();
  } else if (request.type === 'SCRAPE_PROJECT_CODES') {
    (async () => {
      const success = await scrapeProjectCodes(request.force);
      sendResponse({ success });
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

/**
 * Programmatically opens the project code prompt, scrapes the results,
 * and saves them to local storage.
 */
async function scrapeProjectCodes(force = false) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;

  const { projectCodes, lastProjectScrape } = await chrome.storage.local.get(['projectCodes', 'lastProjectScrape']);

  if (!force && lastProjectScrape === currentMonth && projectCodes?.length > 0) {
    return true; // Already scraped this month
  }

  const doc = getIframeDoc();
  const promptBtn = doc?.getElementById('PROJECT_CODE$prompt$0');
  if (!promptBtn) return false;

  // Trigger the popup via injected script (PS framework security/context requirement)
  injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
    targetId: 'PROJECT_CODE$prompt$0'
  });


  // Wait for results to appear
  let codes = [];
  try {
    codes = await new Promise(resolve => {
      const check = setInterval(() => {
        const iframe = getIframeDoc();
        const resultsTable = iframe.getElementById('PTSRCHRESULTS');
        if (resultsTable) {
          const links = Array.from(resultsTable.querySelectorAll('tr a[name^="RESULT"]'));
          const foundCodes = links.map(a => a.innerText.trim()).filter(t => t.length > 0);
          resolve(foundCodes);
          clearInterval(check);
        }
      }, 200);
    });
  } catch (err) {
    console.warn(err.message);
    return false;
  }

  if (codes.length > 0) {
    await chrome.storage.local.set({
      projectCodes: codes,
      lastProjectScrape: currentMonth
    });

    // Attempt to close the popup via injected script
    const cancelBtn = document.querySelector('.ps_modal_close .ps-button');
    if (cancelBtn) {
      injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
        targetId: cancelBtn.id
      });
    }

    return true;
  }

  return false;
}
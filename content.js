'use strict';

const CONFIG_URL = chrome.runtime.getURL('resources/config.json');

let isReady = false;
let config;
let projectScrapeStarted = false;

(async () => {
  config = await fetch(CONFIG_URL).then(res => res.json());

  setInterval(() => {
    const doc = getIframeDoc();
    const allTablesPresent = !!(doc && config.tables
      .filter(t => t.required)
      .every(t => doc.getElementById(t.id)));

    if (allTablesPresent !== isReady) {
      isReady = allTablesPresent;

      if (isReady) {
        // Refresh once per page load; opening the PSA search dialog can make
        // the table readiness check briefly switch off and back on.
        if (!projectScrapeStarted) {
          projectScrapeStarted = true;
          scrapeProjectCodes(true);
        }

        chrome.runtime.sendMessage({
          type: 'TABLES_DETECTED',
          url: window.location.href,
          timestamp: new Date().toISOString()
        });
      } else {
        chrome.runtime.sendMessage({ type: 'TABLES_NOT_DETECTED' });
      }
    }
  }, 500);
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_STATUS') {
    sendResponse({ loaded: isReady, url: window.location.href });

  } else if (request.type === 'GET_PERIOD_INFO') {
    const periodEndEl = getEndTimePeriodElement();
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
        const periodEndEl = getEndTimePeriodElement();
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
  const periodEndEl = getEndTimePeriodElement();
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
  const promptBtn = doc?.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectCodePromptId));
  if (!promptBtn) return false;

  // Trigger the popup via injected script (PS framework security/context requirement)
  injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
    targetSelector: DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectCodePromptId)
  });


  // Wait for results to appear
  let codes = [];
  try {
    codes = await new Promise(resolve => {
      const check = setInterval(() => {
        const searchDoc = getIframeDoc(PSA_DOM_ELEMENTS.searchResultsTableId);
        const resultsTable = searchDoc.querySelector(
          DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.searchResultsTableId)
        );
        if (resultsTable) {
          const links = Array.from(resultsTable.querySelectorAll('tr a[id^="SEARCH_RESULT"]'));
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

  await chrome.storage.local.set({
    projectCodes: codes,
    lastProjectScrape: currentMonth
  });

  chrome.runtime.sendMessage({ type: 'PROJECT_CODES_UPDATED' });

  // Attempt to close the popup via injected script
  const cancelBtn = document.querySelector(PSA_DOM_ELEMENTS.projectCodeModalClose)
    || getIframeDoc(PSA_DOM_ELEMENTS.projectCodeModalClose)?.querySelector(PSA_DOM_ELEMENTS.projectCodeModalClose);
  if (cancelBtn) {
    injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
      targetId: cancelBtn.id || undefined,
      targetSelector: cancelBtn.id ? undefined : PSA_DOM_ELEMENTS.projectCodeModalClose
    });
  }

  return true;
}

function getEndTimePeriodElement() {
  const doc = getIframeDoc();
  return doc?.getElementById('EX_TIME_HDR_PERIOD_END_DT');
}

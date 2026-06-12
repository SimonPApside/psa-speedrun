'use strict';

const CONFIG_URL = chrome.runtime.getURL('resources/config.json');

let isReady = false;
let config;

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
        // Auto-scrape projects once a month
        scrapeProjectCodes();

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
  console.log(request, sender, sendResponse);
  if (request.type === 'CHECK_STATUS') {
    sendResponse({ loaded: isReady, url: window.location.href });

  } else if (request.type === 'GET_PERIOD_INFO') {
    const doc = getIframeDoc();
    const periodEndEl = doc?.getElementById('EX_TIME_HDR_PERIOD_END_DT');
    sendResponse({ periodEndDate: periodEndEl?.innerText || null });

  } else if (request.type === 'FILL_FORM') {
    console.log('[PSA DEBUG] FILL_FORM handler reached — new code is active ✓');
    if (!config) {
      console.warn('[PSA DEBUG] config not loaded, aborting');
      sendResponse({ success: false });
      return true;
    }

    (async () => {
      console.log('[PSA DEBUG] starting async fill pipeline');
      const confirmedHolidays = await askForHolidayConfirmation();
      const startTime = performance.now();
      await fillInputs(confirmedHolidays);
      await fillAdditionalHeaderFields();

      injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
        targetId: 'UC_EX_WRK_UC_TI_FRA_LINK'
      });

      fillInputsRest(confirmedHolidays, () => {
        // Apply billing action after returning to the main timesheet page.
        // During postback transitions, the field can be temporarily missing.
        chrome.storage.sync.get({ currentConfig: {} }, ({ currentConfig }) => {
          applyBillingActionWhenReady(currentConfig.BILLING_ACTION);
        });

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
 * Copies the editable PSA header fields from the popup config into the page.
 * This keeps the popup as the source of truth without changing the hour logic.
 */
async function fillAdditionalHeaderFields() {
  const doc = getIframeDoc();
  console.log('[PSA DEBUG] fillAdditionalHeaderFields - doc:', doc);
  if (!doc) return;

  const { currentConfig: settings } = await chrome.storage.sync.get({ currentConfig: {} });
  console.log('[PSA DEBUG] currentConfig from storage:', settings);
  console.log('[PSA DEBUG] UC_EX_TIME_HDR_UC_SCHEDULED_HRS =', settings.UC_EX_TIME_HDR_UC_SCHEDULED_HRS);
  console.log('[PSA DEBUG] UC_EX_TIME_HDR_UC_REASON_CODE =', settings.UC_EX_TIME_HDR_UC_REASON_CODE);
  console.log('[PSA DEBUG] BILLING_ACTION =', settings.BILLING_ACTION);

  // Scheduled hours and reason need a change event to be tracked by PeopleSoft.
  // Billing action is applied at the end of the pipeline to avoid being reset
  // by the additional-info roundtrip.
  setFieldValue(doc, 'UC_EX_TIME_HDR_UC_SCHEDULED_HRS', settings.UC_EX_TIME_HDR_UC_SCHEDULED_HRS, true);
  setFieldValue(doc, 'UC_EX_TIME_HDR_UC_REASON_CODE', settings.UC_EX_TIME_HDR_UC_REASON_CODE, true);
}

function setFieldValue(doc, fieldId, value, dispatchChange = true) {
  if (value === undefined || value === null) return;

  const byId = doc.getElementById(fieldId);
  const byName = doc.querySelector(`[name="${fieldId}"]`);
  const byIdPrefixed = doc.querySelector(`[id^="${fieldId}$"]`);
  const byNamePrefixed = doc.querySelector(`[name^="${fieldId}$"]`);
  const el = byId || byName || byIdPrefixed || byNamePrefixed;
  console.log(
    `[PSA DEBUG] setFieldValue('${fieldId}', '${value}') → getElementById:`,
    byId,
    '| byName:',
    byName,
    '| byIdPrefixed:',
    byIdPrefixed,
    '| byNamePrefixed:',
    byNamePrefixed
  );
  if (!el) {
    console.warn(`[PSA DEBUG] Element not found for fieldId='${fieldId}'`);
    return;
  }

  el.value = value;
  if (dispatchChange) {
    el.dispatchEvent(new Event('change'));
  }
  console.log(`[PSA DEBUG] Set '${fieldId}' to '${value}' ✓ (dispatchChange=${dispatchChange})`);
}

function applyBillingActionWhenReady(value) {
  if (value === undefined || value === null || value === '') return;

  let attempts = 0;
  const maxAttempts = 20;
  const intervalId = setInterval(() => {
    attempts += 1;

    const doc = getIframeDoc();
    if (!doc) {
      if (attempts >= maxAttempts) clearInterval(intervalId);
      return;
    }

    const billingEl =
      doc.querySelector('[id^="BILLING_ACTION"], [name^="BILLING_ACTION"]') ||
      Array.from(doc.querySelectorAll('select')).find((select) => {
        const values = new Set(Array.from(select.options).map((o) => o.value));
        return values.has('B') && values.has('I') && values.has('U');
      });

    console.log('[PSA DEBUG] applyBillingActionWhenReady attempt', attempts, '->', billingEl);

    if (!billingEl) {
      if (attempts >= maxAttempts) {
        console.warn('[PSA DEBUG] Billing field still not found after retries');
        clearInterval(intervalId);
      }
      return;
    }

    billingEl.value = value;
    billingEl.dispatchEvent(new Event('change'));
    console.log(`[PSA DEBUG] Billing action applied late as '${value}' ✓`);
    clearInterval(intervalId);
  }, 500);
}

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
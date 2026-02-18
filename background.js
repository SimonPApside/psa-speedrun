import { joursFeries, getWeekJoursFeries } from './lib/joursFeries.js';

const TARGET_URL = 'https://psa-fs.ent.cgi.com/psc/fsprda/EMPLOYEE/ERP/c/';

// Track per-tab content script readiness
const contentScriptStatus = {};

// ============================================================
// MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (request.type === 'TABLES_DETECTED') {
    contentScriptStatus[tabId] = { loaded: true, url: request.url };

    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
    sendResponse({ success: true });

  } else if (request.type === 'GET_STATUS') {
    sendResponse({ status: contentScriptStatus[request.tabId] || { loaded: false } });

  } else if (request.message === 'GET_PUBLIC_HOLIDAYS') {
    getJoursFeriesOfWeek(new Date(request.data)).then(result => sendResponse(result));
  }

  return true;
});

// ============================================================
// TAB LIFECYCLE
// ============================================================

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete contentScriptStatus[tabId];
});

// Clear badge when navigating away from the target page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.includes(TARGET_URL)) {
    chrome.action.setBadgeText({ text: '', tabId });
    delete contentScriptStatus[tabId];
  }
});

// ============================================================
// PUBLIC HOLIDAYS
// ============================================================

async function getJoursFeriesOfWeek(date) {
  const year = date.getFullYear();
  const storageKey = `joursFeries-${year}`;

  let jours = await chrome.storage.local.get([storageKey])
    .then(result => result[storageKey]);

  if (!jours || Object.keys(jours).length === 0) {
    jours = joursFeries(year);
    await chrome.storage.local.set({ [storageKey]: jours });
  }

  return getWeekJoursFeries(date, jours);
}

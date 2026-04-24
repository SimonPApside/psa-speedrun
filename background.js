import { joursFeries, getWeekJoursFeries } from './lib/joursFeries.js';
import { createNotification } from './lib/createNotification.js';

const TARGET_URL = 'https://psa-fs.ent.cgi.com/psc/fsprda/EMPLOYEE/ERP/c/';
const PSA_DEEP_LINK = 'https://psa-fs.ent.cgi.com/psc/fsprda/EMPLOYEE/ERP/c/NUI_FRAMEWORK.PT_AGSTARTPAGE_NUI.GBL?CONTEXTIDPARAMS=TEMPLATE_ID%3aPTPPNAVCOL&scname=ADMN_UC_SELF_SERVICE_TIME&PanelCollapsible=Y&PTPPB_GROUPLET_ID=UCTI1000&CRefName=ADMN_NAVCOLL_1&AJAXTRANSFER=Y';

// Track per-tab content script readiness
const contentScriptStatus = {};

// ============================================================
// INIT & ALARMS
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  // Create alarm to check every hour
  chrome.alarms.create('checkReminder', { periodInMinutes: 60 });
});

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
  } else if (request.message === 'CREATE_NOTIFICATION') {
    createNotification(null, request.data);
    sendResponse({ success: true });
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

  console.log(jours);

  return getWeekJoursFeries(date, jours);
}

// ============================================================
// REMINDER LOGIC
// ============================================================

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkReminder') {
    checkAndNotify();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'psa-fill') {
      chrome.tabs.create({ url: PSA_DEEP_LINK });
    }
});


async function checkAndNotify() {
  const settings = await chrome.storage.sync.get({
    reminderDays: [4], // Default to Thursday
    reminderTime: '11:00'
  });

  // If no days selected, reminders are disabled
  if (!settings.reminderDays || settings.reminderDays.length === 0) return;

  const now = new Date();
  const currentDay = now.getDay();
  const [targetHour, targetMinute] = settings.reminderTime.split(':').map(Number);

  // Determine target days (factor in holidays)
  const holidays = await getJoursFeriesOfWeek(now)
    .map(h => new Date(h.date).getDay()).sort((a, b) => b - a);

  // reminderDays can be an array (new) or reminderDay can be an int (old/fallback)
  const baseDays = Array.isArray(settings.reminderDays)
    ? settings.reminderDays
    : [settings.reminderDay || 4];

  // Calculate effective days for each target day
  const effectiveDays = baseDays.map(baseDay => {
    let day = baseDay;
    // If a target day is a holiday, move to the previous day
    holidays.forEach(hDay => {
      if (hDay === day) day--;
    });
    return day;
  });

  // Only notify if today is one of the effective reminder days and after the target time
  if (!effectiveDays.includes(currentDay)) return;
  if (now.getHours() < targetHour || (now.getHours() === targetHour && now.getMinutes() < targetMinute)) return;

  // Check if already filled
  const { saisieEffectuee } = await chrome.storage.local.get(['saisieEffectuee']);
  if (saisieEffectuee) {
    // If saisieEffectuee stores the period end date (Saturday), 
    // we check if it matches the current week's period end.
    const lastFilledDate = parseFrenchDate(saisieEffectuee);
    const diffDays = (now - lastFilledDate) / (1000 * 60 * 60 * 24);
    if (diffDays < 6) return; // Already filled for this period
  }

  createNotification("psa-fill", "🚀 C'est l'heure de ta saisie PSA !");
}

function parseFrenchDate(dateStr) {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

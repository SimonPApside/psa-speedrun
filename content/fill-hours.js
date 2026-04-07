'use strict';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

// The default activity code applied when claiming an empty/new project row
const DEFAULT_ACTIVITY = 'PROJET';

/**
 * Fills project hour inputs for Mon–Fri using the following priority per day:
 *  0. Bank holiday → fill the holiday row and skip to next day.
 *  1. Extra is set → fill the extra row and skip to next day.
 *  2. Project code is set → find/claim/create a matching project row and fill.
 *
 * @param {Array} holidays - Array of holiday objects { name, date } from background.js.
 */
async function fillInputs(holidays = []) {
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

  const doc = getIframeDoc();
  if (!doc) return;

  const hoursValue = getDailyHours(doc, settings.workHours);
  const { holidayDates, periodEndDate } = parseHolidays(doc, holidays);
  const holidayRow = holidayDates.length > 0
    ? resolveRowByLabel(doc, config.publicHoliday.value, config.publicHoliday.label, config.publicHoliday)
    : null;

  for (let i = 0; i < 5; i++) {
    const dayKey = DAYS[i];

    if (isDayHoliday(periodEndDate, holidayDates, i)) {
      const input = holidayRow?.querySelector(`input[name^="POL_TIME${i + 2}$"]`);
      if (input) setIfEmpty(input, hoursValue);
      continue;
    }

    const extraRowId = settings[dayKey + 'Extra'];
    if (extraRowId && extraRowId !== 'NONE') {
      const extraEntry = config.extraInputOptions.find(o => o.value === extraRowId);
      const row = resolveRowByLabel(doc, extraRowId, extraEntry?.label ?? extraRowId, extraEntry);
      const input = row?.querySelector(`input[name^="POL_TIME${i + 2}$"]`);
      if (input) setIfEmpty(input, hoursValue);
      continue;
    }

    const projectCode = settings[dayKey + 'Project'];
    if (projectCode) {
      const targetRow = await getOrCreateProjectRow(doc, projectCode);
      if (targetRow) {
        const ti = targetRow.querySelectorAll('input[name^="TIME"]')[i + 1];
        if (ti) setIfEmpty(ti, hoursValue);
      }
    }
  }
}

/**
 * Returns the daily hours as a French-formatted string (comma decimal).
 * Prefers the weekly scheduled hours from the page divided by 5.
 */
function getDailyHours(doc, fallbackHours) {
  const scheduledEl = doc.getElementById('UC_EX_TIME_HDR_UC_SCHEDULED_HRS');
  if (scheduledEl) {
    const weekly = parseFloat(scheduledEl.textContent.replace(',', '.'));
    if (!isNaN(weekly) && weekly > 0) return (weekly / 5).toString().replace('.', ',');
  }
  return fallbackHours.toString().replace('.', ',');
}

/**
 * Parses the holiday list into a set of date strings for quick lookup,
 * and reads the period end date from the PSA page.
 */
function parseHolidays(doc, holidays) {
  const holidayDates = holidays.map(h => new Date(h.date).toDateString());
  const periodEndEl = doc.getElementById('EX_TIME_HDR_PERIOD_END_DT');
  const periodEndDate = periodEndEl?.innerText ? parseFrenchDate(periodEndEl.innerText) : null;
  return { holidayDates, periodEndDate };
}

/**
 * Checks whether day index `i` (0=Monday) falls on a bank holiday.
 * The period end date is a Saturday; Mon = Saturday - 5, Tue = Saturday - 4, etc.
 */
function isDayHoliday(periodEndDate, holidayDates, i) {
  if (!periodEndDate || holidayDates.length === 0) return false;
  const dayDate = new Date(periodEndDate);
  dayDate.setDate(dayDate.getDate() - (5 - i));
  return holidayDates.includes(dayDate.toDateString());
}

/**
 * Finds a project row matching `projectCode`, or claims the first empty row,
 * or creates a new row by clicking the "New Row" link.
 * Sets PROJECT_CODE and ACTIVITY_CODE on claimed/new rows.
 * @returns {Element|null} The matched or newly created row element.
 */
async function getOrCreateProjectRow(doc, projectCode) {
  const allRows = () => Array.from(doc.querySelectorAll('[id^="trEX_TIME_DTL"]'));
  const getCode = r => r.querySelector('input[name^="PROJECT_CODE"]')?.value.trim() ?? '';

  const matchRow = allRows().find(r => getCode(r) === projectCode.trim());
  if (matchRow) return matchRow;

  const emptyRow = allRows().find(r => getCode(r) === '');
  if (emptyRow) {
    claimProjectRow(emptyRow, projectCode);
    return emptyRow;
  }

  const newRowLink = doc.querySelector('a[name^="EX_TIME_DTL$new"]');
  if (!newRowLink) return null;

  injectCode(chrome.runtime.getURL('resources/triggerClickFunction.js'), {
    targetId: newRowLink.id,
    targetName: newRowLink.getAttribute('name')
  });

  return new Promise(resolve => {
    const check = setInterval(() => {
      const newRow = allRows().find(r => getCode(r) === '');
      if (newRow) {
        clearInterval(check);
        claimProjectRow(newRow, projectCode);
        resolve(newRow);
      }
    }, 200);
  });
}

/** Sets the project code and default activity on a row. */
function claimProjectRow(row, projectCode) {
  const codeInput = row.querySelector('input[name^="PROJECT_CODE"]');
  const activityInput = row.querySelector('input[name^="ACTIVITY_CODE"]');
  if (codeInput) setAndDispatch(codeInput, projectCode);
  if (activityInput) setAndDispatch(activityInput, DEFAULT_ACTIVITY);
}

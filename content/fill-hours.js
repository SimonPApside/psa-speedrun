'use strict';

/**
 * Fills project hour inputs for Mon–Fri using the following priority per day:
 *  1. Bank holiday → fill the holiday row and skip to next day.
 *  2. Divide remaining daily hours equally among configured activities.
 *
 * @param {Array} holidays - Array of holiday objects { name, date } from background.js.
 */
async function fillInputs(holidays = []) {
  const { currentConfig: settings } = await chrome.storage.sync.get({
    currentConfig: DEFAULT_CURRENT_CONFIG
  });

  const doc = getIframeDoc();
  if (!doc) return;

  const hoursValue = getDailyHours(doc, settings.workHours);
  const { holidayDates, periodEndDate } = parseHolidays(doc, holidays);
  const holidayRow = holidayDates.length > 0
    ? resolveRowByLabel(doc, config.publicHoliday.value, config.publicHoliday.label)
    : null;

  const startDayIndex = 0;
  const lastDayIndex = 5;
  for (let dayIndex = startDayIndex; dayIndex < lastDayIndex; dayIndex++) {
    const dayKey = DAYS[dayIndex];

    const targetTotal = parseFloat(hoursValue.replace(',', '.'));
    const currentTotal = getFilledHoursForDay(doc, dayIndex);
    const remaining = targetTotal - currentTotal;

    if (remaining <= 0) continue; // Skip if day is already full

    // Use the remaining hours if the day is only partially filled
    const effectiveHoursValue = remaining.toString().replace('.', ',');

    if (isDayHoliday(periodEndDate, holidayDates, dayIndex)) {
      const input = holidayRow?.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityInputIdForDay(dayIndex)));
      if (input) setIfEmpty(input, effectiveHoursValue);
      continue;
    }

    const activities = getActivitiesForDay(settings, dayKey);
    if (!activities.length) continue;

    const targets = [];
    for (const activity of activities) {
      if (activity.type === 'project' && activity.code) {
        const row = await getOrCreateProjectRow(doc, activity.code);
        const input = row?.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectInputIdForDay(dayIndex)));
        if (input) targets.push(input);
      } else if (activity.type === 'extra' && activity.code && activity.code !== 'NONE') {
        const extraEntry = config.extraInputOptions.find(o => o.value === activity.code);
        const row = resolveRowByLabel(doc, activity.code, extraEntry?.label ?? activity.code);
        const input = row?.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityInputIdForDay(dayIndex)));
        if (input) targets.push(input);
      }
    }

    const emptyTargets = targets.filter(input => !input.value);
    if (emptyTargets.length) {
      const share = Math.floor((remaining / emptyTargets.length) * 100) / 100;
      let allocated = 0;
      emptyTargets.forEach((input, index) => {
        const amount = index === emptyTargets.length - 1
          ? Math.round((remaining - allocated) * 100) / 100 : share;
        allocated += amount;
        setIfEmpty(input, String(amount).replace('.', ','));
      });
    }
  }
}

function getActivitiesForDay(settings, day) {
  const activities = settings[`${day}Activities`];
  if (Array.isArray(activities)) return activities;
  if (settings[`${day}Project`]) return [{ type: 'project', code: settings[`${day}Project`] }];
  const extra = settings[`${day}Extra`];
  return extra && extra !== 'NONE' ? [{ type: 'extra', code: extra }] : [];
}

/**
 * Returns the daily hours as a French-formatted string (comma decimal).
 * Prefers the weekly scheduled hours from the page divided by 5.
 */
function getDailyHours(doc, fallbackHours) {
  const scheduledEl = doc.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.scheduledHoursTimesheetId));
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
  const periodEndElement = doc.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.periodDateTimesheetId));
  const periodEndDate = periodEndElement?.innerText ? parseFrenchDate(periodEndElement.innerText) : null;
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
function getOrCreateProjectRow(doc, projectCode) {
  const allRows = () => Array.from(doc.querySelectorAll(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectCodeRowsId)));
  const getCode = row => row.querySelector(`input${DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectCodeInputName)}`)?.value.trim() ?? '';

  const matchRow = allRows().find(r => getCode(r) === projectCode.trim());
  if (matchRow) return matchRow;

  const emptyRow = allRows().find(r => getCode(r) === '');
  if (emptyRow) {
    claimProjectRow(emptyRow, projectCode);
    return emptyRow;
  }

  const newRowLink = doc.querySelector(`a${DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.newProjectRowAnchorName)}`);
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
  const codeInput = row.querySelector(`input${DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectCodeInputName)}`);
  const activityInput = row.querySelector(`input${DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityCodeInputName)}`);
  if (codeInput) setAndDispatch(codeInput, projectCode);
  if (activityInput) setAndDispatch(activityInput, DEFAULT_ACTIVITY);
}

/**
 * Sums all existing hour entries for a specific day index (2=Monday)
 * across both the project and absence tables.
 */
function getFilledHoursForDay(doc, dayIndex) {
  let total = 0;

  const projectRows = doc.querySelectorAll(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectCodeRowsId));
  projectRows.forEach(row => {
    const input = row.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.projectInputIdForDay(dayIndex)));

    if (input && input.value) {
      const val = parseFloat(input.value.replace(',', '.'));
      if (!isNaN(val)) total += val;
    }
  });

  const otherActivities = doc.querySelectorAll(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityCodeRowsId));
  otherActivities.forEach(row => {
    // Activity table columns for Mon-Fri are indexed 2-6
    const input =  row.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityInputIdForDay(dayIndex)));
    if (input && input.value) {
      const val = parseFloat(input.value.replace(',', '.'));
      if (!isNaN(val)) total += val;
    }
  });

  return total;
}

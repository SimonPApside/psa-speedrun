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

  const scheduledHoursEl = findPSAElement(PSA_DOM_ELEMENTS.scheduledHoursTimesheetId);
  const { holidayDates, periodEndDate } = parseHolidays(doc, holidays);
  const deduction = getSelectedWeeklyDeduction(settings);
  const periodKey = getPeriodStorageKey(periodEndDate);
  const scheduledHours = await getWeeklyScheduledHours(scheduledHoursEl, periodKey, deduction != null);
  const hoursValue = scheduledHours != null && scheduledHours > 0
    ? (scheduledHours / 5).toString().replace('.', ',')
    : settings.workHours.toString().replace('.', ',');
  const holidayRow = holidayDates.length > 0
    ? resolveRowByLabel(doc, config.publicHoliday.value, config.publicHoliday.label)
    : null;

  // Resolve every ambiguous configured activity before writing any hours.
  const ambiguities = [];
  const dayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  for (const [dayIndex, day] of DAYS.entries()) {
    for (const activity of getActivitiesForDay(settings, day)) {
      if (activity.type !== 'extra' || !activity.code || activity.code === 'NONE') continue;
      const entry = getActivityOption(activity.code);
      const label = entry?.label ?? activity.code;
      const rows = findRowsByLabel(doc, label);
      if (rows.length > 1) ambiguities.push({ day: dayLabels[dayIndex], key: day, label, rows });
    }
  }
  const selectedRows = await askForActivityRows(ambiguities);
  if (!selectedRows) return false;

  if (deduction && scheduledHours != null && periodKey) {
    await chrome.storage.local.set({ [periodKey]: scheduledHours });
  }

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
        const extraEntry = getActivityOption(activity.code);
        const label = extraEntry?.label ?? activity.code;
        const row = selectedRows.get(`${dayKey}:${label}`)
          || resolveRowByLabel(doc, null, label);
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

  if (deduction && scheduledHours != null) {
    applyWeeklyScheduledHoursDeduction(doc, settings, deduction, scheduledHours);
  }
  return true;
}

function getSelectedWeeklyDeduction(settings) {
  for (const day of DAYS) {
    for (const activity of getActivitiesForDay(settings, day)) {
      if (activity.type !== 'extra' || !activity.code) continue;
      const option = getActivityOption(activity.code);
      const group = config.activityGroup?.find(item => item.code === option?.group);
      if (group?.isDeductFromWeeklyScheduledHours) return group;
    }
  }
  return null;
}

async function getWeeklyScheduledHours(element, storageKey, shouldPersistBaseline) {
  if (!element) return null;
  const currentValue = parseHours(element.value ?? element.textContent);
  if (storageKey && shouldPersistBaseline) {
    const stored = await chrome.storage.local.get(storageKey);
    const baseline = Number(stored[storageKey]);
    if (Number.isFinite(baseline)) return baseline;
    if (Number.isFinite(currentValue)) return currentValue;
  }
  return Number.isFinite(currentValue) ? currentValue : null;
}

function getPeriodStorageKey(periodEndDate) {
  if (!periodEndDate || Number.isNaN(periodEndDate.getTime())) return null;
  const date = `${periodEndDate.getFullYear()}-${String(periodEndDate.getMonth() + 1).padStart(2, '0')}-${String(periodEndDate.getDate()).padStart(2, '0')}`;
  return `weeklyScheduledHoursBaseline:${date}`;
}

function applyWeeklyScheduledHoursDeduction(doc, settings, group, baseline) {
  const selectedActivities = new Map();
  for (const day of DAYS) {
    for (const activity of getActivitiesForDay(settings, day)) {
      if (activity.type !== 'extra' || !activity.code) continue;
      const option = getActivityOption(activity.code);
      if (option?.group === group.code) selectedActivities.set(getActivityOptionCode(option), option);
    }
  }

  let deductedHours = 0;
  for (const option of selectedActivities.values()) {
    const row = resolveRowByLabel(doc, null, option.label);
    if (!row) continue;
    for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex++) {
      const input = row.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityInputIdForDay(dayIndex)));
      const value = parseHours(input?.value);
      if (Number.isFinite(value) && value > 0) deductedHours += value;
    }
  }

  const scheduledElement = findPSAElement(PSA_DOM_ELEMENTS.scheduledHoursTimesheetId);
  const reasonElement = findPSAElement(PSA_DOM_ELEMENTS.scheduledHoursReasonId);
  const reasonCode = group.deductCodeForWeeklyScheduledHours;
  if (!scheduledElement || !reasonElement || !reasonCode) return;

  const adjustedHours = Math.max(0, Math.round((baseline - deductedHours) * 100) / 100);
  setAndDispatch(scheduledElement, String(adjustedHours).replace('.', ','));
  setAndDispatch(reasonElement, reasonCode);
}

function parseHours(value) {
  if (value == null) return NaN;
  const parsed = Number.parseFloat(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getActivitiesForDay(settings, day) {
  const activities = settings[`${day}Activities`];
  if (Array.isArray(activities)) return activities.map(normalizeActivity);
  if (settings[`${day}Project`]) return [{ type: 'project', code: settings[`${day}Project`] }];
  const extra = settings[`${day}Extra`];
  return extra && extra !== 'NONE' ? [normalizeActivity({ type: 'extra', code: extra })] : [];
}

function normalizeActivity(activity) {
  if (activity?.type !== 'extra' || activity.code !== 'MW_STAT') return activity;
  const schoolOption = config.activityOptions.find(option =>
    option.description === 'Journée école'
    || (option.label === 'Compl temps partiel / activite'
      && config.activityGroup?.some(group => group.code === option.group && group.isDeductFromWeeklyScheduledHours))
  );
  return schoolOption ? { ...activity, code: getActivityOptionCode(schoolOption) } : activity;
}

function getActivityOption(value) {
  const normalized = value === 'MW_STAT'
    ? normalizeActivity({ type: 'extra', code: value }).code
    : value;
  return config.activityOptions.find(item => getActivityOptionCode(item) === normalized);
}

function getActivityOptionCode(option) {
  return option.id || option.value;
}

/**
 * Returns the daily hours as a French-formatted string (comma decimal).
 * Prefers the weekly scheduled hours from the page divided by 5.
 */
function getDailyHours(doc, fallbackHours) {
  const scheduledEl = findPSAElement(PSA_DOM_ELEMENTS.scheduledHoursTimesheetId);
  const weekly = parseHours(scheduledEl?.value ?? scheduledEl?.textContent);
  if (Number.isFinite(weekly) && weekly > 0) return (weekly / 5).toString().replace('.', ',');
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

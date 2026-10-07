'use strict';

/**
 * Fills rest checkboxes, rest time values, and transport/location codes.
 * Skips days that use an absence type flagged with `skipRestAndLocation`.
 * @param {Function} onDone - Called when filling is done and the form is saved.
 */
function fillInputsRest(holidays = [], onDone) {
  const intervalId = setInterval(async () => {
    if (!document.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.restsheetFormId))) return;

    const { currentConfig: settings } = await chrome.storage.sync.get({
      currentConfig: DEFAULT_CURRENT_CONFIG
    });

    const iframeDoc = getIframeDoc(PSA_DOM_ELEMENTS.dailyRestInputsName);
    if (!iframeDoc) return;
    const timesheetDoc = getIframeDoc(PSA_DOM_ELEMENTS.timesheetTableId) || iframeDoc;

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    const { holidayDates, periodEndDate } = parseHolidays(timesheetDoc, holidays);

    const skipDay = days.map((day, i) => {
      // 1. Skip if it's a detected bank holiday
      if (isDayHoliday(periodEndDate, holidayDates, i)) return true;

      // 2. Skip if it's an absence type flagged to skip (e.g., Vacation/RTT)
      const activities = Array.isArray(settings[`${day}Activities`])
        ? settings[`${day}Activities`]
        : settings[`${day}Extra`] && settings[`${day}Extra`] !== 'NONE'
          ? [{ type: 'extra', code: settings[`${day}Extra`] }] : [];
      const configuredAbsence = activities.some(activity => {
        if (activity.type !== 'extra') return false;
        const option = config.extraInputOptions.find(o => o.value === activity.code);
        return option?.skipRestAndLocation === true;
      });

      // PSA can prefill an absence even when it is not part of the extension
      // configuration. Preserve the same rest/location behavior in that case.
      return configuredAbsence || hasExistingAbsenceForDay(timesheetDoc, i);
    });

    fillRestCheckboxes(iframeDoc, skipDay);
    fillRestTimeValues(iframeDoc, settings.restTime, skipDay);

    const amCodes = days.map(day => settings[`${day}AM`] || settings[day] || 'NA');
    const pmCodes = days.map(day => settings[`${day}PM`] || settings[day] || 'NA');
    fillLocationCodes(iframeDoc, amCodes, pmCodes, skipDay);

    iframeDoc.querySelector('input[name="#ICSave"]')?.click();

    clearInterval(intervalId);
    if (onDone) onDone();
  }, 1000);
}

/** Returns true when PSA already has absence hours for the given weekday. */
function hasExistingAbsenceForDay(doc, dayIndex) {
  const absenceOptions = config.extraInputOptions.filter(option => option.skipRestAndLocation);

  return absenceOptions.some(option => {
    const row = resolveRowByLabel(doc, option.value, option.label);
    if (!row) return false;

    const input = row.querySelector(DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.activityInputIdForDay(dayIndex)));
    if (!input?.value) return false;

    const hours = parseFloat(input.value.replace(',', '.'));
    return Number.isFinite(hours) && hours > 0;
  });
}

/** Fills the 3 groups of daily rest checkboxes (7 days each). */
function fillRestCheckboxes(doc, skipDay) {
  const checkboxes = Array.from(doc.querySelectorAll(
    DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.dailyRestInputsName)
  ));
  for (let i = 0; i < 3; i++) {
    const group = checkboxes.slice(i * 7, i * 7 + 7);
    group.forEach((el, y) => {
      const isWeekend = y === 0 || y === 6;
      setAndDispatch(el, isWeekend || skipDay[y - 1] ? 'NA' : 'Y');
    });
  }
}

/** Fills rest time duration inputs (Mon–Fri = indices 1–5). */
function fillRestTimeValues(doc, restTime, skipDay) {
  const restValue = restTime.toString().replace('.', ',');
  const inputs = Array.from(doc.querySelectorAll(
    DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.dailyRestDurationInputsName)
  ));
  inputs.forEach((el, y) => {
    const isWeekday = y > 0 && y < 6;
    setAndDispatch(el, isWeekday && !skipDay[y - 1] ? restValue : '0');
  });
}

/** Fills transport/location codes (Mon–Fri = indices 1–5 in each 7-day group). */
function fillLocationCodes(doc, amCodes, pmCodes, skipDay) {
  const inputs = Array.from(doc.querySelectorAll(
    DOMElementSelectorUtil.toSelector(PSA_DOM_ELEMENTS.locationInputsName)
  ));
  const sessionCodes = [amCodes, pmCodes];

  for (let i = 0; i < 2; i++) {
    const group = inputs.slice(i * 7, i * 7 + 7);
    const codes = sessionCodes[i];
    for (let y = 1; y <= 5; y++) {
      if (group[y]) setAndDispatch(group[y], skipDay[y - 1] ? 'NA' : codes[y - 1]);
    }
  }
}

'use strict';

/**
 * Fills rest checkboxes, rest time values, and transport/location codes.
 * Skips days that use an absence type flagged with `skipRestAndLocation`.
 * @param {Function} onDone - Called when filling is done and the form is saved.
 */
function fillInputsRest(onDone) {
  const intervalId = setInterval(async () => {
    if (!document.getElementById('PT_AGSTARTPAGE_NUI')) return;

    const { currentConfig: settings } = await chrome.storage.sync.get({
      currentConfig: {
        restTime: 1,
        monday: 'NA', tuesday: 'NA', wednesday: 'NA', thursday: 'NA', friday: 'NA',
        mondayExtra: 'NONE', tuesdayExtra: 'NONE', wednesdayExtra: 'NONE',
        thursdayExtra: 'NONE', fridayExtra: 'NONE'
      }
    });

    const doc = getIframeDoc();
    if (!doc) return;

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    const skipDay = days.map(day => {
      const extraId = settings[day + 'Extra'];
      if (!extraId || extraId === 'NONE') return false;
      const option = config.extraInputOptions.find(o => o.value === extraId);
      return option?.skipRestAndLocation === true;
    });

    fillRestCheckboxes(doc, skipDay);
    fillRestTimeValues(doc, settings.restTime, skipDay);
    fillLocationCodes(doc, days.map(day => settings[day]), skipDay);

    doc.querySelector('input[name="#ICSave"]')?.click();

    clearInterval(intervalId);
    if (onDone) onDone();
  }, 1000);
}

/** Fills the 3 groups of daily rest checkboxes (7 days each). */
function fillRestCheckboxes(doc, skipDay) {
  const checkboxes = Array.from(doc.querySelectorAll('[name^="UC_DAILYREST"]'));
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
  const inputs = Array.from(doc.querySelectorAll('[name^="UC_TIME_LIN_WRK_UC_DAILYREST"]'));
  inputs.forEach((el, y) => {
    const isWeekday = y > 0 && y < 6;
    setAndDispatch(el, isWeekday && !skipDay[y - 1] ? restValue : '0');
  });
}

/** Fills transport/location codes (Mon–Fri = indices 1–5 in each 7-day group). */
function fillLocationCodes(doc, dailyCodes, skipDay) {
  const inputs = Array.from(doc.querySelectorAll('[name^="UC_LOCATION_A"]'));
  for (let i = 0; i < 2; i++) {
    const group = inputs.slice(i * 7, i * 7 + 7);
    for (let y = 1; y <= 5; y++) {
      if (group[y]) setAndDispatch(group[y], skipDay[y - 1] ? 'NA' : dailyCodes[y - 1]);
    }
  }
}

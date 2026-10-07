'use strict';

const ACTIVITY_BADGES = {
    bicycle: {
        prefix: 'bike',
        subject: 'de trajets vélo',
        countKey: 'bicycleCount',
        creditedDatesKey: 'creditedGreenDates',
        manualStep: null,
        isTracked: option => option.green
    },
    telework: {
        prefix: 'telework',
        subject: 'de jours de télétravail',
        countKey: 'teleworkCount',
        creditedDatesKey: 'creditedTeleworkDates',
        manualStep: 0.5,
        isTracked: option => option.telework
    }
};

async function initializeActivityBadges(configData, notify) {
    try {
        const response = await fetch(chrome.runtime.getURL('badges/badges.html'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        document.getElementById('activityBadges').innerHTML = await response.text();
    } catch (error) {
        console.error('Unable to load activity badges:', error);
        return () => {};
    }

    const transportOptions = configData?.transportOptions || [];
    const trackedValues = Object.fromEntries(
        Object.entries(ACTIVITY_BADGES).map(([name, badge]) => [
            name,
            new Set(transportOptions.filter(badge.isTracked).map(option => option.value))
        ])
    );

    for (const badge of Object.values(ACTIVITY_BADGES)) {
        chrome.storage.sync.get({ [badge.countKey]: 0 }, items => {
            updateActivityBadgeDisplay(badge.prefix, items[badge.countKey]);
        });
        setupActivityBadgeControls(badge, notify);
    }

    return (periodEndDate, dailyTransportValues) => {
        for (const [name, badge] of Object.entries(ACTIVITY_BADGES)) {
            updateActivityBadgeCounter(badge, trackedValues[name], periodEndDate, dailyTransportValues);
        }
    };
}

function setupActivityBadgeControls(badge, notify) {
    const { prefix } = badge;
    const modifyButton = document.getElementById(`${prefix}ModifyBtn`);
    const resetButton = document.getElementById(`${prefix}ResetBtn`);
    const updateArea = document.getElementById(`${prefix}UpdateArea`);
    const input = document.getElementById(`${prefix}ManualInput`);
    const countElement = document.getElementById(`${prefix}Count`);

    modifyButton?.addEventListener('click', () => {
        if (updateArea) updateArea.hidden = false;
        modifyButton.hidden = true;
        if (resetButton) resetButton.hidden = true;
        if (input) {
            input.value = countElement?.textContent || '0';
            input.focus();
        }
    });

    document.getElementById(`${prefix}ConfirmBtn`)?.addEventListener('click', () => {
        const value = Number(input?.value);
        if (!Number.isFinite(value) || value < 0 || value > 365 || (badge.manualStep && value / badge.manualStep % 1 !== 0)) {
            const stepHint = badge.manualStep ? `, par pas de ${badge.manualStep}` : '';
            notify(`Entre 0 et 365${stepHint}`, 'warning');
            return;
        }

        chrome.storage.sync.set({ [badge.countKey]: value }, () => {
            updateActivityBadgeDisplay(prefix, value);
            if (updateArea) updateArea.hidden = true;
            if (modifyButton) modifyButton.hidden = false;
            if (resetButton) resetButton.hidden = false;
            notify(`Compteur ${badge.subject} mis à jour`, 'success');
        });
    });

    document.getElementById(`${prefix}ResetBtn`)?.addEventListener('click', () => {
        if (!confirm(`Réinitialiser le compteur ${badge.subject} ?`)) return;
        chrome.storage.sync.set({ [badge.countKey]: 0, [badge.creditedDatesKey]: [] }, () => {
            updateActivityBadgeDisplay(prefix, 0);
            notify(`Compteur ${badge.subject} réinitialisé`, 'success');
        });
    });
}

function updateActivityBadgeCounter(badge, trackedValues, periodEndDateStr, dailyTransportValues) {
    if (!periodEndDateStr) return;
    const { prefix } = badge;
    const [day, month, year] = periodEndDateStr.split('/').map(Number);
    const periodEndDate = new Date(year, month - 1, day);
    periodEndDate.setHours(12, 0, 0, 0);

    chrome.storage.sync.get({ [badge.countKey]: 0, [badge.creditedDatesKey]: [] }, items => {
        let count = items[badge.countKey];
        let creditedDates = [...items[badge.creditedDatesKey]];
        let changed = false;

        dailyTransportValues.forEach((sessions, dayIndex) => {
            const date = new Date(periodEndDate);
            date.setDate(date.getDate() - (5 - dayIndex));
            const dateKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

            for (const session of ['AM', 'PM']) {
                const key = `${dateKey}_${session}`;
                const shouldCount = trackedValues.has(sessions[session]);
                const alreadyCounted = creditedDates.includes(key);

                if (shouldCount && !alreadyCounted) {
                    count += 0.5;
                    creditedDates.push(key);
                    changed = true;
                } else if (!shouldCount && alreadyCounted) {
                    count = Math.max(0, count - 0.5);
                    creditedDates = creditedDates.filter(date => date !== key);
                    changed = true;
                }
            }
        });

        if (!changed) return;
        chrome.storage.sync.set({ [badge.countKey]: count, [badge.creditedDatesKey]: creditedDates }, () => {
            updateActivityBadgeDisplay(prefix, count);
        });
    });
}

function updateActivityBadgeDisplay(prefix, count) {
    const element = document.getElementById(`${prefix}Count`);
    if (element) element.textContent = count;
}

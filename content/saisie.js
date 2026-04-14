'use strict';

/** 
 * Reminder script that runs on all pages to prompt the user to fill their PSA timesheet.
 */

const PSA_DEEP_LINK = 'https://psa-fs.ent.cgi.com/psc/fsprda/EMPLOYEE/ERP/c/NUI_FRAMEWORK.PT_AGSTARTPAGE_NUI.GBL?CONTEXTIDPARAMS=TEMPLATE_ID%3aPTPPNAVCOL&scname=ADMN_UC_SELF_SERVICE_TIME&PanelCollapsible=Y&PTPPB_GROUPLET_ID=UCTI1000&CRefName=ADMN_NAVCOLL_1&AJAXTRANSFER=Y';

const saisieOrphanMessageId = `${chrome.runtime.id}orphanCheck`;
window.dispatchEvent(new Event(saisieOrphanMessageId));
window.addEventListener(saisieOrphanMessageId, unregisterOrphan);

const saisieIntervalId = setInterval(async () => {
    if (unregisterOrphan()) return;

    const { saisieEffectuee } = await chrome.storage.local.get(["saisieEffectuee"]);

    // If timesheet was recently filled (within last 6 days), don't remind
    if (saisieEffectuee) {
        const lastDate = parseFrenchDate(saisieEffectuee);
        const diffDays = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
        if (diffDays < 6) return;
    }

    const isValidDay = await isValidDayForReminder();
    if (isValidDay) {
        const redirect = window.confirm('🗓️ Rappel PSA Time\n\nIl est l\'heure de faire ta saisie !');
        if (redirect) {
            window.open(PSA_DEEP_LINK, '_blank');
        }
    }
}, 1000 * 60 * 60); // Check once an hour to be less intrusive

/**
 * Checks if today is the correct day to show the reminder.
 * Logic: Friday (5) or sooner if Friday is a holiday.
 */
async function isValidDayForReminder() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat

    if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Never on weekends

    const holidays = await chrome.runtime.sendMessage({
        message: 'GET_PUBLIC_HOLIDAYS',
        data: today.toISOString()
    });

    let targetDay = 5; // Start with Friday
    if (holidays && holidays.length > 0) {
        const holidayDays = holidays.map(h => new Date(h.date).getDay()).sort((a, b) => b - a);
        holidayDays.forEach(hDay => {
            if (hDay === targetDay) targetDay--;
        });
    }

    return dayOfWeek >= targetDay;
}

function parseFrenchDate(dateStr) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
}

function unregisterOrphan() {
    if (chrome.runtime.id) return false;
    window.removeEventListener(saisieOrphanMessageId, unregisterOrphan);
    clearInterval(saisieIntervalId);
    return true;
}
// ============================================================
// CONSTANTS
// ============================================================

const TARGET_URL = 'https://psa-fs.ent.cgi.com/psc/fsprda/EMPLOYEE/ERP/c/';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_BY_YEAR = 365;
const GITHUB_REPOSITORY = 'SimonPApside/psa-speedrun';
const GITHUB_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let DEFAULT_PROFILE_ICON = '';
let PROFILE_ICONS = new Set();

// Populated at startup from config.json (transportOptions with green:true)
let greenTransportValues = new Set();

// Loaded from JSON at startup
let DEFAULT_CONFIG = null;
let extraInputOptions = [];
let projectCodesCache = [];


// Connect a port to the background worker.
// When the side panel closes, the port disconnects and the background updates the FAB.
chrome.runtime.connect({ name: 'sidepanel' });

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load JSON config files (options + default/empty configs)
    const [configData, defaultProfile] = await Promise.all([
        loadJson('resources/config.json'),
        loadJson('resources/default_profile.json')
    ]);

    DEFAULT_CONFIG = defaultProfile;

    if (configData) {
        populateSelectOptions(configData);
        if (configData.transportOptions) {
            greenTransportValues = new Set(
                configData.transportOptions
                    .filter(opt => opt.green)
                    .map(opt => opt.value)
            );
        }
    }

    // 2. Restore saved state from storage
    const defaultStorage = buildDefaultStorage();
    chrome.storage.sync.get(defaultStorage, (items) => {
        updateProfileSelectVisuals(items.savedProfiles);
        // Never restore 'custom' on startup — always start on profile1
        const profileId = items.activeProfileId === 'custom' ? 'profile1' : items.activeProfileId;
        setProfile(profileId, items);
    });

    // 3. Check new version
    checkForAvailableUpdate();

    // 4. Profile selector
    const profileSelect = document.getElementById('activeProfileSelect');
    if (profileSelect) {
        profileSelect.addEventListener('change', (e) => {
            chrome.storage.sync.get(buildDefaultStorage(), (items) => {
                setProfile(e.target.value, items);
            });
        });
    }

    // 5. Form save
    const configForm = document.getElementById('configForm');
    if (configForm) {
        configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveCurrentConfig();
        });
    }

    // 6. Reset & Fill buttons
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetConfig);
    const fillBtn = document.getElementById('fillFormButton');
    if (fillBtn) fillBtn.addEventListener('click', fillForm);

    // 7. Activity selector listeners
    DAYS.forEach(day => {
        const activityEl = document.getElementById(`${day}Activity`);
        if (activityEl) {
            activityEl.addEventListener('change', () => updateStrikethrough(day));
        }
        const activityMenu = document.getElementById(`${day}ActivityMenu`);
        if (activityMenu) {
            activityMenu.addEventListener('change', (event) => {
                const checkbox = event.target.closest('input[type="checkbox"]');
                if (!checkbox) return;
                const option = Array.from(activityEl.options).find(item => item.value === checkbox.value);
                if (option) option.selected = checkbox.checked;
                updateActivityPicker(day);
                updateStrikethrough(day);
            });
        }
        const activityPicker = document.querySelector(`#${day}Activity`)?.closest('.activity-picker');
        if (activityPicker) {
            activityPicker.addEventListener('toggle', () => {
                if (activityPicker.open) positionActivityPicker(activityPicker);
            });
        }
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('.activity-picker')) return;
        document.querySelectorAll('.activity-picker[open]').forEach(picker => {
            picker.removeAttribute('open');
        });
    });

    // 8. Bicycle badge: load count & register reset
    chrome.storage.sync.get({ bicycleCount: 0 }, (items) => {
        updateBikeCountDisplay(items.bicycleCount);
    });
    
    const bikeModifyBtn = document.getElementById('bikeModifyBtn');
    if (bikeModifyBtn) {
        bikeModifyBtn.addEventListener('click', (e) => {
            const area = document.getElementById('bikeUpdateArea');
            const input = document.getElementById('bikeManualInput');
            const currentCount = document.getElementById('bikeCount')?.textContent || '0';

            if (area) area.style.display = 'flex';
            e.target.style.display = 'none'; // Hide the 'Modifier' button
            if (input) {
                input.value = currentCount;
                input.focus();
            }
        });
    }

    const bikeConfirmBtn = document.getElementById('bikeConfirmBtn');
    if (bikeConfirmBtn) {
        bikeConfirmBtn.addEventListener('click', () => {
            const input = document.getElementById('bikeManualInput');
            if (!input) return;
            const val = parseFloat(input.value);

            if (isNaN(val) || val < 0 || val > DAY_BY_YEAR) {
                flashInstruction(`⚠️ Entre 0 et ${DAY_BY_YEAR}`, 'warning');
                return;
            }

            chrome.storage.sync.set({ bicycleCount: val }, () => {
                updateBikeCountDisplay(val);
                const area = document.getElementById('bikeUpdateArea');
                if (area) area.style.display = 'none';
                if (bikeModifyBtn) bikeModifyBtn.style.display = 'inline-block'; // Show the button again
                flashInstruction('🚲 Compteur mis à jour', 'success');
            });
        });
    }

    const bikeResetBtn = document.getElementById('bikeResetBtn');
    if (bikeResetBtn) {
        bikeResetBtn.addEventListener('click', () => {
            if (confirm('Réinitialiser le compteur de trajets vélo ?')) {
                chrome.storage.sync.set({ bicycleCount: 0, creditedGreenDates: [] }, () => {
                    updateBikeCountDisplay(0);
                    flashInstruction('🚲 Compteur réinitialisé', 'success');
                });
            }
        });
    }

    // 9. Project codes auto-fill
    await getProjetAndActivityData();

    const refreshProjectsBtn = document.getElementById('refreshProjectsBtn');
    if (refreshProjectsBtn) {
        refreshProjectsBtn.addEventListener('click', async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.url || !tab.url.includes(TARGET_URL)) {
                flashInstruction("❌ Action seulement sur PSA", 'warning');
                return;
            }

            flashInstruction("⏳ Recherche en cours...", "info");
            chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PROJECT_CODES', force: true }, async (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                    flashInstruction("⚠️ Échec de la recherche", "warning");
                    return;
                }
                const { projectCodes } = await getProjetAndActivityData({ removeMissing: true });
                flashInstruction(`✓ ${projectCodes.length} codes trouvés`, "success");
            });
        });
    }

    // Open/Close afternoon localization select
    document.querySelectorAll('.day-localization-morning button').forEach((el) => {
        el.addEventListener('click', () => {
            const parent = el.parentElement.parentElement;
            parent.dataset.splitted = !(parent.dataset.splitted === 'true');
        });
    });

    // Autofill afternoon select if selects are splitted
    document.querySelectorAll('.day-localization-morning select').forEach((el) => {
        el.addEventListener('click', () => {
            const parent = el.parentElement.parentElement;
            if (parent.dataset.splitted === 'false') {
                parent.parentNode.querySelector('.day-localization-afternoon select').value = el.value;
            }
        });
    });

    // 10. Save reminder settings on any change in the UI
    ['reminderTime', 'rem-day-1', 'rem-day-2', 'rem-day-3', 'rem-day-4', 'rem-day-5'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => getFormConfig());
    });

    // 11. Check PSA page status
    await checkExtensionStatus();

    // 12. Listen for status updates from content script
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'TABLES_DETECTED') {
            checkExtensionStatus();
            getProjetAndActivityData();
        } else if (msg.type === 'PROJECT_CODES_UPDATED') {
            getProjetAndActivityData({ removeMissing: true });
        }
    });
});

function buildDefaultStorage() {
    return {
        currentConfig: DEFAULT_CONFIG,
        savedProfiles: { profile1: null, profile2: null },
        activeProfileId: 'profile1',
        reminderDays: [4],
        reminderTime: '11:00'
    };
}

/** Loads the latest project list and rebuilds all project/activity controls. */
async function getProjetAndActivityData({ removeMissing = false } = {}) {
    const { projectCodes = [] } = await chrome.storage.local.get({ projectCodes: [] });
    projectCodesCache = projectCodes;
    populateProjectDatalist(projectCodes);
    populateActivitySelects();

    if (removeMissing) {
        const availableProjects = new Set(projectCodes);
        const currentConfig = removeMissingProjects(getFormConfig(), availableProjects);
        const stored = await chrome.storage.sync.get(buildDefaultStorage());
        const savedProfiles = { ...stored.savedProfiles };
        Object.keys(savedProfiles).forEach(profileId => {
            if (savedProfiles[profileId]) {
                savedProfiles[profileId] = removeMissingProjects(savedProfiles[profileId], availableProjects);
            }
        });
        await chrome.storage.sync.set({ currentConfig, savedProfiles });
        loadConfigIntoForm(currentConfig);
        updateProfileSelectVisuals(savedProfiles);
    }

    return { projectCodes, extraInputOptions };
}

// ============================================================
// PROFILE MANAGEMENT
// ============================================================

/**
 * Activates a profile: loads its config into the form and updates the UI.
 * For 'custom', clears all fields so the user can fill manually.
 */
function setProfile(profileId, storageItems) {
    const profileSelect = document.getElementById('activeProfileSelect');
    if (profileSelect) profileSelect.value = profileId;
    const profileIcon = document.getElementById('profileIcon');
    if (profileIcon) profileIcon.disabled = profileId === 'custom';
    updateFooterVisibility(profileId);

    if (profileId === 'custom') {
        loadConfigIntoForm({ ...DEFAULT_CONFIG, profileName: 'Personnalisé' });
        const profileName = document.getElementById('profileName');
        if (profileName && profileName.parentElement) {
            profileName.parentElement.style.display = 'none';
        }
        openAccordion();
        return;
    }

    const profileName = document.getElementById('profileName');
    if (profileName && profileName.parentElement) {
        profileName.parentElement.style.display = 'flex';
    }
    const config = profileId === 'profile1'
        ? (storageItems.savedProfiles.profile1 || { ...DEFAULT_CONFIG, profileName: 'Profil 1' })
        : (storageItems.savedProfiles.profile2 || { ...DEFAULT_CONFIG, profileName: 'Profil 2' });

    chrome.storage.sync.set({ currentConfig: config, activeProfileId: profileId });
    loadConfigIntoForm(config);
}

function saveCurrentConfig() {
    const profileSelect = document.getElementById('activeProfileSelect');
    if (!profileSelect) return;
    const profileId = profileSelect.value;
    if (profileId === 'custom') return; // Custom is never saved

    const config = getFormConfig();

    chrome.storage.sync.get(buildDefaultStorage(), (items) => {
        const savedProfiles = { ...items.savedProfiles, [profileId]: config };
        chrome.storage.sync.set({ currentConfig: config, activeProfileId: profileId, savedProfiles }, () => {
            updateProfileSelectVisuals(savedProfiles);
            flashInstruction('✓ Configuration enregistrée !', 'success');
            // Collapse accordion after save
            setTimeout(closeAccordion, 1000);
        });
    });
}

function resetConfig() {
    if (!confirm('Réinitialiser la configuration du profil aux valeurs par défaut ?')) return;

    const defaultStorage = buildDefaultStorage();
    chrome.storage.sync.set(defaultStorage, () => {
        updateProfileSelectVisuals(defaultStorage.savedProfiles);
        setProfile('profile1', defaultStorage);
        flashInstruction('✓ Réinitialisé aux valeurs par défaut', 'success');
    });
}

// ============================================================
// FORM FILL
// ============================================================

async function fillForm() {
    // Fold the config accordion back
    const accordion = document.getElementById('configAccordion');
    const btn = document.getElementById('toggleConfigBtn');
    if (accordion) accordion.classList.remove('open');
    if (btn) btn.classList.remove('open');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const profileSelect = document.getElementById('activeProfileSelect');
    if (!profileSelect) return;
    const profileId = profileSelect.value;

    // Fetch period info to increment bike counter for the whole week
    chrome.tabs.sendMessage(tab.id, { type: 'GET_PERIOD_INFO' }, (response) => {
        if (response && response.periodEndDate) {
            incrementBikeCountIfNeeded(response.periodEndDate);
        }

        if (profileId === 'custom') {
            // Temporarily write the form values to storage so content.js can read them
            const config = getFormConfig();
            chrome.storage.sync.set({ currentConfig: config }, () => {
                chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM' }, (fillResponse) => {
                    // Clean up only after content.js confirms fillInputsRest is done
                    if (fillResponse && fillResponse.success) {
                        chrome.storage.sync.remove('currentConfig');
                    }
                });
            });
        } else {
            chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM' });
        }
    });
}

// ============================================================
// STATUS / INSTRUCTIONS
// ============================================================

async function checkExtensionStatus() {
    const fillButton = document.getElementById('fillFormButton');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url || !tab.url.includes(TARGET_URL)) {
            showInstruction("❌ S'utilise sur la page de saisie PSA", 'warning');
            if (fillButton) fillButton.style.display = 'none';
            return;
        }

        // Use the background script as the source of truth for status
        chrome.runtime.sendMessage({ type: 'GET_STATUS', tabId: tab.id }, (response) => {
            if (response && response.status && response.status.loaded) {
                showInstruction('✓ Prêt à remplir !', 'success');
                if (fillButton) fillButton.style.display = 'block';
            } else {
                // If background doesn't know, it might be loading or the tables aren't there
                showInstruction("⏳ Recherche des tables PSA...", 'warning');
                if (fillButton) fillButton.style.display = 'none';
            }
        });
    } catch (err) {
        console.error('Extension status check failed:', err);
        showInstruction('❌ Erreur de connexion', 'warning');
        if (fillButton) fillButton.style.display = 'none';
    }
}

/** Permanently sets the instruction bar message. */
function showInstruction(msg, type) {
    const el = document.getElementById('instructions');
    if (el) {
        el.textContent = msg;
        el.className = `status-bar show ${type}`;
    }
}

/**
 * Temporarily replaces the instruction bar with a feedback message,
 * then restores the previous message after 1.5s.
 */
function flashInstruction(msg, type) {
    const el = document.getElementById('instructions');
    if (!el) return;
    const prevText = el.textContent;
    const prevClass = el.className;

    el.textContent = msg;
    el.className = `status-bar show ${type}`;

    setTimeout(() => {
        el.textContent = prevText;
        el.className = prevClass;
    }, 1500);
}

// ============================================================
// VERSION CHECK
// ============================================================

async function checkForAvailableUpdate() {
    try {
        const latestRelease = await getLatestRelease();
        if (!latestRelease?.tag_name) return;

        const currentVersion = chrome.runtime.getManifest().version;
        const latestVersion = normalizeVersion(latestRelease.tag_name);

        if (isVersionNewer(latestVersion, currentVersion)) {
            showUpdateBanner(currentVersion, latestVersion, latestRelease.html_url);
        }
    } catch (err) {
        console.info('Update check skipped:', err);
    }
}

function getLatestRelease() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({ latestReleaseCache: null }, async ({ latestReleaseCache }) => {
            const now = Date.now();

            if (
                latestReleaseCache?.checkedAt &&
                latestReleaseCache?.release &&
                now - latestReleaseCache.checkedAt < UPDATE_CHECK_INTERVAL_MS
            ) {
                resolve(latestReleaseCache.release);
                return;
            }

            try {
                const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
                    headers: { Accept: 'application/vnd.github+json' }
                });

                if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

                const release = await response.json();
                if (!release.tag_name || !release.html_url) {
                    throw new Error('GitHub latest release response is missing tag_name or html_url');
                }

                chrome.storage.local.set({
                    latestReleaseCache: {
                        checkedAt: now,
                        release: {
                            tag_name: release.tag_name,
                            html_url: release.html_url
                        }
                    }
                });
                resolve(release);
            } catch (err) {
                reject(err);
            }
        });
    });
}

function showUpdateBanner(currentVersion, latestVersion, releaseUrl) {
    const banner = document.getElementById('updateBanner');
    const text = document.getElementById('updateBannerText');
    const link = document.getElementById('updateBannerLink');

    if (!banner || !text || !link) return;

    text.textContent = `Nouvelle version disponible: ${latestVersion} (installée: ${currentVersion})`;
    link.href = releaseUrl;
    banner.hidden = false;
    banner.classList.add('show');
}

function normalizeVersion(version) {
    return String(version || '')
        .trim()
        .replace(/^v/i, '')
        .split('-')[0];
}

function isVersionNewer(candidate, current) {
    const candidateParts = normalizeVersion(candidate).split('.').map(toVersionNumber);
    const currentParts = normalizeVersion(current).split('.').map(toVersionNumber);
    const maxLength = Math.max(candidateParts.length, currentParts.length);

    for (let i = 0; i < maxLength; i++) {
        const candidatePart = candidateParts[i] || 0;
        const currentPart = currentParts[i] || 0;

        if (candidatePart > currentPart) return true;
        if (candidatePart < currentPart) return false;
    }

    return false;
}

function toVersionNumber(part) {
    const number = Number.parseInt(part, 10);
    return Number.isNaN(number) ? 0 : number;
}

// ============================================================
// UI HELPERS
// ============================================================

function toggleAccordion() {
    const accordion = document.getElementById('configAccordion');
    const btn = document.getElementById('toggleConfigBtn');
    if (!accordion) return;
    const isOpening = !accordion.classList.contains('open');

    accordion.classList.toggle('open');
    if (btn) btn.classList.toggle('open');
    document.body.classList.toggle('expanded', isOpening);
}

function openAccordion() {
    const accordion = document.getElementById('configAccordion');
    const btn = document.getElementById('toggleConfigBtn');
    if (accordion) accordion.classList.add('open');
    if (btn) btn.classList.add('open');
    document.body.classList.add('expanded');
}

function closeAccordion() {
    const accordion = document.getElementById('configAccordion');
    const btn = document.getElementById('toggleConfigBtn');
    if (accordion) accordion.classList.remove('open');
    if (btn) btn.classList.remove('open');
    document.body.classList.remove('expanded');
}

function updateFooterVisibility(profileId) {
    const footer = document.querySelector('.config-footer');
    if (footer) footer.classList.toggle('hidden', profileId === 'custom');
}

function updateProfileSelectVisuals(savedProfiles) {
    const select = document.getElementById('activeProfileSelect');
    if (!select) return;

    const p1 = select.querySelector('option[value="profile1"]');
    if (p1) {
        const name = savedProfiles.profile1?.profileName || 'Profil 1';
        const icon = savedProfiles.profile1?.profileIcon || DEFAULT_PROFILE_ICON;
        p1.textContent = `${icon} ${name}${savedProfiles.profile1 ? '' : ' (Vide)'}`;
    }

    const p2 = select.querySelector('option[value="profile2"]');
    if (p2) {
        const name = savedProfiles.profile2?.profileName || 'Profil 2';
        const icon = savedProfiles.profile2?.profileIcon || DEFAULT_PROFILE_ICON;
        p2.textContent = `${icon} ${name}${savedProfiles.profile2 ? '' : ' (Vide)'}`;
    }
}

// ============================================================
// FORM HELPERS
// ============================================================

function loadConfigIntoForm(config) {
    if (!config) return;

    config = normalizeActivitiesConfig(config);

    // Older saved profiles have no icon field; preserve their original person icon.
    const profileIcon = document.getElementById('profileIcon');
    console.log(config);
    if (profileIcon) profileIcon.value = getProfileIcon(config.profileIcon);

    // Standard fields
    Object.entries(config).forEach(([key, value]) => {
        const el = document.getElementById(key);
        if (el) el.value = key === 'profileIcon' ? getProfileIcon(value) : value;
    });

    // Reminder fields (loaded from global storage, not profile-specific)
    chrome.storage.sync.get(['reminderDays', 'reminderTime'], (items) => {
        // Load multiple days
        if (items.reminderDays) {
            [1, 2, 3, 4, 5].forEach(d => {
                const el = document.getElementById(`rem-day-${d}`);
                if (el) el.checked = items.reminderDays.includes(d);
            });
        }

        const reminderTimeEl = document.getElementById('reminderTime');
        if (items.reminderTime !== undefined && reminderTimeEl) {
            reminderTimeEl.value = items.reminderTime;
        }
    });

    DAYS.forEach(day => syncActivitySelectFromStored(day, config[`${day}Activities`]));
}

/**
 * TODO: DELETE Function of migration to new activities array
 * @param {*} config 
 * @returns 
 */
function normalizeActivitiesConfig(config) {
    const normalized = { ...config };
    DAYS.forEach(day => {
        if (!Array.isArray(normalized[`${day}Activities`])) {
            const project = normalized[`${day}Project`];
            const extra = normalized[`${day}Extra`];
            normalized[`${day}Activities`] = project
                ? [{ type: 'project', code: project }]
                : extra && extra !== 'NONE' ? [{ type: 'extra', code: extra }] : [];
        }
        delete normalized[`${day}Project`];
        delete normalized[`${day}Extra`];
    });
    return normalized;
}

function updateStrikethrough(day) {
    const activitySelect = document.getElementById(`${day}Activity`);
    if (activitySelect) {
        const hasExtra = Array.from(activitySelect.selectedOptions).some(option => option.value.startsWith('extra:'));
        activitySelect.classList.toggle('activity-extra', hasExtra);
        activitySelect.classList.toggle('activity-placeholder', !activitySelect.value);
    }
}

function getFormConfig() {
    const config = {};
    const fields = [...Object.keys(DEFAULT_CONFIG)];
    fields.forEach(key => {
        const activitiesDay = DAYS.find(day => key === `${day}Activities`);
        const el = document.getElementById(activitiesDay ? `${activitiesDay}Activity` : key);
        if (!el) return;
        if (DAYS.some(day => key === `${day}Activities`)) {
            config[key] = Array.from(el.selectedOptions, option => {
                const [type, ...parts] = option.value.split(':');
                return { type, code: parts.join(':') };
            });
        } else {
            config[key] = el.type === 'number' || key === 'workHours' ? parseFloat(el.value) : el.value;
        }
    });

    // Save reminder settings globally
    const reminderDays = [1, 2, 3, 4, 5]
        .filter(d => document.getElementById(`rem-day-${d}`)?.checked)
        .map(Number);

    chrome.storage.sync.set({
        reminderDays: reminderDays,
        reminderTime: document.getElementById('reminderTime').value
    });

    return config;
}

function getProfileIcon(icon) {
    return PROFILE_ICONS.has(icon) ? icon : DEFAULT_PROFILE_ICON;
}

function populateSelectOptions(config) {
    if (Array.isArray(config.profileIcons) && config.profileIcons.length) {
        PROFILE_ICONS = new Set(config.profileIcons);
        DEFAULT_PROFILE_ICON = PROFILE_ICONS.values().next().value;
        populateSelect('profileIcon', Array.from(PROFILE_ICONS));
    }
    if (config.contractualHours) populateContractualHoursSelect(config.contractualHours);
    if (config.restTimeOptions) populateSelect('restTime', config.restTimeOptions);

    if (config.transportOptions) {
        DAYS.forEach(day => {
            populateSelect(day + 'AM', config.transportOptions);
            populateSelect(day + 'PM', config.transportOptions);
        });
    }
    if (config.extraInputOptions) {
        extraInputOptions = config.extraInputOptions;
        populateActivitySelects();
    }
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '';
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = typeof opt === 'object' ? opt.value : opt;
        option.textContent = typeof opt === 'object' ? opt.label : opt;
        select.appendChild(option);
    });
}

function populateContractualHoursSelect(options) {
    const select = document.getElementById('workHours');
    if (!select) return;
    select.innerHTML = '';
    options.filter(option => option.psaTimesheet !== null).forEach(option => {
        const element = document.createElement('option');
        element.value = option.psaTimesheet;
        element.textContent = `${option.description} (${option.psaTimesheet} h/j)`;
        select.appendChild(element);
    });
}

function populateProjectDatalist(codes) {
    const datalist = document.getElementById('projectCodesList');
    if (!datalist) return;
    datalist.innerHTML = '';
    const uniqueCodes = [...new Set(codes)].sort();
    uniqueCodes.forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        datalist.appendChild(option);
    });
}

function populateActivitySelects() {
    DAYS.forEach(day => {
        const select = document.getElementById(`${day}Activity`);
        if (!select) return;

        select.innerHTML = '';
        select.dataset.placeholder = 'Choisir une activite';
        select.title = select.dataset.placeholder;

        const projectGroup = document.createElement('optgroup');
        projectGroup.label = '📁 Projets';

        const projectCodes = [...new Set(projectCodesCache)].sort();

        projectCodes.forEach(code => {
            const option = document.createElement('option');
            option.value = `project:${code}`;
            option.textContent = `${code}`;
            option.dataset.kind = 'project';
            projectGroup.appendChild(option);
        });

        const extraGroup = document.createElement('optgroup');
        extraGroup.label = '✨ Absences et autres';

        extraInputOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = `extra:${opt.value}`;
            option.textContent = opt.label ? `${opt.label}` : 'Aucune';
            option.dataset.kind = 'extra';
            extraGroup.appendChild(option);
        });

        select.appendChild(projectGroup);
        select.appendChild(extraGroup);
        syncActivitySelectFromStored(day, select.dataset.savedActivities
            ? JSON.parse(select.dataset.savedActivities) : []);
        buildActivityPickerMenu(day);
    });
}

function buildActivityPickerMenu(day) {
    const select = document.getElementById(`${day}Activity`);
    const menu = document.getElementById(`${day}ActivityMenu`);
    if (!select || !menu) return;
    menu.innerHTML = '';
    Array.from(select.querySelectorAll('optgroup')).forEach(group => {
        const heading = document.createElement('div');
        heading.className = 'activity-picker-group-title';
        heading.textContent = group.label;
        menu.appendChild(heading);
        group.querySelectorAll('option').forEach(option => {
            const label = document.createElement('label');
            label.className = 'activity-picker-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = option.value;
            const text = document.createElement('span');
            text.textContent = option.textContent;
            label.append(checkbox, text);
            menu.appendChild(label);
        });
    });
    updateActivityPicker(day);
}

function updateActivityPicker(day) {
    const select = document.getElementById(`${day}Activity`);
    const label = document.getElementById(`${day}ActivityLabel`);
    const menu = document.getElementById(`${day}ActivityMenu`);
    if (!select || !label || !menu) return;
    const selected = Array.from(select.selectedOptions);
    label.textContent = selected.length > 1
        ? `${selected.length} activités`
        : selected.length === 1 ? selected[0].textContent : 'Choisir…';
    label.title = selected.map(option => option.textContent).join(', ');
    menu.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = selected.some(option => option.value === checkbox.value);
    });
}

function positionActivityPicker(picker) {
    const menu = picker.querySelector('.activity-picker-menu');
    const summary = picker.querySelector('summary');
    if (!menu || !summary) return;

    const margin = 8;
    const width = Math.max(1, Math.min(300, window.innerWidth - margin * 2));
    const bounds = summary.getBoundingClientRect();
    const left = Math.min(
        Math.max(bounds.left, margin),
        window.innerWidth - width - margin
    );
    const menuHeight = Math.min(240, window.innerHeight - margin * 2);
    const top = bounds.bottom + menuHeight > window.innerHeight - margin
        ? Math.max(margin, bounds.top - menuHeight) : bounds.bottom;
    menu.style.position = 'fixed';
    menu.style.width = `${width}px`;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function removeMissingProjects(config, availableProjects) {
    const updated = { ...config };
    DAYS.forEach(day => {
        const activitiesKey = `${day}Activities`;
        if (Array.isArray(updated[activitiesKey])) {
            updated[activitiesKey] = updated[activitiesKey].filter(activity =>
                activity.type !== 'project' || availableProjects.has(activity.code)
            );
        }
        const legacyProjectKey = `${day}Project`;
        if (updated[legacyProjectKey] && !availableProjects.has(updated[legacyProjectKey])) {
            updated[legacyProjectKey] = '';
        }
    });
    return updated;
}

function syncActivitySelectFromStored(day, activities) {
    const select = document.getElementById(`${day}Activity`);
    if (!select) return;
    const selected = activities || [];
    const projects = selected.filter(item => item.type === 'project').map(item => item.code);
    select.dataset.savedProjects = JSON.stringify(projects);
    select.dataset.savedActivities = JSON.stringify(selected);
    const selectedValues = new Set(selected.map(item => `${item.type}:${item.code}`));
    Array.from(select.options).forEach(option => { option.selected = selectedValues.has(option.value); });
    updateActivityPicker(day);
    updateStrikethrough(day);
}

// ============================================================
// BICYCLE COUNTER
// ============================================================

/**
 * Reads the 5 transport selects and increments bicycleCount in storage
 * for each green day that has not been counted yet for its specific date.
 *
 * @param {string} periodEndDateStr - The "DD/MM/YYYY" period end date from PSA.
 */
function incrementBikeCountIfNeeded(periodEndDateStr) {
    if (!periodEndDateStr) return;

    // periodEndDateStr is "DD/MM/YYYY" from PSA (Saturday)
    const [day, month, year] = periodEndDateStr.split('/').map(Number);
    const periodEndDate = new Date(year, month - 1, day);
    periodEndDate.setHours(12, 0, 0, 0); // safeguard for DST/timezone shifts

    chrome.storage.sync.get({ bicycleCount: 0, creditedGreenDates: [] }, (items) => {
        let newCount = items.bicycleCount;
        let newCreditedDates = [...items.creditedGreenDates];
        let hasChanged = false;

        for (let i = 0; i < 5; i++) {
            const dayKey = DAYS[i];
            const amEl = document.getElementById(dayKey + 'AM');
            const pmEl = document.getElementById(dayKey + 'PM');
            if (!amEl || !pmEl) continue;

            const amValue = amEl.value;
            const pmValue = pmEl.value;
            
            // 0.5 points for morning green, 0.5 points for afternoon green
            const amPoints = greenTransportValues.has(amValue) ? 0.5 : 0;
            const pmPoints = greenTransportValues.has(pmValue) ? 0.5 : 0;
            const totalDayPoints = amPoints + pmPoints;

            // Calculate actual date for this weekday (Mon=0...Fri=4)
            const dayDate = new Date(periodEndDate);
            dayDate.setDate(dayDate.getDate() - (5 - i));
            const dateStr = dayDate.toISOString().slice(0, 10); // 'YYYY-MM-DD'

            // Storage for credited dates now needs to store what was credited (0.5 or 1.0)
            // But to keep it simple, we'll store the object in creditedGreenItems if we want granularity
            // For now, let's keep it simple: we store dateStr + session
            const amKey = dateStr + '_AM';
            const pmKey = dateStr + '_PM';

            if (amPoints > 0 && !newCreditedDates.includes(amKey)) {
                newCount += amPoints;
                newCreditedDates.push(amKey);
                hasChanged = true;
            } else if (amPoints === 0 && newCreditedDates.includes(amKey)) {
                newCount = Math.max(0, newCount - 0.5);
                newCreditedDates = newCreditedDates.filter(d => d !== amKey);
                hasChanged = true;
            }

            if (pmPoints > 0 && !newCreditedDates.includes(pmKey)) {
                newCount += pmPoints;
                newCreditedDates.push(pmKey);
                hasChanged = true;
            } else if (pmPoints === 0 && newCreditedDates.includes(pmKey)) {
                newCount = Math.max(0, newCount - 0.5);
                newCreditedDates = newCreditedDates.filter(d => d !== pmKey);
                hasChanged = true;
            }
        }

        if (hasChanged) {
            chrome.storage.sync.set({ bicycleCount: newCount, creditedGreenDates: newCreditedDates }, () => {
                updateBikeCountDisplay(newCount);
            });
        }
    });
}

/** Updates the bike count number shown in the badge. */
function updateBikeCountDisplay(count) {
    const el = document.getElementById('bikeCount');
    if (el) el.textContent = count;
}


// ============================================================
// JSON LOADER
// ============================================================

async function loadJson(relativePath) {
    try {
        const response = await fetch(chrome.runtime.getURL(relativePath));
        return response.json();
    } catch (err) {
        console.error(`Error loading ${relativePath}:`, err);
        return null;
    }
}

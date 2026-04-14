// ============================================================
// CONSTANTS
// ============================================================

const TARGET_URL = 'https://psa-fs.ent.cgi.com/psc/fsprda/EMPLOYEE/ERP/c/';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_BY_YEAR = 365;

// Populated at startup from config.json (transportOptions with green:true)
let greenTransportValues = new Set();

// Loaded from JSON at startup
let DEFAULT_CONFIG = null;

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load JSON config files (options + default/empty configs)
    const [configData, defaultConfig] = await Promise.all([
        loadJson('resources/config.json'),
        loadJson('resources/default_profile.json')
    ]);

    DEFAULT_CONFIG = defaultConfig;

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

    // 3. Accordion toggle
    document.getElementById('toggleConfigBtn').addEventListener('click', toggleAccordion);

    // 4. Profile selector
    document.getElementById('activeProfileSelect').addEventListener('change', (e) => {
        chrome.storage.sync.get(buildDefaultStorage(), (items) => {
            setProfile(e.target.value, items);
        });
    });

    // 5. Form save
    document.getElementById('configForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveCurrentConfig();
    });

    // 6. Reset & Fill buttons
    document.getElementById('resetBtn').addEventListener('click', resetConfig);
    document.getElementById('fillFormButton').addEventListener('click', fillForm);

    // 7. Strikethrough listeners for Extra selects
    DAYS.forEach(day => {
        document.getElementById(`${day}Extra`).addEventListener('change', (e) => {
            updateStrikethrough(day, e.target.value);
        });
    });

    // 8. Bicycle badge: load count & register reset
    chrome.storage.sync.get({ bicycleCount: 0 }, (items) => {
        updateBikeCountDisplay(items.bicycleCount);
    });
    document.getElementById('bikeResetBtn').addEventListener('click', () => {
        if (!confirm('Remettre le compteur vélo à zéro ?')) return;
        chrome.storage.sync.set({ bicycleCount: 0, creditedGreenDates: [] }, () => {
            updateBikeCountDisplay(0);
            document.getElementById('bikeUpdateArea').style.display = 'none';
            document.getElementById('bikeModifyBtn').style.display = 'inline-block';
            flashInstruction('🚲 Compteur vélo remis à zéro', 'success');
        });
    });

    document.getElementById('bikeModifyBtn').addEventListener('click', (e) => {
        const area = document.getElementById('bikeUpdateArea');
        const input = document.getElementById('bikeManualInput');
        const currentCount = document.getElementById('bikeCount').textContent;

        area.style.display = 'flex';
        e.target.style.display = 'none'; // Hide the 'Modifier' button
        input.value = currentCount;
        input.focus();
    });

    document.getElementById('bikeConfirmBtn').addEventListener('click', () => {
        const input = document.getElementById('bikeManualInput');
        const val = parseInt(input.value, 10);

        if (isNaN(val) || val < 1 || val > DAY_BY_YEAR) {
            flashInstruction(`⚠️ Entre 1 et ${DAY_BY_YEAR}`, 'warning');
            return;
        }

        chrome.storage.sync.set({ bicycleCount: val }, () => {
            updateBikeCountDisplay(val);
            document.getElementById('bikeUpdateArea').style.display = 'none';
            document.getElementById('bikeModifyBtn').style.display = 'inline-block'; // Show the button again
            flashInstruction('🚲 Compteur mis à jour', 'success');
        });
    });

    // 9. Project codes auto-fill
    chrome.storage.local.get({ projectCodes: [] }, (items) => {
        populateProjectDatalist(items.projectCodes);
    });

    document.getElementById('refreshProjectsBtn').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url || !tab.url.includes(TARGET_URL)) {
            flashInstruction("❌ Action seulement sur PSA", 'warning');
            return;
        }

        flashInstruction("⏳ Recherche en cours...", "info");
        chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PROJECT_CODES', force: true }, (response) => {
            console.log(response);
            if (response && response.success) {
                chrome.storage.local.get({ projectCodes: [] }, (items) => {
                    populateProjectDatalist(items.projectCodes);
                    flashInstruction(`✓ ${items.projectCodes.length} codes trouvés`, "success");
                });
            } else {
                flashInstruction("⚠️ Échec de la recherche", "warning");
            }
        });
    });

    // 9. Check PSA page status
    await checkExtensionStatus();
});

function buildDefaultStorage() {
    return {
        currentConfig: DEFAULT_CONFIG,
        savedProfiles: { profile1: null, profile2: null },
        activeProfileId: 'profile1'
    };
}

// ============================================================
// PROFILE MANAGEMENT
// ============================================================

/**
 * Activates a profile: loads its config into the form and updates the UI.
 * For 'custom', clears all fields so the user can fill manually.
 */
function setProfile(profileId, storageItems) {
    document.getElementById('activeProfileSelect').value = profileId;
    updateFooterVisibility(profileId);

    if (profileId === 'custom') {
        loadConfigIntoForm({ ...DEFAULT_CONFIG, profileName: 'Personnalisé' });
        document.getElementById('profileName').parentElement.style.display = 'none';
        openAccordion();
        return;
    }

    document.getElementById('profileName').parentElement.style.display = 'flex';
    const config = profileId === 'profile1'
        ? (storageItems.savedProfiles.profile1 || { ...DEFAULT_CONFIG, profileName: 'Profil 1' })
        : (storageItems.savedProfiles.profile2 || { ...DEFAULT_CONFIG, profileName: 'Profil 2' });

    chrome.storage.sync.set({ currentConfig: config, activeProfileId: profileId });
    loadConfigIntoForm(config);
}

function saveCurrentConfig() {
    const profileId = document.getElementById('activeProfileSelect').value;
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
    document.getElementById('configAccordion').classList.remove('open');
    document.getElementById('toggleConfigBtn').classList.remove('open');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const profileId = document.getElementById('activeProfileSelect').value;

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
            fillButton.style.display = 'none';
            return;
        }

        chrome.tabs.sendMessage(tab.id, { type: 'CHECK_STATUS' }, (response) => {
            if (chrome.runtime.lastError) {
                showInstruction("⏳ Chargement de l'extension...", 'warning');
                fillButton.style.display = 'none';
            } else if (response && response.loaded) {
                showInstruction('✓ Prêt à remplir !', 'success');
                fillButton.style.display = 'block';
            } else {
                showInstruction('⚠️ Tables PSA non détectées', 'warning');
                fillButton.style.display = 'none';
            }
        });
    } catch {
        showInstruction('❌ Erreur de connexion', 'warning');
        fillButton.style.display = 'none';
    }
}

/** Permanently sets the instruction bar message. */
function showInstruction(msg, type) {
    const el = document.getElementById('instructions');
    el.textContent = msg;
    el.className = `status-bar show ${type}`;
}

/**
 * Temporarily replaces the instruction bar with a feedback message,
 * then restores the previous message after 1.5s.
 */
function flashInstruction(msg, type) {
    const el = document.getElementById('instructions');
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
// UI HELPERS
// ============================================================

function toggleAccordion() {
    const accordion = document.getElementById('configAccordion');
    const btn = document.getElementById('toggleConfigBtn');
    const isOpening = !accordion.classList.contains('open');

    accordion.classList.toggle('open');
    btn.classList.toggle('open');
    document.body.classList.toggle('expanded', isOpening);
}

function openAccordion() {
    document.getElementById('configAccordion').classList.add('open');
    document.getElementById('toggleConfigBtn').classList.add('open');
    document.body.classList.add('expanded');
}

function closeAccordion() {
    document.getElementById('configAccordion').classList.remove('open');
    document.getElementById('toggleConfigBtn').classList.remove('open');
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
        p1.textContent = `👤 ${name}${savedProfiles.profile1 ? '' : ' (Vide)'}`;
    }

    const p2 = select.querySelector('option[value="profile2"]');
    if (p2) {
        const name = savedProfiles.profile2?.profileName || 'Profil 2';
        p2.textContent = `👤 ${name}${savedProfiles.profile2 ? '' : ' (Vide)'}`;
    }
}

// ============================================================
// FORM HELPERS
// ============================================================

function loadConfigIntoForm(config) {
    if (!config) return;
    Object.entries(config).forEach(([key, value]) => {
        const el = document.getElementById(key);
        if (el) el.value = value;
    });

    // Apply strikethrough on load
    DAYS.forEach(day => {
        const extraVal = config[`${day}Extra`];
        updateStrikethrough(day, extraVal);
    });
}

function updateStrikethrough(day, extraValue) {
    const projectInput = document.getElementById(`${day}Project`);
    if (projectInput) {
        projectInput.classList.toggle('strikethrough', extraValue && extraValue !== 'NONE');
    }
}

function getFormConfig() {
    const config = {};
    const fields = [...Object.keys(DEFAULT_CONFIG), 'profileName'];
    fields.forEach(key => {
        const el = document.getElementById(key);
        if (el) config[key] = el.type === 'number' ? parseFloat(el.value) : el.value;
    });
    return config;
}

function populateSelectOptions(config) {
    if (config.contractualHours) populateDatalist('contractualHoursList', config.contractualHours);
    if (config.restTimeOptions) populateSelect('restTime', config.restTimeOptions);

    if (config.transportOptions) {
        DAYS.forEach(day => populateSelect(day, config.transportOptions));
    }
    if (config.extraInputOptions) {
        DAYS.forEach(day => populateSelect(day + 'Extra', config.extraInputOptions));
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

function populateDatalist(datalistId, items) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;
    datalist.innerHTML = '';
    items.forEach(item => {
        if (item.psaTimesheet !== null) {
            const option = document.createElement('option');
            option.value = item.psaTimesheet;
            option.textContent = item.description;
            datalist.appendChild(option);
        }
    });
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
            const transportEl = document.getElementById(dayKey);
            if (!transportEl) continue;

            const transportValue = transportEl.value;
            const isGreenCurrently = greenTransportValues.has(transportValue);

            // Calculate actual date for this weekday (Mon=0...Fri=4)
            const dayDate = new Date(periodEndDate);
            dayDate.setDate(dayDate.getDate() - (5 - i));
            const dateStr = dayDate.toISOString().slice(0, 10); // 'YYYY-MM-DD'

            const isAlreadyCredited = newCreditedDates.includes(dateStr);

            if (isGreenCurrently && !isAlreadyCredited) {
                // Newly green: increment
                newCount++;
                newCreditedDates.push(dateStr);
                hasChanged = true;
            } else if (!isGreenCurrently && isAlreadyCredited) {
                // No longer green: decrement
                newCount = Math.max(0, newCount - 1);
                newCreditedDates = newCreditedDates.filter(d => d !== dateStr);
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

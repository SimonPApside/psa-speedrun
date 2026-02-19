// ============================================================
// CONSTANTS
// ============================================================

const TARGET_URL = 'https://psa-fs.ent.cgi.com/psc/fsprda/EMPLOYEE/ERP/c/';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

// Loaded from JSON at startup
let DEFAULT_CONFIG = null;

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load JSON config files (options + default/empty configs)
    const [configData, defaultConfig] = await Promise.all([
        loadJson('resources/config.json'),
        loadJson('resources/default_config.json')
    ]);

    DEFAULT_CONFIG = defaultConfig;

    if (configData) populateSelectOptions(configData);

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

    // 7. Check PSA page status
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

    if (profileId === 'custom') {
        // Temporarily write the form values to storage so content.js can read them
        const config = getFormConfig();
        await chrome.storage.sync.set({ currentConfig: config });

        chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM' }, (response) => {
            // Clean up only after content.js confirms fillInputsRest is done
            if (response && response.success) {
                chrome.storage.sync.remove('currentConfig');
            }
        });
    } else {
        chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM' });
    }
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
    document.getElementById('configAccordion').classList.toggle('open');
    document.getElementById('toggleConfigBtn').classList.toggle('open');
}

function openAccordion() {
    document.getElementById('configAccordion').classList.add('open');
    document.getElementById('toggleConfigBtn').classList.add('open');
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
    if (config.activityOptions) populateSelect('defaultActivity', config.activityOptions);

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

// Configuration utility for accessing stored settings
// This file can be imported by other scripts to access the configuration

const CONFIG_KEYS = {
    WORK_HOURS: 'workHours',
    REST_TIME: 'restTime',
    DEFAULT_PROJECT: 'defaultProject',
    MONDAY: 'monday',
    TUESDAY: 'tuesday',
    WEDNESDAY: 'wednesday',
    THURSDAY: 'thursday',
    FRIDAY: 'friday'
};

const DEFAULT_CONFIG = {
    workHours: 8,
    restTime: 60,
    defaultProject: '',
    monday: 'in_place',
    tuesday: 'in_place',
    wednesday: 'in_place',
    thursday: 'in_place',
    friday: 'in_place'
};

/**
 * Get the full configuration from storage
 * @returns {Promise<Object>} Configuration object
 */
async function getConfig() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({ currentConfig: DEFAULT_CONFIG }, (items) => {
            resolve(items.currentConfig);
        });
    });
}

/**
 * Get a specific configuration value
 * @param {string} key - Configuration key
 * @returns {Promise<any>} Configuration value
 */
async function getConfigValue(key) {
    const config = await getConfig();
    return config[key];
}

/**
 * Get transport mode for a specific day
 * @param {string} day - Day of week (monday, tuesday, etc.)
 * @returns {Promise<string>} Transport mode (in_place, bicycle, client)
 */
async function getTransportMode(day) {
    return await getConfigValue(day.toLowerCase());
}

/**
 * Get transport mode for today
 * @returns {Promise<string>} Transport mode for current day
 */
async function getTodayTransportMode() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];

    // If weekend, return default
    if (today === 'sunday' || today === 'saturday') {
        return 'in_place';
    }

    return await getTransportMode(today);
}

/**
 * Update configuration
 * @param {Object} updates - Configuration updates
 * @returns {Promise<void>}
 */
async function updateConfig(updates) {
    const current = await getConfig();
    const newConfig = { ...current, ...updates };
    return new Promise((resolve) => {
        chrome.storage.sync.set({ currentConfig: newConfig }, () => {
            resolve();
        });
    });
}

/**
 * Reset configuration to defaults
 * @returns {Promise<void>}
 */
async function resetConfig() {
    return new Promise((resolve) => {
        chrome.storage.sync.set({ currentConfig: DEFAULT_CONFIG }, () => {
            resolve();
        });
    });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG_KEYS,
        DEFAULT_CONFIG,
        getConfig,
        getConfigValue,
        getTransportMode,
        getTodayTransportMode,
        updateConfig,
        resetConfig
    };
}

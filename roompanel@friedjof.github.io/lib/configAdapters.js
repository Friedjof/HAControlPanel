/**
 * Centralized JSON settings parsers.
 *
 * All callers that need to read structured GSettings keys (buttons-config,
 * slider-entities-config) should import from here so the parse/fallback
 * logic lives in one place.
 */

/**
 * Read and parse the `buttons-config` GSettings key.
 * @param {Gio.Settings} settings
 * @returns {object[]}
 */
export function readButtonsConfig(settings) {
    try {
        const parsed = JSON.parse(settings.get_string('buttons-config') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Read and parse the `slider-entities-config` GSettings key.
 * @param {Gio.Settings} settings
 * @returns {object[]}
 */
export function readSliderConfigs(settings) {
    try {
        const parsed = JSON.parse(settings.get_string('slider-entities-config') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

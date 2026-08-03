export const spellcheckDisabledOption = 'none';

export const spellcheckLanguages = [
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'es', label: 'Spanish (Spain)' },
];

const languageAliases = new Map([
    ['en', 'en-US'],
    ['en-us', 'en-US'],
    ['en-gb', 'en-GB'],
    ['es', 'es'],
    ['es-es', 'es'],
]);

export function canonicalSpellcheckLanguage(value, fallback = 'en-US') {
    const normalized = String(value || '').trim().replaceAll('_', '-').toLowerCase();
    return languageAliases.get(normalized) || fallback;
}

export function normalizeSpellcheckPreference(preference = {}) {
    return {
        enabled: preference.enabled === true,
        language: canonicalSpellcheckLanguage(preference.language),
    };
}

export function spellcheckSettingValue(preference = {}) {
    const normalized = normalizeSpellcheckPreference(preference);
    return normalized.enabled ? normalized.language : spellcheckDisabledOption;
}

export function spellcheckPreferenceFromSetting(value, currentPreference = {}) {
    const current = normalizeSpellcheckPreference(currentPreference);
    if (String(value || '').trim().toLowerCase() === spellcheckDisabledOption) {
        return { ...current, enabled: false };
    }
    return {
        enabled: true,
        language: canonicalSpellcheckLanguage(value, current.language),
    };
}

import {
    normalizeSpellcheckPreference,
    spellcheckPreferenceFromSetting,
    spellcheckSettingValue,
} from '../frontend/js/spellcheckPreference.js';

describe('global spellcheck setting', () => {
    test('represents the disabled preference as None while retaining the last dictionary', () => {
        expect(spellcheckSettingValue({ enabled: false, language: 'en-GB' })).toBe('none');
        expect(spellcheckPreferenceFromSetting('none', { enabled: true, language: 'en-GB' })).toEqual({
            enabled: false,
            language: 'en-GB',
        });
    });

    test('selecting a dictionary enables spellcheck and canonicalizes stored values', () => {
        expect(spellcheckPreferenceFromSetting('es', { enabled: false, language: 'en-GB' })).toEqual({
            enabled: true,
            language: 'es',
        });
        expect(normalizeSpellcheckPreference({ enabled: true, language: 'en_GB' })).toEqual({
            enabled: true,
            language: 'en-GB',
        });
    });
});

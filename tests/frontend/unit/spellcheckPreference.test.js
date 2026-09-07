import { canonicalSpellcheckLanguage, spellcheckLanguages } from '../frontend/js/spellcheckPreference.js';

test('spelling lens dictionaries retain canonical English and Spanish language aliases', () => {
    expect(spellcheckLanguages.map(item => item.id)).toEqual(['en-US', 'en-GB', 'es']);
    expect(canonicalSpellcheckLanguage('en_GB')).toBe('en-GB');
    expect(canonicalSpellcheckLanguage('es-ES')).toBe('es');
    expect(canonicalSpellcheckLanguage('fr', '')).toBe('');
});

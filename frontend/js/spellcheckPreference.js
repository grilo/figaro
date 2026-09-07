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

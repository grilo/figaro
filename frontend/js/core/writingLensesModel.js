/** Writing-lens choices are view preferences; they never transform note text. */
export const writingChecks = Object.freeze([
    { id: 'spelling', label: 'Spelling', description: 'Words outside the selected dictionary. Does not check contextual homophones such as “their/there”.' },
    { id: 'plain', label: 'Plain language', description: 'Simpler phrasing, jargon, word choice, and undefined or redundant acronyms.' },
    { id: 'direct', label: 'Directness', description: 'Review possible passive constructions, indirect openings, modifiers, hedging, and emphatic punctuation.' },
    { id: 'repetition', label: 'Repetition', description: 'Review possible adjacent repeated words.' },
    { id: 'consistency', label: 'Consistency', description: 'Technical names, term forms, capitalization, quotation styles, sentence spacing, and optional accents.' },
    { id: 'grammar', label: 'Grammar & punctuation', description: 'Selected article, apostrophe, opening-mark, and punctuation checks. Does not check subject–verb agreement or contextual homophones.' },
    { id: 'readability', label: 'Readability', description: 'Long or complex sentences that may benefit from simpler wording or splitting an idea.' },
    { id: 'inclusive', label: 'Inclusive language', description: 'Generic roles, exclusionary expressions, and accessibility descriptions. Personal pronouns and identity remain the author’s choice.' },
    { id: 'formulaic', label: 'Formulaic writing', description: 'Optional review of stock framing, rhetorical patterns, wordiness, repeated words, layered qualifications, unspaced em dashes, and curly quotes/apostrophes. These patterns do not identify AI authorship.' },
]);

/** UI groups compose stable check IDs; saved choices and review identities stay intact. */
export const writingLensGroups = Object.freeze([
    { id: 'proofreading', label: 'Proofreading', checks: ['spelling', 'repetition', 'consistency', 'grammar'], description: 'Catch spelling, punctuation, repetition, and consistency issues.' },
    { id: 'clarity', label: 'Clarity', checks: ['plain', 'readability'], description: 'Make wording simpler and sentences easier to follow.' },
    { id: 'direct', label: 'Directness', checks: ['direct'], description: 'Review passive voice, hedging, and indirect phrasing.' },
    { id: 'inclusive', label: 'Inclusive language', checks: ['inclusive'], description: 'Review exclusionary expressions and consider inclusive alternatives.' },
    { id: 'formulaic', label: 'Formulaic writing', checks: ['formulaic'], description: 'Review stock phrasing, rhetorical patterns, and punctuation choices.' },
]);

export const writingLanguages = Object.freeze([
    { value: 'none', label: 'None' },
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'es', label: 'Spanish' },
]);

export function writingLensSupportsLanguage(lens, language) {
    return writingChecks.some(item => item.id === lens)
        && (['en-US', 'en-GB'].includes(language) || (lens === 'spelling' && language === 'es'));
}

export function writingLensDisabledReason(lens, { language, status, applying = false }) {
    if (applying) return 'Choices are being applied to all documents. Wait for this to finish.';
    if (status === 'loading') return 'Wait for this document’s writing preferences to finish loading.';
    if (status === 'load-error') return 'Writing preferences couldn’t be loaded. Use Retry before changing lenses.';
    if (language === 'none') return 'Choose an analysis language to activate this lens.';
    const group = writingLensGroups.find(item => item.id === lens);
    if ((group?.checks || [lens]).some(check => writingLensSupportsLanguage(check, language))) return '';
    return `${group?.label || writingChecks.find(item => item.id === lens)?.label || 'This lens'} is only available for English (US) and English (UK).`;
}

export function writingLensGroupState(lens, value) {
    const current = supportedWritingLenses(value);
    const group = writingLensGroups.find(item => item.id === lens);
    const available = group.checks.filter(check => writingLensSupportsLanguage(check, current.language));
    const selected = available.filter(check => current.lenses.includes(check));
    const partial = selected.length > 0 && selected.length < available.length;
    const labels = checks => checks.map(check => writingChecks.find(item => item.id === check).label).join(', ');
    let detail = available.length && available.length < group.checks.length
        ? `Available checks: ${labels(available)}. Other checks in ${group.label} currently support English.`
        : '';
    if (partial) detail = `Enabled checks: ${labels(selected)}. Select ${group.label} to enable all supported checks. ${detail}`.trim();
    const description = lens === 'proofreading' && current.language === 'es'
        ? 'Catch spelling issues with the Spanish dictionary.' : group.description;
    return { selected: selected.length > 0, checked: selected.length > 0 && !partial, partial, description, detail };
}

export function normalizeWritingLenses(value = {}) {
    const ids = writingChecks.map(lens => lens.id);
    const requested = Array.isArray(value?.lenses) ? value.lenses : [value?.primary, ...(Array.isArray(value?.overlays) ? value.overlays : [])];
    return { lenses: ids.filter(id => requested.includes(id)),
        language: writingLanguages.some(item => item.value === value?.language) ? value.language : 'none' };
}

export function changeWritingLenses(value, action) {
    const current = normalizeWritingLenses(value);
    if (action?.type === 'language') return supportedWritingLenses({ ...current, language: action.value });
    if (action?.type === 'lens') {
        const checks = writingLensGroups.find(lens => lens.id === action.value)?.checks || [action.value];
        return supportedWritingLenses({ ...current,
            lenses: action.enabled ? [...current.lenses, ...checks] : current.lenses.filter(id => !checks.includes(id)) });
    }
    return current;
}

/** Unsupported choices are unchecked; returning to a language never reselects them. */
export function supportedWritingLenses(value) {
    const current = normalizeWritingLenses(value);
    return { ...current, lenses: current.lenses.filter(lens => writingLensSupportsLanguage(lens, current.language)) };
}

export function writingLensesAvailability(value) {
    const current = normalizeWritingLenses(value);
    if (current.language === 'none') return { title: 'Choose an analysis language', detail: 'Select a language for this document’s spelling and writing checks.' };
    if (!current.lenses.length) return { title: 'Choose a writing lens', detail: 'Combine any available lenses for this note.' };
    return { title: 'Writing review', detail: current.language === 'es'
        ? 'Spanish spelling is available. Other writing checks currently support English.'
        : 'Review suggestions in the editor or the Writing lenses pane.' };
}

export function writingLensesDocument(tab, mountedTabId) {
    return tab?.type === 'file' && tab.id === mountedTabId && /\.(?:md|markdown|mdown|mkdn)$/iu.test(tab.path || '') ? tab : null;
}

/** Loading and background saves must not overwrite an explicit disclosure choice. */
export function writingLensesExpansion(previous, { documentKey, status, hasSelection }) {
    let expanded = previous?.owner === documentKey ? previous?.expanded : undefined;
    if (expanded === undefined && status !== 'loading') expanded = !hasSelection;
    return { owner: documentKey, expanded };
}

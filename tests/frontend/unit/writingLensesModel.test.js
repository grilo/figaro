import { changeWritingLenses, normalizeWritingLenses, writingLensesAvailability, writingLensesDocument, writingLensDisabledReason, writingLensGroups, writingLensGroupState, writingLensesExpansion } from '../../../frontend/js/core/writingLensesModel.js';

test('lens expansion defaults follow the loaded document and preserve explicit choices through loading and saves', () => {
    const loading = { documentKey: 'Memo.md', status: 'loading', hasSelection: false };
    const pending = writingLensesExpansion(undefined, loading);
    expect(pending).toEqual({ owner: 'Memo.md', expanded: undefined });
    const saved = { ...loading, status: 'saved', hasSelection: true };
    expect(writingLensesExpansion(pending, saved).expanded).toBe(false);
    expect(writingLensesExpansion({ ...pending, expanded: true }, saved).expanded).toBe(true);
    expect(writingLensesExpansion({ ...pending, expanded: false }, { ...saved, hasSelection: false }).expanded).toBe(false);
    expect(writingLensesExpansion({ ...pending, expanded: false }, { documentKey: 'New.md', status: 'saved', hasSelection: false }).expanded).toBe(true);
});

test('five writing lens groups retain every check and toggle their complete supported membership', () => {
    expect(writingLensGroups.map(group => group.label)).toEqual(['Proofreading', 'Clarity', 'Directness', 'Inclusive language', 'Formulaic writing']);
    let preferences = { language: 'en-US', lenses: [] };
    for (const group of writingLensGroups) preferences = changeWritingLenses(preferences, { type: 'lens', value: group.id, enabled: true });
    expect(preferences.lenses).toEqual(['spelling', 'plain', 'direct', 'repetition', 'consistency', 'grammar', 'readability', 'inclusive', 'formulaic']);
    expect(writingLensGroups.every(group => writingLensGroupState(group.id, preferences).checked)).toBe(true);
    preferences = changeWritingLenses(preferences, { type: 'lens', value: 'proofreading', enabled: false });
    expect(preferences.lenses).toEqual(['plain', 'direct', 'readability', 'inclusive', 'formulaic']);
    preferences = changeWritingLenses(preferences, { type: 'lens', value: 'clarity', enabled: false });
    expect(preferences.lenses).toEqual(['direct', 'inclusive', 'formulaic']);
});

test('consolidation preserves legacy partial selections until the writer enables the complete group', () => {
    const before = { language: 'en-US', lenses: ['spelling', 'plain'] };
    const state = writingLensGroupState('proofreading', before);
    expect(state).toMatchObject({ selected: true, checked: false, partial: true });
    expect(state.detail).toContain('Enabled checks: Spelling. Select Proofreading');
    expect(writingLensGroupState('clarity', before).partial).toBe(true);
    const after = changeWritingLenses(before, { type: 'lens', value: 'proofreading', enabled: true });
    expect(after.lenses).toEqual(['spelling', 'plain', 'repetition', 'consistency', 'grammar']);
    expect(writingLensGroupState('proofreading', after).partial).toBe(false);
    expect(before.lenses).toEqual(['spelling', 'plain']);
});

test('Spanish Proofreading offers spelling alone and returning to English preserves the cleared checks', () => {
    const spanish = changeWritingLenses({ language: 'es', lenses: [] }, { type: 'lens', value: 'proofreading', enabled: true });
    expect(spanish.lenses).toEqual(['spelling']);
    expect(writingLensGroupState('proofreading', spanish)).toMatchObject({ checked: true, partial: false, detail: 'Available checks: Spelling. Other checks in Proofreading currently support English.' });
    expect(writingLensDisabledReason('proofreading', { language: 'es', status: 'saved' })).toBe('');
    expect(writingLensDisabledReason('clarity', { language: 'es', status: 'saved' })).toContain('Clarity is only available for English');
    const english = changeWritingLenses(spanish, { type: 'language', value: 'en-US' });
    expect(english.lenses).toEqual(['spelling']);
    expect(writingLensGroupState('proofreading', english).partial).toBe(true);
});

test('writing lenses migrate the old primary and overlays to one independent combination', () => {
    expect(normalizeWritingLenses({ primary: 'direct', overlays: ['direct', 'plain', 'plain', 'unknown', 'spelling'] }))
        .toEqual({ language: 'none', lenses: ['spelling', 'plain', 'direct'] });
    expect(normalizeWritingLenses(null)).toEqual({ language: 'none', lenses: [] });
    expect(normalizeWritingLenses({ lenses: [], primary: 'direct', language: 'es' })).toEqual({ language: 'es', lenses: [] });
});

test('each lens can be selected and unchecked without a primary or profile gate', () => {
    const before = { lenses: ['plain', 'spelling'], language: 'en-US' };
    const combined = changeWritingLenses(before, { type: 'lens', value: 'direct', enabled: true });
    expect(combined.lenses).toEqual(['spelling', 'plain', 'direct']);
    expect(changeWritingLenses(combined, { type: 'lens', value: 'direct', enabled: false }).lenses).toEqual(['spelling', 'plain']);
    expect(before.lenses).toEqual(['plain', 'spelling']);
});

test('unconfigured writing lenses never report a checked or clean document', () => {
    expect(writingLensesAvailability({ primary: 'direct' })).toMatchObject({ title: 'Choose an analysis language' });
    expect(writingLensesAvailability({})).toMatchObject({ title: 'Choose an analysis language' });
});

test('writing lens controls require an owned Markdown buffer', () => {
    const tab = { id: 'a', type: 'file', path: 'Memo.MD' };
    expect(writingLensesDocument(tab, 'a')).toBe(tab);
    expect(writingLensesDocument(tab, 'b')).toBeNull();
    expect(writingLensesDocument({ ...tab, path: 'config.json' }, 'a')).toBeNull();
});

test('changing language unchecks unsupported lenses and switching back never reselects them', () => {
    const before = { lenses: ['spelling', 'plain', 'direct', 'repetition', 'consistency', 'grammar', 'readability', 'inclusive', 'formulaic'], language: 'en-US' };
    const spanish = changeWritingLenses(before, { type: 'language', value: 'es' });
    expect(spanish).toEqual({ lenses: ['spelling'], language: 'es' });
    expect(changeWritingLenses(spanish, { type: 'language', value: 'en-GB' })).toEqual({ lenses: ['spelling'], language: 'en-GB' });
    expect(changeWritingLenses(spanish, { type: 'language', value: 'none' })).toEqual({ lenses: [], language: 'none' });
    expect(changeWritingLenses(spanish, { type: 'lens', value: 'direct', enabled: true })).toEqual(spanish);
    expect(before.lenses).toHaveLength(9);
});

test('unavailable lens explanations distinguish missing language, language support, loading, and load failure', () => {
    expect(writingLensDisabledReason('spelling', { language: 'none', status: 'saved' })).toBe('Choose an analysis language to activate this lens.');
    for (const [lens, label] of [['plain', 'Plain language'], ['direct', 'Directness'], ['repetition', 'Repetition']]) {
        expect(writingLensDisabledReason(lens, { language: 'es', status: 'saved' })).toBe(`${label} is only available for English (US) and English (UK).`);
        expect(writingLensDisabledReason(lens, { language: 'en-GB', status: 'save-error' })).toBe('');
    }
    expect(writingLensDisabledReason('spelling', { language: 'es', status: 'saved' })).toBe('');
    expect(writingLensDisabledReason('direct', { language: 'none', status: 'loading' })).toBe('Wait for this document’s writing preferences to finish loading.');
    expect(writingLensDisabledReason('direct', { language: 'en-US', status: 'load-error' })).toBe('Writing preferences couldn’t be loaded. Use Retry before changing lenses.');
    expect(writingLensDisabledReason('direct', { language: 'en-US', status: 'saved', applying: true })).toBe('Choices are being applied to all documents. Wait for this to finish.');
});

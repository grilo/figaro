import { linkedNoteCreationPlan, linkedNoteNavigationPlan, linkedNoteTabAction } from '../frontend/js/core/linkedNoteNavigationModel.js';

describe('linked-note navigation plans', () => {
    test.each([
        ['notes/Guide%2520Note.md', '', { kind: 'file', path: 'notes/Guide Note.md' }],
        ['bad%ZZ.md', '', { kind: 'file', path: 'bad%ZZ.md' }],
        ['#part%20two', '', { kind: 'heading', path: '#part two' }],
        ['', 'ordinary label', { kind: 'none' }],
        ['folder/2026-09-13.md', '', { kind: 'file', path: 'folder/2026-09-13.md' }],
    ])('classifies %s without effects', (path, label, expected) => {
        expect(linkedNoteNavigationPlan(path, label)).toEqual(expected);
    });

    test.each([['2026-09-13.md', ''], ['', '2026-09-13']])('retains calendar mentions for %s / %s', (path, label) => {
        expect(linkedNoteNavigationPlan(path, label)).toEqual({
            kind: 'calendar', id: 'calendar-2026-09-13',
            title: 'Mention of Date: [[2026-09-13]]', data: { dateStr: '2026-09-13' },
        });
    });

    test.each(['notes/Guide', 'notes/Guide.md'])('plans missing-note content and path for %s', path => {
        expect(linkedNoteCreationPlan(path)).toEqual({
            path: 'notes/Guide.md', title: 'Guide.md', content: '# Guide\n\n',
            message: `The note “${path.split('/').pop()}” doesn’t exist yet.\n\nPath: notes/Guide.md`,
        });
    });

    test('reuses existing tabs and replaces only when explicitly requested', () => {
        expect(linkedNoteTabAction(true, [{ id: 'note.md' }], 'note.md')).toBe('open');
        expect(linkedNoteTabAction(true, [], 'note.md')).toBe('replace');
        expect(linkedNoteTabAction(false, [], 'note.md')).toBe('open');
    });
});

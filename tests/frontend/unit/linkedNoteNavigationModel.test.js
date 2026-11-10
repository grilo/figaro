import { linkedNoteCreationPlan, linkedNoteNavigationPlan, linkedNoteTabAction, vaultPathForNoteLink } from '../frontend/js/core/linkedNoteNavigationModel.js';

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

    test.each([
        // destination, linking note, vault path
        ['./sibling.md', 'notes/daily/today.md', 'notes/daily/sibling.md'],
        ['../Archive/x.md', 'notes/daily/today.md', 'notes/Archive/x.md'],
        ['../../Archive/x.md', 'notes/daily/today.md', 'Archive/x.md'],
        ['./sibling.md', 'root.md', 'sibling.md'],
        ['/Archive/x.md', 'notes/daily/today.md', 'Archive/x.md'],
        ['Archive/x.md', 'notes/daily/today.md', 'Archive/x.md'],
        ['../outside.md', 'root.md', null],
        ['../../outside.md', 'notes/today.md', null],
    ])('resolves %s written in %s the way the link rewriter does', (destination, source, expected) => {
        expect(vaultPathForNoteLink(destination, source)).toBe(expected);
    });

    test('a note-relative destination opens the note beside the linking note, not one at the vault root', () => {
        expect(linkedNoteNavigationPlan('./Guide%20Note.md', '', 'notes/today.md'))
            .toEqual({ kind: 'file', path: 'notes/Guide Note.md' });
        expect(linkedNoteNavigationPlan('../top.md', '', 'notes/today.md')).toEqual({ kind: 'file', path: 'top.md' });
        // Leaving the vault keeps the written spelling, so the read fails visibly.
        expect(linkedNoteNavigationPlan('../../etc.md', '', 'notes/today.md')).toEqual({ kind: 'file', path: '../../etc.md' });
        // A wikilink carries no linking note: it always names a vault path.
        expect(linkedNoteNavigationPlan('./Guide.md', '')).toEqual({ kind: 'file', path: './Guide.md' });
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

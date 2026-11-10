import {
    FRONTMATTER_UPWARD_REVEAL_USER_EVENT,
    frontmatterModeAfterSelection,
    propertiesBlockEnd,
    propertiesBodyStartText,
} from '../frontend/js/core/frontmatterPresentationModel.js';

describe('frontmatter presentation policy', () => {
    test('keeps Properties rendered for document-start and other ordinary selection jumps', () => {
        expect(FRONTMATTER_UPWARD_REVEAL_USER_EVENT).toBe('select.frontmatter-up');
        expect(frontmatterModeAfterSelection({
            mode: 'collapsed',
            selectionChanged: true,
            selectionTouches: true,
            upwardRevealRequested: false,
        })).toBe('collapsed');
        expect(frontmatterModeAfterSelection({
            mode: 'panel',
            selectionChanged: true,
            selectionTouches: true,
            upwardRevealRequested: false,
        })).toBe('panel');
    });

    test('reveals only for upward intent and collapses source after the selection leaves', () => {
        expect(frontmatterModeAfterSelection({
            mode: 'collapsed',
            selectionTouches: true,
            upwardRevealRequested: true,
        })).toBe('source');
        expect(frontmatterModeAfterSelection({
            mode: 'source',
            selectionChanged: true,
            selectionTouches: false,
        })).toBe('collapsed');
        expect(frontmatterModeAfterSelection({
            mode: 'source',
            selectionChanged: false,
            selectionTouches: false,
        })).toBe('source');
    });

    test('a note that ends after its Properties keeps the empty last line outside the block', () => {
        // "---\ntitle: x\n---\n": the block would otherwise swallow the only body line.
        expect(propertiesBlockEnd({ to: 17, documentLength: 17, lastLineEmpty: true })).toBe(16);
        // A body follows: the block ends where the body starts.
        expect(propertiesBlockEnd({ to: 17, documentLength: 30, lastLineEmpty: false })).toBe(17);
        expect(propertiesBlockEnd({ to: 17, documentLength: 18, lastLineEmpty: true })).toBe(17);
        // The closing boundary is the last line: there is no line to keep.
        expect(propertiesBlockEnd({ to: 16, documentLength: 16, lastLineEmpty: false })).toBe(16);
    });

    test('text entered after a closing boundary with no line break starts the body on a new line', () => {
        const atEnd = { rendered: true, closedTo: 16, documentLength: 16, lastLineEmpty: false, from: 16, to: 16 };
        expect(propertiesBodyStartText({ ...atEnd, insert: 'Z' })).toBe('\nZ');
        expect(propertiesBodyStartText({ ...atEnd, insert: 'pasted text' })).toBe('\npasted text');
        // Enter already starts the line; an empty edit inserts nothing.
        expect(propertiesBodyStartText({ ...atEnd, insert: '\n' })).toBeNull();
        expect(propertiesBodyStartText({ ...atEnd, insert: '' })).toBeNull();
        // Raw YAML is being edited, a body line exists, or the edit is elsewhere.
        expect(propertiesBodyStartText({ ...atEnd, rendered: false, insert: 'Z' })).toBeNull();
        expect(propertiesBodyStartText({ ...atEnd, documentLength: 17, lastLineEmpty: true, from: 17, to: 17, closedTo: 17, insert: 'Z' })).toBeNull();
        expect(propertiesBodyStartText({ ...atEnd, from: 10, to: 10, insert: 'Z' })).toBeNull();
        expect(propertiesBodyStartText({ ...atEnd, from: 12, to: 16, insert: 'Z' })).toBeNull();
        expect(propertiesBodyStartText({ ...atEnd, closedTo: null, insert: 'Z' })).toBeNull();
    });
});

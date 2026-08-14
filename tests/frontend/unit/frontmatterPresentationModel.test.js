import {
    FRONTMATTER_UPWARD_REVEAL_USER_EVENT,
    frontmatterModeAfterSelection,
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
});

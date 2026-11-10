import { vimEditTargetPath } from '../frontend/js/core/vimExModel.js';

describe('Vim :e target path', () => {
    test('addresses a note beside the active note and appends the Markdown extension', () => {
        const active = { type: 'file', path: 'notes/sub/vim.md' };
        expect(vimEditTargetPath(' other ', active)).toBe('notes/sub/other.md');
        expect(vimEditTargetPath('other.md', active)).toBe('notes/sub/other.md');
        expect(vimEditTargetPath('other', { type: 'file', path: 'root.md' })).toBe('other.md');
    });

    test('uses the vault root when no note is active and names nothing for an empty argument', () => {
        expect(vimEditTargetPath('other', null)).toBe('other.md');
        expect(vimEditTargetPath('other', { type: 'kanban', path: 'x/y' })).toBe('other.md');
        expect(vimEditTargetPath('   ', { type: 'file', path: 'a/b.md' })).toBe('');
        expect(vimEditTargetPath(undefined)).toBe('');
    });
});

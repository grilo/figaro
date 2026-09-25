import {
    externalDropAction,
    externalFileNotice,
    externalTreeImportPrompt,
    fileTabReadTarget,
    isMarkdownDropPath,
} from '../frontend/js/core/externalFileModel.js';

describe('external file policy', () => {
    test('describes a non-destructive tree import into the chosen folder', () => {
        expect(externalTreeImportPrompt(
            ['C:\\Users\\Writer\\outside.md'],
            'Projects/Research',
        )).toEqual({
            title: 'Import “outside.md” into “Projects/Research”?',
            message: 'Figaro will copy this item into the vault. The original stays in the current location and will not be modified or removed.',
            options: {
                confirmLabel: 'Import to vault',
                cancelLabel: 'Cancel',
                icon: 'file-add',
            },
        });
    });

    test('uses a plural root prompt for a native drop batch', () => {
        expect(externalTreeImportPrompt(['/tmp/a.md', '/tmp/Assets'], '')).toEqual({
            title: 'Import 2 items into the vault root?',
            message: 'Figaro will copy these items into the vault. The originals stay in the current location and will not be modified or removed.',
            options: {
                confirmLabel: 'Import to vault',
                cancelLabel: 'Cancel',
                icon: 'file-add',
            },
        });
        expect(externalTreeImportPrompt([], '')).toBeNull();
    });

    test('selects the capability reader for an external tab instead of its display path', () => {
        expect(fileTabReadTarget({
            path: '/home/writer/outside.md',
            externalFileId: 'launch-1',
        })).toEqual({ kind: 'external', externalFileId: 'launch-1' });
        expect(fileTabReadTarget({ path: 'notes/inside.md' }))
            .toEqual({ kind: 'vault', path: 'notes/inside.md' });
    });

    test('recognizes Markdown documents by extension on any platform', () => {
        expect(isMarkdownDropPath('/home/writer/README.md')).toBe(true);
        expect(isMarkdownDropPath('C:\\Notes\\Guide.MARKDOWN')).toBe(true);
        expect(isMarkdownDropPath('/home/writer/notes.md.txt')).toBe(false);
        expect(isMarkdownDropPath('/home/writer/Folder.md/')).toBe(false);
    });

    test('routes a drop by its target: the tree imports, Markdown opens, other files ask only in the editor', () => {
        expect(externalDropAction(['/a.md'], 'tree')).toBe('import');
        expect(externalDropAction(['/a.png'], 'tree')).toBe('import');
        expect(externalDropAction(['/a.md', '/b.markdown'], 'editor')).toBe('open');
        expect(externalDropAction(['/a.md'], 'elsewhere')).toBe('open');
        expect(externalDropAction(['/a.md', '/b.png'], 'editor')).toBe('ask');
        expect(externalDropAction(['/b.png'], 'elsewhere')).toBe('ignore');
        expect(externalDropAction([], 'editor')).toBe('ignore');
    });

    test('describes the notice only for an open file from outside the vault', () => {
        expect(externalFileNotice({ type: 'file', externalFileId: 'external-1', path: '/tmp/README.md' }))
            .toEqual({
                name: 'README.md',
                message: 'Outside the vault. Edits save to the original file and are not kept in history.',
                actionLabel: 'Import to vault',
            });
        expect(externalFileNotice({ type: 'file', path: 'Inbox/note.md' })).toBeNull();
        expect(externalFileNotice({ type: 'calendar-workspace', externalFileId: 'x' })).toBeNull();
        expect(externalFileNotice(null)).toBeNull();
    });
});

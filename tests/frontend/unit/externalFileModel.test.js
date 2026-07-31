import {
    externalTreeImportPrompt,
    fileTabReadTarget,
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
});

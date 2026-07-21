import { openLaunchExternalFiles, offerExternalFileImport, importDroppedExternalPaths } from '../frontend/js/externalFiles.js';
import { serializeSessionTabs } from '../frontend/js/sessionTabs.js';

describe('external Markdown launch files', () => {
    test('opens each native launch document as an external editor tab', async () => {
        const openTab = jest.fn();
        const files = [{ id: 'external-1', path: 'C:\\Notes\\outside.md', mtime: 12 }];

        await expect(openLaunchExternalFiles(openTab, {
            GetLaunchExternalFiles: jest.fn().mockResolvedValue(files),
        })).resolves.toEqual(files);

        expect(openTab).toHaveBeenCalledWith('external:external-1', 'outside.md', 'file', {
            path: 'C:\\Notes\\outside.md',
            mtime: 12,
            externalFileId: 'external-1',
        });
    });

    test('keeps the source outside the vault when import is cancelled', async () => {
        const copy = jest.fn();
        const confirm = jest.fn().mockResolvedValue(false);
        const tab = { id: 'external:1', title: 'outside.md', path: 'C:\\Notes\\outside.md', externalFileId: '1' };

        await expect(offerExternalFileImport(tab, {
            api: { CopyExternalPaths: copy },
            confirm,
            openTab: jest.fn(),
            closeTab: jest.fn(),
        })).resolves.toBe(false);

        expect(copy).not.toHaveBeenCalled();
    });

    test('imports with the collision-safe destination returned by the backend', async () => {
        const openTab = jest.fn();
        const closeTab = jest.fn().mockResolvedValue(true);
        const tab = { id: 'external:1', title: 'outside.md', path: 'C:\\Notes\\outside.md', externalFileId: '1' };

        await expect(offerExternalFileImport(tab, {
            api: { CopyExternalPaths: jest.fn().mockResolvedValue({ success: true, paths: ['outside (copy).md'] }) },
            confirm: jest.fn().mockResolvedValue(true),
            openTab,
            closeTab,
        })).resolves.toBe(true);

        expect(openTab).toHaveBeenCalledWith('outside (copy).md', 'outside (copy).md', 'file', {
            path: 'outside (copy).md',
            mtime: undefined,
        });
        expect(closeTab).toHaveBeenCalledWith('external:1');
    });

    test('asks once and recursively imports a dropped directory without overwriting files', async () => {
        const confirm = jest.fn().mockResolvedValue('confirm');
        const merge = jest.fn().mockResolvedValue({ success: true, paths: ['Projects'] });

        await expect(importDroppedExternalPaths(['C:\\Desktop\\Projects'], '', {
            api: { MergeExternalPaths: merge },
            confirm,
        })).resolves.toEqual({
            action: 'import',
            result: { success: true, paths: ['Projects'] },
            paths: ['C:\\Desktop\\Projects'],
        });

        expect(confirm).toHaveBeenCalledTimes(1);
        expect(merge).toHaveBeenCalledWith(['C:\\Desktop\\Projects'], '');
    });

    test('inserts a path instead of importing when the user chooses the path action', async () => {
        const merge = jest.fn();

        await expect(importDroppedExternalPaths(['C:\\Desktop\\outside.md'], '', {
            api: { MergeExternalPaths: merge },
            confirm: jest.fn().mockResolvedValue('extra'),
        })).resolves.toEqual({ action: 'path', result: null, paths: ['C:\\Desktop\\outside.md'] });

        expect(merge).not.toHaveBeenCalled();
    });

    test('does not import a dropped editor file when the choice is cancelled', async () => {
        const merge = jest.fn();

        await expect(importDroppedExternalPaths(['C:\\Desktop\\outside.md'], '', {
            api: { MergeExternalPaths: merge },
            confirm: jest.fn().mockResolvedValue(false),
        })).resolves.toEqual({ action: 'cancel', result: null, paths: [] });

        expect(merge).not.toHaveBeenCalled();
    });

    test('never persists an external tab in the vault session', () => {
        expect(serializeSessionTabs([
            { id: 'note.md', title: 'note.md', type: 'file', path: 'note.md' },
            { id: 'external:1', title: 'outside.md', type: 'file', path: 'C:\\Notes\\outside.md', externalFileId: '1' },
        ])).toEqual([{ id: 'note.md', title: 'note.md', type: 'file', path: 'note.md' }]);
    });
});

import {
    confirmExternalTreeImport,
    importDroppedExternalPaths,
    importOpenExternalTab,
    offerExternalFileImport,
    openDroppedMarkdownFiles,
    openExternalLaunchFiles,
    openLaunchExternalFiles,
} from '../frontend/js/externalFiles.js';
import { serializeSessionTabs } from '../frontend/js/sessionTabs.js';

describe('external Markdown launch files', () => {
    test('keeps a declined launch document as an external root shortcut and editor tab', async () => {
        const openTab = jest.fn();
        const onExternalKept = jest.fn();
        const files = [{ id: 'external-1', path: 'C:\\Notes\\outside.md', mtime: 12 }];

        await expect(openLaunchExternalFiles(openTab, {
            api: {
                GetLaunchExternalFiles: jest.fn().mockResolvedValue(files),
                MergeExternalPaths: jest.fn(),
            },
            confirm: jest.fn().mockResolvedValue(false),
            onExternalKept,
        })).resolves.toEqual(files);

        expect(openTab).toHaveBeenCalledWith('external:external-1', 'outside.md', 'file', {
            path: 'C:\\Notes\\outside.md',
            mtime: 12,
            externalFileId: 'external-1',
        });
        expect(onExternalKept).toHaveBeenCalledWith(files[0]);
    });

    test('imports a launch document before opening and refreshes the vault tree', async () => {
        const openTab = jest.fn();
        const onImported = jest.fn().mockResolvedValue(undefined);
        const onExternalKept = jest.fn();
        const files = [{ id: 'external-1', path: '/tmp/outside.md', mtime: 12 }];

        await openLaunchExternalFiles(openTab, {
            api: {
                GetLaunchExternalFiles: jest.fn().mockResolvedValue(files),
                MergeExternalPaths: jest.fn().mockResolvedValue({
                    success: true,
                    paths: ['outside (copy).md'],
                }),
            },
            confirm: jest.fn().mockResolvedValue(true),
            onImported,
            onExternalKept,
        });

        expect(onImported).toHaveBeenCalledWith('outside (copy).md');
        expect(openTab).toHaveBeenCalledWith('outside (copy).md', 'outside (copy).md', 'file', {
            path: 'outside (copy).md',
        });
        expect(onExternalKept).not.toHaveBeenCalled();
    });

    test('keeps the launch document outside when its requested import fails', async () => {
        const openTab = jest.fn();
        const onExternalKept = jest.fn();
        const onImportError = jest.fn();
        const failure = new Error('Vault is read-only');
        const file = { id: 'external-1', path: '/tmp/outside.md', mtime: 12 };

        await openLaunchExternalFiles(openTab, {
            api: {
                GetLaunchExternalFiles: jest.fn().mockResolvedValue([file]),
                MergeExternalPaths: jest.fn().mockRejectedValue(failure),
            },
            confirm: jest.fn().mockResolvedValue(true),
            onExternalKept,
            onImportError,
        });

        expect(onImportError).toHaveBeenCalledWith(failure, file);
        expect(openTab).toHaveBeenCalledWith('external:external-1', 'outside.md', 'file', {
            path: '/tmp/outside.md',
            mtime: 12,
            externalFileId: 'external-1',
        });
        expect(onExternalKept).toHaveBeenCalledWith(file);
    });

    test('reuses the launch prompt for forwarded files and claims duplicate event capabilities once', async () => {
        const openTab = jest.fn();
        const confirm = jest.fn().mockResolvedValue(false);
        const claimed = new Set();
        const claimExternalFile = jest.fn(file => {
            if (claimed.has(file.id)) return false;
            claimed.add(file.id);
            return true;
        });
        const file = { id: 'external-2', path: 'C:\\Notes\\forwarded.md', mtime: 22 };
        const options = {
            api: { MergeExternalPaths: jest.fn() },
            confirm,
            claimExternalFile,
        };

        await openExternalLaunchFiles([file], openTab, options);
        await openExternalLaunchFiles([file], openTab, options);

        expect(claimExternalFile).toHaveBeenCalledTimes(2);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(openTab).toHaveBeenCalledTimes(1);
        expect(openTab).toHaveBeenCalledWith('external:external-2', 'forwarded.md', 'file', {
            path: 'C:\\Notes\\forwarded.md',
            mtime: 22,
            externalFileId: 'external-2',
        });
    });

    test('keeps the source outside the vault when import is cancelled', async () => {
        const copy = jest.fn();
        const confirm = jest.fn().mockResolvedValue(false);
        const tab = { id: 'external:1', title: 'outside.md', path: 'C:\\Notes\\outside.md', externalFileId: '1' };

        await expect(offerExternalFileImport(tab, {
            api: { MergeExternalPaths: copy },
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

        const merge = jest.fn().mockResolvedValue({ success: true, paths: ['outside (copy).md'] });
        await expect(offerExternalFileImport(tab, {
            api: { MergeExternalPaths: merge },
            confirm: jest.fn().mockResolvedValue(true),
            openTab,
            closeTab,
        })).resolves.toBe(true);

        // MergeExternalPaths picks a free name; the replace-or-fail copy is never used.
        expect(merge).toHaveBeenCalledWith(['C:\\Notes\\outside.md'], '');
        expect(openTab).toHaveBeenCalledWith('outside (copy).md', 'outside (copy).md', 'file', {
            path: 'outside (copy).md',
        });
        expect(closeTab).toHaveBeenCalledWith('external:1');
    });

    test('the notice import saves pending edits to the original first and forgets the shortcut', async () => {
        const order = [];
        const tab = { id: 'external:4', title: 'README.md', path: '/home/writer/README.md', externalFileId: '4', dirty: true };
        const forgetShortcut = jest.fn(() => order.push('forget'));
        await expect(importOpenExternalTab(tab, {
            save: jest.fn(async () => { order.push('save'); return { success: true }; }),
            api: { MergeExternalPaths: jest.fn(async () => { order.push('import'); return { success: true, paths: ['README.md'] }; }) },
            openTab: jest.fn(),
            closeTab: jest.fn(),
            forgetShortcut,
        })).resolves.toBe('README.md');
        expect(order).toEqual(['save', 'import', 'forget']);
        expect(forgetShortcut).toHaveBeenCalledWith('4');
    });

    test('the notice import stops when pending edits could not be saved', async () => {
        const merge = jest.fn();
        const tab = { id: 'external:4', path: '/home/writer/README.md', externalFileId: '4', dirty: true };
        await expect(importOpenExternalTab(tab, {
            save: jest.fn().mockResolvedValue({ success: false }),
            api: { MergeExternalPaths: merge },
            openTab: jest.fn(),
        })).resolves.toBeNull();
        expect(merge).not.toHaveBeenCalled();
    });

    test('dropped Markdown opens vault notes by path and outside files in place', async () => {
        const openTab = jest.fn();
        const onExternalKept = jest.fn();
        const file = { id: 'external-9', name: 'README.md', path: '/home/writer/README.md', mtime: 9 };
        await expect(openDroppedMarkdownFiles(['/vault/a.md', '/home/writer/README.md', '/home/writer/link.md'], {
            api: { OpenDroppedMarkdownFiles: jest.fn().mockResolvedValue({
                vaultPaths: ['a.md'], external: [file], skipped: ['/home/writer/link.md'],
            }) },
            openTab,
            onExternalKept,
        })).resolves.toEqual({ opened: 2, skipped: ['/home/writer/link.md'] });
        expect(openTab).toHaveBeenNthCalledWith(1, 'a.md', 'a.md', 'file', { path: 'a.md' });
        expect(openTab).toHaveBeenNthCalledWith(2, 'external:external-9', 'README.md', 'file', {
            path: '/home/writer/README.md', mtime: 9, externalFileId: 'external-9',
        });
        expect(onExternalKept).toHaveBeenCalledWith(file);
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

    test('confirms a file-tree import without offering the editor path action', async () => {
        const confirm = jest.fn().mockResolvedValue('confirm');

        await expect(confirmExternalTreeImport(
            ['/home/writer/outside.md'],
            'Inbox',
            { confirm },
        )).resolves.toBe(true);

        expect(confirm).toHaveBeenCalledWith(
            'Import “outside.md” into “Inbox”?',
            expect.stringContaining('The original stays in the current location'),
            false,
            false,
            {
                confirmLabel: 'Import to vault',
                cancelLabel: 'Cancel',
                icon: 'file-add',
            },
        );
    });

    test('never persists an external tab in the vault session', () => {
        expect(serializeSessionTabs([
            { id: 'note.md', title: 'note.md', type: 'file', path: 'note.md' },
            { id: 'external:1', title: 'outside.md', type: 'file', path: 'C:\\Notes\\outside.md', externalFileId: '1' },
        ])).toEqual([{ id: 'note.md', title: 'note.md', type: 'file', path: 'note.md' }]);
    });
});

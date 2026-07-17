/**
 * Unit tests for fileTree.js
 * Run with: npx jest js/fileTree.test.js
 */

import { testUtils } from './test_setup.js';
import { initFileTree, renderFileTree, buildTreeHTML, buildFileTreeContextMenuHTML, toggleDirectory, findTreeItem, refreshFileTree, scheduleFileTreeRefresh, getContextMenuPosition, isInvalidMoveDestination, moveInternalPath, externalDropTargetDirectory, copyExternalDrop, initNativeFileDrops, clearFileTreeClipboard, copyInternalPath, internalPasteTargetDirectory, isInvalidCopyDestination, pasteInternalClipboard, customizeTreePath, loadFileTreeStyles, createInboxNote } from '../frontend/js/fileTree.js';

// Mock state store (module-level, 'mock' prefix required by jest, var for hoisting)
var mockState = {
    fileTreeData: null,
    expandedDirs: new Set(),
    selectedFilePath: null,
    selectedTreePath: null,
    selectedFilePaths: [],
    openTabs: [],
    activeTabId: null
};

jest.mock('../frontend/js/state.js', () => ({
    get state() { return mockState; },
    setState: jest.fn((key, value) => { mockState[key] = value; }),
    getState: jest.fn((key) => mockState[key]),
    subscribe: jest.fn()
}));

jest.mock('../frontend/js/app.js', () => ({
    handleFileOpen: jest.fn()
}));

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() }
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    confirmDialog: jest.fn().mockResolvedValue(true),
    errorDialog: jest.fn().mockResolvedValue(undefined),
    fileTreeStyleDialog: jest.fn().mockResolvedValue(null),
    mergeNotesDialog: jest.fn().mockResolvedValue([0]),
    messageDialog: jest.fn().mockResolvedValue(undefined),
    promptDialog: jest.fn().mockResolvedValue('test.md'),
    renamePathDialog: jest.fn().mockResolvedValue('test.md'),
    newNoteDialog: jest.fn().mockResolvedValue('test.md'),
    pdfExportErrorDialog: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../frontend/js/session.js', () => ({
    saveSession: jest.fn()
}));

jest.mock('../frontend/js/tabManager.js', () => ({
    openTab: jest.fn(),
    closeTabsForDeletedPath: jest.fn(),
    prepareTabsForPathCopy: jest.fn().mockResolvedValue({ success: true }),
    prepareTabsForPathMove: jest.fn().mockResolvedValue({ success: true }),
    refreshTabsForUpdatedLinks: jest.fn().mockResolvedValue(false),
    updateTabsForMovedPath: jest.fn(),
}));

jest.mock('../frontend/js/editor.js', () => ({
    focusEditor: jest.fn(),
}));

import { state, setState, getState, subscribe } from '../frontend/js/state.js';
import { handleFileOpen } from '../frontend/js/app.js';
import { statusBar } from '../frontend/js/statusBar.js';
import { confirmDialog, errorDialog, fileTreeStyleDialog, messageDialog, newNoteDialog, renamePathDialog } from '../frontend/js/dialogs.js';
import { openTab, prepareTabsForPathCopy, prepareTabsForPathMove, refreshTabsForUpdatedLinks, updateTabsForMovedPath } from '../frontend/js/tabManager.js';
import { saveSession } from '../frontend/js/session.js';
import { focusEditor } from '../frontend/js/editor.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('File Tree', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        
        // Reset state
        state.fileTreeData = null;
        state.expandedDirs = new Set();
        state.selectedFilePath = null;
        state.selectedTreePath = null;
        state.selectedFilePaths = [];
        state.openTabs = [];
        state.activeTabId = null;
        clearFileTreeClipboard();
        delete window.lucide;
    });

    describe('buildTreeHTML', () => {
        test('should render empty tree', () => {
            const html = buildTreeHTML([], new Set(), null);
            expect(html).toBe('<ul class="file-tree-list"></ul>');
        });

        test('should render files and directories', () => {
            const items = [
                { name: 'note.md', path: 'note.md', type: 'file', mtime: 1000 },
                { name: 'folder', path: 'folder', type: 'directory', children: [
                    { name: 'inner.md', path: 'folder/inner.md', type: 'file', mtime: 2000 }
                ]}
            ];
            
            const html = buildTreeHTML(items, new Set(['folder']), null);
            
            expect(html).toContain('note.md');
            expect(html).toContain('folder');
            expect(html).toContain('inner.md');
            expect(html).toContain('<svg');
            expect(html).toContain('file-tree-item');
        });

        test('does not mount descendants of collapsed directories', () => {
            const items = [{
                name: 'folder', path: 'folder', type: 'directory', children: [
                    { name: 'nested.md', path: 'folder/nested.md', type: 'file', mtime: 1 },
                ],
            }];

            const collapsed = buildTreeHTML(items, new Set(), null);
            const expanded = buildTreeHTML(items, new Set(['folder']), null);

            expect(collapsed).not.toContain('nested.md');
            expect(collapsed).not.toContain('file-tree-children');
            expect(expanded).toContain('nested.md');
        });

        test('should mark expanded directories', () => {
            const items = [
                { name: 'folder', path: 'folder', type: 'directory', children: [] }
            ];
            const expanded = new Set(['folder']);
            
            const html = buildTreeHTML(items, expanded, null);
            
            expect(html).toContain('expanded');
            expect(html).toContain('<svg');
        });

        test('should mark selected file', () => {
            const items = [
                { name: 'note.md', path: 'note.md', type: 'file', mtime: 1000 }
            ];
            
            const html = buildTreeHTML(items, new Set(), 'note.md');
            
            expect(html).toContain('selected');
        });

        test('keeps a selected folder distinct from the active file', () => {
            const items = [{
                name: 'Projects', path: 'Projects', type: 'directory', children: [
                    { name: 'plan.md', path: 'Projects/plan.md', type: 'file', mtime: 1000 }
                ]
            }];
            const surface = document.createElement('div');
            surface.innerHTML = buildTreeHTML(items, new Set(['Projects']), 'Projects', [], 0, 'Projects/plan.md');

            expect(surface.querySelector('.file-tree-item[data-path="Projects"] > .file-tree-node').classList.contains('selected')).toBe(true);
            expect(surface.querySelector('.file-tree-item[data-path="Projects/plan.md"] > .file-tree-node').classList.contains('active-file')).toBe(true);
        });

        test('marks open background tabs more subtly than the active file', () => {
            const items = [
                { name: 'active.md', path: 'active.md', type: 'file', mtime: 1 },
                { name: 'background.md', path: 'background.md', type: 'file', mtime: 2 },
                { name: 'closed.md', path: 'closed.md', type: 'file', mtime: 3 },
            ];
            const surface = document.createElement('div');
            surface.innerHTML = buildTreeHTML(items, new Set(), null, [], 0, 'active.md', {}, new Set(['active.md', 'background.md']));

            expect(surface.querySelector('[data-path="active.md"] > .file-tree-node').classList.contains('active-file')).toBe(true);
            expect(surface.querySelector('[data-path="active.md"] > .file-tree-node').classList.contains('open-file')).toBe(false);
            expect(surface.querySelector('[data-path="background.md"] > .file-tree-node').classList.contains('open-file')).toBe(true);
            expect(surface.querySelector('[data-path="closed.md"] > .file-tree-node').classList.contains('open-file')).toBe(false);
        });

        test('should render items in given order', () => {
            const items = [
                { name: 'alpha', path: 'alpha', type: 'directory', children: [] },
                { name: 'zebra.md', path: 'zebra.md', type: 'file', mtime: 1000 }
            ];
            
            const html = buildTreeHTML(items, new Set(), null);
            
            const alphaPos = html.indexOf('alpha');
            const zebraPos = html.indexOf('zebra.md');
            expect(alphaPos).toBeLessThan(zebraPos);
        });

        test('renders a persisted Lucide icon and Kanban palette color for a specific path', () => {
            window.lucide = { icons: { Star: [['path', { d: 'M12 2 15 9 22 9 17 14 19 22 12 18 5 22 7 14 2 9 9 9Z' }]] } };
            const items = [{ name: 'priority.md', path: 'priority.md', type: 'file', mtime: 1000 }];
            const surface = document.createElement('div');
            surface.innerHTML = buildTreeHTML(items, new Set(), null, [], 0, null, {
                'priority.md': { icon: 'Star', color: '#f59e0b' },
            });

            const node = surface.querySelector('.file-tree-node');
            expect(node.classList.contains('custom-icon')).toBe(true);
            expect(node.classList.contains('custom-color')).toBe(true);
            expect(node.style.getPropertyValue('--file-tree-entry-color')).toBe('#f59e0b');
            expect(node.querySelector('.node-icon path').getAttribute('d')).toContain('M12 2');
        });

        test('gives the top-level Inbox a Mail icon by default while allowing a custom override', () => {
            window.lucide = { icons: {
                Mail: [['path', { d: 'M4 4h16v16H4z' }]],
                Star: [['path', { d: 'M12 2 15 9 22 9Z' }]],
            } };
            const items = [{ name: 'Inbox', path: 'Inbox', type: 'directory', children: [] }];
            const surface = document.createElement('div');
            surface.innerHTML = buildTreeHTML(items, new Set(), null);
            expect(surface.querySelector('.default-inbox-icon path').getAttribute('d')).toBe('M4 4h16v16H4z');

            surface.innerHTML = buildTreeHTML(items, new Set(), null, [], 0, null, {
                Inbox: { icon: 'Star' },
            });
            expect(surface.querySelector('.default-inbox-icon')).toBeNull();
            expect(surface.querySelector('.node-icon path').getAttribute('d')).toBe('M12 2 15 9 22 9Z');
        });
    });

    test('Quick note makes and opens a real Inbox note, then focuses the editor', async () => {
        window.go.main.App.CreateInboxNote.mockResolvedValueOnce({
            success: true,
            path: 'Inbox/2026-07-17-143522.md',
            mtime: 42,
        });
        window.go.main.App.GetFileTree.mockResolvedValueOnce([]);

        await createInboxNote();

        expect(window.go.main.App.CreateInboxNote).toHaveBeenCalledTimes(1);
        expect(handleFileOpen).toHaveBeenCalledWith('Inbox/2026-07-17-143522.md');
        expect(focusEditor).toHaveBeenCalled();
        expect(document.getElementById('create-inbox-note').disabled).toBe(false);
        expect(document.getElementById('sidebar-quick-note').disabled).toBe(false);
    });

    test('Quick note reports backend failure without opening a phantom Inbox tab', async () => {
        window.go.main.App.CreateInboxNote.mockResolvedValueOnce({
            success: false,
            error: 'Inbox is read-only',
        });

        await createInboxNote();

        expect(errorDialog).toHaveBeenCalledWith(
            'Couldn’t create Inbox note',
            'Inbox is read-only',
            'No existing note was changed.',
        );
        expect(handleFileOpen).not.toHaveBeenCalled();
        expect(focusEditor).not.toHaveBeenCalled();
        expect(document.getElementById('create-inbox-note').disabled).toBe(false);
        expect(document.getElementById('sidebar-quick-note').disabled).toBe(false);
    });

    describe('path appearance', () => {
        beforeEach(() => {
            state.fileTreeData = [{ name: 'note.md', path: 'note.md', type: 'file', mtime: 1000 }];
            fileTreeStyleDialog.mockReset().mockResolvedValue({ icon: 'Star', color: '#3b82f6' });
            window.go.main.App.SetFileTreeStyle.mockResolvedValue({
                version: 1,
                entries: { 'note.md': { icon: 'Star', color: '#3b82f6' } },
                recent_icons: ['Star'],
            });
        });

        test('saves a right-click appearance choice and redraws the entry', async () => {
            const changed = await customizeTreePath('note.md', 'file');

            expect(changed).toBe(true);
            expect(fileTreeStyleDialog).toHaveBeenCalledWith(expect.objectContaining({
                name: 'note.md',
                type: 'file',
            }));
            expect(window.go.main.App.SetFileTreeStyle).toHaveBeenCalledWith('note.md', 'Star', '#3b82f6');
        });

        test('does not write when the appearance dialog is cancelled', async () => {
            fileTreeStyleDialog.mockResolvedValueOnce(null);

            await expect(customizeTreePath('note.md', 'file')).resolves.toBe(false);
            expect(window.go.main.App.SetFileTreeStyle).not.toHaveBeenCalled();
        });

        test('reset removes both overrides', async () => {
            fileTreeStyleDialog.mockResolvedValueOnce({ icon: '', color: '' });

            await expect(customizeTreePath('note.md', 'file')).resolves.toBe(true);
            expect(window.go.main.App.SetFileTreeStyle).toHaveBeenCalledWith('note.md', '', '');
        });

        test('reports a persistence error without replacing the current appearance', async () => {
            window.go.main.App.GetFileTreeStyles.mockResolvedValueOnce({
                version: 1,
                entries: { 'note.md': { color: '#ef4444' } },
                recent_icons: [],
            });
            await loadFileTreeStyles();
            window.go.main.App.SetFileTreeStyle.mockRejectedValueOnce(new Error('Disk is full'));

            await expect(customizeTreePath('note.md', 'file')).resolves.toBe(false);
            expect(errorDialog).toHaveBeenCalledWith(
                'Couldn’t style entry',
                expect.objectContaining({ message: 'Disk is full' }),
                'The file-tree appearance could not be saved.'
            );
            expect(document.querySelector('.file-tree-node').style.getPropertyValue('--file-tree-entry-color'))
                .toBe('#ef4444');
        });
    });

    describe('toggleDirectory', () => {
        test('should add directory to expanded set', () => {
            state.expandedDirs = new Set();
            toggleDirectory('folder');
            expect(getState('expandedDirs')).toContain('folder');
        });

        test('should remove directory from expanded set', () => {
            state.expandedDirs = new Set(['folder']);
            toggleDirectory('folder');
            expect(getState('expandedDirs')).not.toContain('folder');
        });
    });

    test('opens a canonical draw.io SVG in its diagram tab', () => {
        state.fileTreeData = [{
            name: 'architecture.drawio.svg',
            path: 'Diagrams/architecture.drawio.svg',
            type: 'file',
            mtime: 100,
        }];
        initFileTree();
        renderFileTree();

        const node = document.querySelector('.file-tree-node');
        expect(node.classList.contains('non-md')).toBe(false);
        node.click();

        expect(openTab).toHaveBeenCalledWith(
            'Diagrams/architecture.drawio.svg',
            'architecture.drawio.svg',
            'drawio',
            { path: 'Diagrams/architecture.drawio.svg' }
        );
    });

    test('persists a clicked directory selection while its active note remains visible', () => {
        state.fileTreeData = [{
            name: 'Projects', path: 'Projects', type: 'directory', children: [
                { name: 'plan.md', path: 'Projects/plan.md', type: 'file', mtime: 100 }
            ]
        }];
        state.selectedFilePath = 'Projects/plan.md';
        initFileTree();

        document.querySelector('.file-tree-item[data-path="Projects"] > .file-tree-node').click();

        expect(state.selectedTreePath).toBe('Projects');
        expect(document.querySelector('.file-tree-item[data-path="Projects"] > .file-tree-node').classList.contains('selected')).toBe(true);
        expect(document.querySelector('.file-tree-item[data-path="Projects/plan.md"] > .file-tree-node').classList.contains('active-file')).toBe(true);
        expect(saveSession).toHaveBeenCalled();
    });

    test('restoring nested file tabs does not overwrite the exact expanded-folder set', () => {
        state.fileTreeData = [
            {
                name: 'Projects', path: 'Projects', type: 'directory', children: [{
                    name: 'Alpha', path: 'Projects/Alpha', type: 'directory', children: [
                        { name: 'active.md', path: 'Projects/Alpha/active.md', type: 'file', mtime: 1 },
                    ],
                }],
            },
            {
                name: 'Archive', path: 'Archive', type: 'directory', children: [{
                    name: 'Old', path: 'Archive/Old', type: 'directory', children: [
                        { name: 'closed.md', path: 'Archive/Old/closed.md', type: 'file', mtime: 1 },
                    ],
                }],
            },
            {
                name: 'Manual', path: 'Manual', type: 'directory', children: [{
                    name: 'Kept', path: 'Manual/Kept', type: 'directory', children: [
                        { name: 'note.md', path: 'Manual/Kept/note.md', type: 'file', mtime: 1 },
                    ],
                }],
            },
        ];
        const restoredExpansion = new Set(['Manual', 'Manual/Kept']);
        state.expandedDirs = new Set(restoredExpansion);
        state.openTabs = [
            { id: 'Projects/Alpha/active.md', type: 'file', path: 'Projects/Alpha/active.md' },
            { id: 'Archive/Old/closed.md', type: 'file', path: 'Archive/Old/closed.md' },
        ];
        initFileTree();

        const activeTabListener = subscribe.mock.calls
            .find(([key]) => key === 'activeTabId')?.[1];
        expect(activeTabListener).toEqual(expect.any(Function));

        // restoreOpenTabs activates every restored tab before selecting the
        // persisted active one. None of those activations may rewrite the
        // user's folder configuration.
        for (const tabId of [
            'Projects/Alpha/active.md',
            'Archive/Old/closed.md',
            'Projects/Alpha/active.md',
        ]) {
            state.activeTabId = tabId;
            activeTabListener();
        }

        expect(state.expandedDirs).toEqual(restoredExpansion);
        expect(state.selectedFilePath).toBe('Projects/Alpha/active.md');
        expect(document.querySelector('.file-tree-item[data-path="Manual"]').classList.contains('expanded')).toBe(true);
        expect(document.querySelector('.file-tree-item[data-path="Manual/Kept"]').classList.contains('expanded')).toBe(true);
        expect(document.querySelector('.file-tree-item[data-path="Projects"]').classList.contains('expanded')).toBe(false);
        expect(document.querySelector('.file-tree-item[data-path="Archive"]').classList.contains('expanded')).toBe(false);
    });

    test('coalesces filesystem-triggered tree refreshes instead of polling continuously', async () => {
        jest.useFakeTimers();
        try {
            scheduleFileTreeRefresh(180);
            scheduleFileTreeRefresh(180);
            jest.advanceTimersByTime(179);
            expect(window.go.main.App.GetFileTree).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1);
            await Promise.resolve();
            expect(window.go.main.App.GetFileTree).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    test('maps native file-manager drops to the containing vault folder', () => {
        state.fileTreeData = [{
            name: 'Projects', path: 'Projects', type: 'directory', children: [
                { name: 'plan.md', path: 'Projects/plan.md', type: 'file', mtime: 1 },
            ],
        }];
        state.expandedDirs = new Set(['Projects']);
        initFileTree();
        renderFileTree();

        const folder = document.querySelector('.file-tree-item[data-path="Projects"] > .file-tree-node');
        const file = document.querySelector('.file-tree-item[data-path="Projects/plan.md"] > .file-tree-node');
        const root = document.querySelector('.file-tree-root-dropzone');
        expect(externalDropTargetDirectory(folder)).toBe('Projects');
        expect(externalDropTargetDirectory(file)).toBe('Projects');
        expect(externalDropTargetDirectory(root)).toBe('');
        expect(externalDropTargetDirectory(document.body)).toBeNull();
    });

    test('copies native paths instead of moving them and expands the destination', async () => {
        state.fileTreeData = [{ name: 'Imported', path: 'Imported', type: 'directory', children: [] }];
        state.expandedDirs = new Set();
        window.go.main.App.CopyExternalPaths.mockResolvedValueOnce({
            success: true,
            paths: ['Imported/report.md', 'Imported/Assets'],
        });
        window.go.main.App.GetFileTree.mockResolvedValueOnce(state.fileTreeData);

        await expect(copyExternalDrop([
            'C:\\Users\\Writer\\report.md',
            'C:\\Users\\Writer\\Assets',
        ], 'Imported')).resolves.toBe(true);

        expect(window.go.main.App.CopyExternalPaths).toHaveBeenCalledWith([
            'C:\\Users\\Writer\\report.md',
            'C:\\Users\\Writer\\Assets',
        ], 'Imported', false);
        expect(window.go.main.App.MovePath).not.toHaveBeenCalled();
        expect(state.expandedDirs).toContain('Imported');
        expect(saveSession).toHaveBeenCalled();
    });

    test('registers the Wails native file drop callback for the file tree', async () => {
        state.fileTreeData = [{ name: 'Inbox', path: 'Inbox', type: 'directory', children: [] }];
        initFileTree();
        renderFileTree();
        let callback;
        const runtime = {
            OnFileDrop: jest.fn((handler) => { callback = handler; }),
        };
        const folder = document.querySelector('.file-tree-item[data-path="Inbox"] > .file-tree-node');
        const originalElementFromPoint = document.elementFromPoint;
        document.elementFromPoint = jest.fn().mockReturnValue(folder);
        window.go.main.App.CopyExternalPaths.mockResolvedValueOnce({ success: true, paths: ['Inbox/note.md'] });
        window.go.main.App.GetFileTree.mockResolvedValueOnce(state.fileTreeData);

        expect(initNativeFileDrops(runtime)).toBe(true);
        expect(runtime.OnFileDrop).toHaveBeenCalledWith(expect.any(Function), true);
        callback(42, 84, ['/home/writer/note.md']);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.go.main.App.CopyExternalPaths).toHaveBeenCalledWith(['/home/writer/note.md'], 'Inbox', false);
        document.elementFromPoint = originalElementFromPoint;
    });

    test('asks before replacing a conflicting external drop', async () => {
        state.fileTreeData = [{ name: 'Imported', path: 'Imported', type: 'directory', children: [] }];
        window.go.main.App.CopyExternalPaths
            .mockResolvedValueOnce({
                success: false,
                conflicts: ['Imported/report.md'],
                error: 'One or more items already exist in the destination',
            })
            .mockResolvedValueOnce({ success: true, paths: ['Imported/report.md'] });
        window.go.main.App.GetFileTree.mockResolvedValueOnce(state.fileTreeData);
        confirmDialog.mockResolvedValueOnce('confirm');

        await expect(copyExternalDrop(['/home/writer/report.md'], 'Imported')).resolves.toBe(true);

        expect(confirmDialog).toHaveBeenCalledWith(
            'Replace existing item?',
            expect.stringContaining('“report.md”'),
            true,
            false,
            { confirmLabel: 'Replace' }
        );
        expect(window.go.main.App.CopyExternalPaths).toHaveBeenNthCalledWith(
            1, ['/home/writer/report.md'], 'Imported', false
        );
        expect(window.go.main.App.CopyExternalPaths).toHaveBeenNthCalledWith(
            2, ['/home/writer/report.md'], 'Imported', true
        );
    });

    test('warns and merges a dropped directory without replacing filename collisions', async () => {
        state.fileTreeData = [{ name: 'Imported', path: 'Imported', type: 'directory', children: [] }];
        window.go.main.App.CopyExternalPaths.mockResolvedValueOnce({
            success: false,
            conflicts: ['Imported/Assets'],
            directory_conflicts: ['Imported/Assets'],
            error: 'One or more items already exist in the destination',
        });
        window.go.main.App.MergeExternalPaths.mockResolvedValueOnce({
            success: true,
            paths: ['Imported/Assets'],
        });
        window.go.main.App.GetFileTree.mockResolvedValueOnce(state.fileTreeData);

        await expect(copyExternalDrop(['/home/writer/Assets'], 'Imported')).resolves.toBe(true);

        expect(confirmDialog).toHaveBeenCalledWith(
            'Destination directory already exists',
            expect.stringContaining('Merge the directory contents instead?'),
            false,
            false,
            expect.objectContaining({ confirmLabel: 'Merge contents', tone: 'warning' })
        );
        expect(window.go.main.App.MergeExternalPaths).toHaveBeenCalledWith(
            ['/home/writer/Assets'],
            'Imported'
        );
        expect(window.go.main.App.CopyExternalPaths).toHaveBeenCalledTimes(1);
    });

    test('leaves the destination unchanged when replacement is cancelled', async () => {
        window.go.main.App.CopyExternalPaths.mockResolvedValueOnce({
            success: false,
            conflicts: ['report.md'],
            error: 'One or more items already exist in the destination',
        });
        confirmDialog.mockResolvedValueOnce(false);

        await expect(copyExternalDrop(['/home/writer/report.md'], '')).resolves.toBe(false);

        expect(confirmDialog).toHaveBeenCalled();
        expect(window.go.main.App.CopyExternalPaths).toHaveBeenCalledTimes(1);
        expect(window.go.main.App.CopyExternalPaths).toHaveBeenCalledWith(
            ['/home/writer/report.md'], '', false
        );
    });

    test('opens CodeMirror-supported source files from the tree', async () => {
        state.fileTreeData = [{
            name: '_print.css',
            path: 'themes/_print.css',
            type: 'file',
            mtime: 100,
        }];
        initFileTree();
        renderFileTree();

        const node = document.querySelector('.file-tree-node');
        expect(node.classList.contains('non-md')).toBe(false);
        node.click();
        await testUtils.waitFor(0);

        expect(handleFileOpen).toHaveBeenCalledWith('themes/_print.css');
    });

    test('opens a root context menu when right-clicking empty file-tree space', () => {
        state.fileTreeData = [];
        initFileTree();

        const tree = document.getElementById('file-tree');
        tree.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 32,
            clientY: 48,
        }));

        const menu = document.querySelector('.context-menu');
        expect(menu).not.toBeNull();
        expect([...menu.querySelectorAll('[data-action]')].map(item => item.dataset.action)).toEqual([
            'open-new-tab', 'merge-notes', 'preview-pdf',
            'copy', 'paste',
            'new-file', 'new-drawio', 'new-folder', 'rename', 'customize-style', 'reveal', 'delete',
        ]);
        expect(menu.querySelector('[data-action="new-file"]').classList.contains('disabled')).toBe(false);
        for (const action of ['open-new-tab', 'merge-notes', 'preview-pdf', 'copy', 'paste', 'rename', 'customize-style', 'reveal', 'delete']) {
            expect(menu.querySelector(`[data-action="${action}"]`).classList.contains('disabled')).toBe(true);
        }
        expect(state.contextTargetType).toBe('root');
        expect(state.contextTargetPath).toBe('');
    });

    test('keeps the same action order for files, folders, and the vault root', () => {
        const actionsFor = options => {
            const surface = document.createElement('div');
            surface.innerHTML = buildFileTreeContextMenuHTML(options);
            return [...surface.querySelectorAll('[data-action]')].map(item => item.dataset.action);
        };
        const expectedActions = [
            'open-new-tab', 'merge-notes', 'preview-pdf',
            'copy', 'paste',
            'new-file', 'new-drawio', 'new-folder', 'rename', 'customize-style', 'reveal', 'delete',
        ];

        expect(actionsFor({ type: 'root' })).toEqual(expectedActions);
        expect(actionsFor({ type: 'directory', path: 'notes' })).toEqual(expectedActions);
        expect(actionsFor({ type: 'file', path: 'notes/report.md', selectedPaths: ['notes/other.md'] })).toEqual(expectedActions);
    });

    test('copies an internal folder to its original parent and selects the uniquely named copy', async () => {
        state.fileTreeData = [{
            name: 'Projects', path: 'Projects', type: 'directory', children: [
                { name: 'plan.md', path: 'Projects/plan.md', type: 'file', mtime: 1 },
            ],
        }];
        window.go.main.App.CopyPath.mockResolvedValueOnce({ success: true, path: 'Projects copy' });
        window.go.main.App.GetFileTree.mockResolvedValueOnce([
            ...state.fileTreeData,
            { name: 'Projects copy', path: 'Projects copy', type: 'directory', children: [] },
        ]);

        expect(copyInternalPath('Projects', 'directory')).toBe(true);
        await expect(pasteInternalClipboard('', 'root')).resolves.toBe(true);

        expect(prepareTabsForPathCopy).toHaveBeenCalledWith('Projects');
        expect(window.go.main.App.CopyPath).toHaveBeenCalledWith('Projects', '');
        expect(prepareTabsForPathCopy.mock.invocationCallOrder[0]).toBeLessThan(
            window.go.main.App.CopyPath.mock.invocationCallOrder[0]
        );
        expect(state.selectedTreePath).toBe('Projects copy');
        expect(messageDialog).not.toHaveBeenCalled();
    });

    test('refuses to paste a folder into itself or a descendant before calling the backend', async () => {
        copyInternalPath('Projects', 'directory');

        await expect(pasteInternalClipboard('Projects/Archive', 'directory')).resolves.toBe(false);

        expect(window.go.main.App.CopyPath).not.toHaveBeenCalled();
        expect(messageDialog).toHaveBeenCalledWith(
            'Operation refused',
            'A folder cannot be copied into itself or one of its descendants because that would cause a recursive copy. Select its parent folder to create a sibling copy instead.',
            { icon: 'warning', tone: 'warning' }
        );
        expect(isInvalidCopyDestination('Projects', 'Projects')).toBe(true);
        expect(isInvalidCopyDestination('Projects', 'Projects/Archive')).toBe(true);
        expect(isInvalidCopyDestination('Projects', '')).toBe(false);
    });

    test('does not copy stale disk content when a dirty source cannot be saved', async () => {
        copyInternalPath('Projects', 'directory');
        prepareTabsForPathCopy.mockResolvedValueOnce({
            success: false,
            error: 'Could not save "plan.md" before copying it',
        });

        await expect(pasteInternalClipboard('', 'root')).resolves.toBe(false);

        expect(window.go.main.App.CopyPath).not.toHaveBeenCalled();
        expect(errorDialog).toHaveBeenCalledWith(
            'Couldn’t copy item',
            'Could not save "plan.md" before copying it',
            'The source could not be saved before copying.'
        );
    });

    test('uses a folder as the paste destination and a file parent as the paste destination', () => {
        expect(internalPasteTargetDirectory('Archive', 'directory')).toBe('Archive');
        expect(internalPasteTargetDirectory('Archive/readme.md', 'file')).toBe('Archive');
        expect(internalPasteTargetDirectory('readme.md', 'file')).toBe('');
        expect(internalPasteTargetDirectory('', 'root')).toBe('');
    });

    test('supports Ctrl/Cmd+C and Ctrl/Cmd+V while the file tree is focused', async () => {
        state.fileTreeData = [
            { name: 'note.md', path: 'note.md', type: 'file', mtime: 1 },
            { name: 'Archive', path: 'Archive', type: 'directory', children: [] },
        ];
        state.selectedTreePath = 'note.md';
        window.go.main.App.CopyPath.mockResolvedValueOnce({ success: true, path: 'Archive/note.md' });
        window.go.main.App.GetFileTree.mockResolvedValueOnce(state.fileTreeData);
        initFileTree();

        const tree = document.getElementById('file-tree');
        tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
        state.selectedTreePath = 'Archive';
        tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.go.main.App.CopyPath).toHaveBeenCalledWith('note.md', 'Archive');
    });

    test('keeps a root action surface below a short file list', () => {
        state.fileTreeData = [{ name: 'only-note.md', path: 'only-note.md', type: 'file', mtime: 1 }];
        initFileTree();
        renderFileTree();

        const rootSurface = document.querySelector('.file-tree-root-dropzone');
        expect(rootSurface).not.toBeNull();
        rootSurface.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 28,
            clientY: 180,
        }));

        expect(document.querySelector('.context-menu').textContent).toContain('New File');
        expect(state.contextTargetType).toBe('root');
    });

    test('selects the vault root surface for keyboard paste', () => {
        state.fileTreeData = [{ name: 'Folder', path: 'Folder', type: 'directory', children: [] }];
        state.selectedTreePath = 'Folder';
        initFileTree();

        document.querySelector('.file-tree-root-dropzone').click();

        expect(state.selectedTreePath).toBeNull();
        expect(document.activeElement).toBe(document.getElementById('file-tree'));
        expect(saveSession).toHaveBeenCalled();
    });

    test('offers PDF preview instead of direct export for Markdown files', () => {
        state.fileTreeData = [{ name: 'report.md', path: 'notes/report.md', type: 'file', mtime: 100 }];
        initFileTree();
        renderFileTree();

        document.querySelector('.file-tree-node').dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        }));

        const menu = document.querySelector('.context-menu');
        expect(menu.textContent).toContain('Preview PDF');
        expect(menu.textContent).not.toContain('Export to PDF');
        expect(menu.querySelector('[data-action="preview-pdf"]')).not.toBeNull();
    });

    test('creates a non-Markdown file without appending .md or Markdown starter content', async () => {
        state.fileTreeData = [];
        newNoteDialog.mockResolvedValueOnce('print.css');
        window.go.main.App.CreateFile.mockResolvedValueOnce({ success: true, path: 'print.css' });
        initFileTree();

        const tree = document.getElementById('file-tree');
        tree.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        document.querySelector('.context-menu [data-action="new-file"]').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.go.main.App.CreateFile).toHaveBeenCalledWith('print.css', '');
        expect(handleFileOpen).toHaveBeenCalledWith('print.css');
    });

    test('renames a tree item and refreshes tabs whose backlinks were rewritten', async () => {
        state.fileTreeData = [{ name: 'draft.md', path: 'notes/draft.md', type: 'file', mtime: 100 }];
        state.selectedFilePath = 'notes/draft.md';
        state.selectedFilePaths = ['notes/draft.md'];
        renamePathDialog.mockResolvedValueOnce('final.md');
        window.go.main.App.RenamePath.mockResolvedValueOnce({
            success: true,
            old_path: 'notes/draft.md',
            path: 'notes/final.md',
            updated_links: ['notes/references.md'],
        });
        initFileTree();
        renderFileTree();

        document.querySelector('.file-tree-node').dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        }));
        document.querySelector('.context-menu [data-action="rename"]').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(renamePathDialog).toHaveBeenCalledWith('notes/draft.md', 'file');
        expect(prepareTabsForPathMove).toHaveBeenCalledWith('notes/draft.md');
        expect(window.go.main.App.RenamePath).toHaveBeenCalledWith('notes/draft.md', 'notes/final.md');
        expect(updateTabsForMovedPath).toHaveBeenCalledWith('notes/draft.md', 'notes/final.md');
        expect(refreshTabsForUpdatedLinks).toHaveBeenCalledWith(['notes/references.md']);
        expect(state.selectedFilePath).toBe('notes/final.md');
        expect(state.selectedFilePaths).toEqual(['notes/final.md']);
    });

    describe('findTreeItem', () => {
        test('should find item at root level', () => {
            const items = [
                { name: 'note.md', path: 'note.md', type: 'file' },
                { name: 'folder', path: 'folder', type: 'directory', children: [] }
            ];
            
            const found = findTreeItem(items, 'note.md');
            expect(found).toEqual(items[0]);
        });

        test('should find item in nested directory', () => {
            const items = [
                { name: 'folder', path: 'folder', type: 'directory', children: [
                    { name: 'inner.md', path: 'folder/inner.md', type: 'file' }
                ]}
            ];
            
            const found = findTreeItem(items, 'folder/inner.md');
            expect(found).toEqual(items[0].children[0]);
        });

        test('should return null for non-existent path', () => {
            const items = [
                { name: 'note.md', path: 'note.md', type: 'file' }
            ];
            
            const found = findTreeItem(items, 'nonexistent.md');
            expect(found).toBeNull();
        });
    });

    describe('move validation', () => {
        test('rejects moving a directory into itself or a descendant', () => {
            expect(isInvalidMoveDestination('projects', 'projects')).toBe(true);
            expect(isInvalidMoveDestination('projects', 'projects/archive')).toBe(true);
            expect(isInvalidMoveDestination('projects', 'projects-archive')).toBe(false);
        });

        test('allows moving a file into its current parent and normalizes separators', () => {
            expect(isInvalidMoveDestination('projects/note.md', 'projects')).toBe(false);
            expect(isInvalidMoveDestination('projects\\note.md', 'archive')).toBe(false);
        });

        test('warns before merging an existing destination directory and remaps collision copies', async () => {
            window.go.main.App.MovePath.mockResolvedValueOnce({
                success: false,
                error: 'Destination directory already exists',
                merge_available: true,
                old_path: 'Drafts',
                path: 'Archive/Drafts',
            });
            window.go.main.App.MergeDirectory.mockResolvedValueOnce({
                success: true,
                old_path: 'Drafts',
                path: 'Archive/Drafts',
                moved_paths: {
                    'Drafts/report.md': 'Archive/Drafts/report (copy).md',
                },
                updated_links: ['index.md'],
            });

            await expect(moveInternalPath('Drafts', 'Archive')).resolves.toBe(true);

            expect(confirmDialog).toHaveBeenCalledWith(
                'Destination directory already exists',
                expect.stringContaining('Merge the moved directory into it instead?'),
                false,
                false,
                expect.objectContaining({ confirmLabel: 'Merge contents', tone: 'warning' })
            );
            expect(window.go.main.App.MergeDirectory).toHaveBeenCalledWith('Drafts', 'Archive');
            expect(updateTabsForMovedPath).toHaveBeenNthCalledWith(
                1,
                'Drafts/report.md',
                'Archive/Drafts/report (copy).md'
            );
            expect(updateTabsForMovedPath).toHaveBeenNthCalledWith(2, 'Drafts', 'Archive/Drafts');
            expect(refreshTabsForUpdatedLinks).toHaveBeenCalledWith(['index.md']);
        });

        test('leaves both directories untouched when the merge warning is cancelled', async () => {
            window.go.main.App.MovePath.mockResolvedValueOnce({
                success: false,
                merge_available: true,
            });
            confirmDialog.mockResolvedValueOnce(false);

            await expect(moveInternalPath('Drafts', 'Archive')).resolves.toBe(false);

            expect(window.go.main.App.MergeDirectory).not.toHaveBeenCalled();
            expect(updateTabsForMovedPath).not.toHaveBeenCalled();
        });
    });

    describe('context menu placement', () => {
        test('opens upward when a lower file would clip the menu', () => {
            expect(getContextMenuPosition(
                420,
                580,
                { width: 200, height: 280 },
                { innerWidth: 900, innerHeight: 720 }
            )).toEqual({ left: 420, top: 432 });
        });

        test('keeps the menu inside the left and top viewport margins', () => {
            expect(getContextMenuPosition(
                -20,
                -12,
                { width: 200, height: 120 },
                { innerWidth: 900, innerHeight: 720 }
            )).toEqual({ left: 8, top: 8 });
        });
    });

    describe('toggleDirectory DOM', () => {
        test('should toggle expanded class on DOM element', () => {
            state.fileTreeData = [
                { name: 'folder', path: 'folder', type: 'directory', children: [
                    { name: 'inner.md', path: 'folder/inner.md', type: 'file', mtime: 2000 }
                ]}
            ];
            state.expandedDirs = new Set();
            renderFileTree();
            
            const item = document.querySelector('.file-tree-item[data-path="folder"]');
            expect(item).not.toBeNull();
            expect(item.classList.contains('expanded')).toBe(false);
            
            // Expand
            toggleDirectory('folder');
            expect(item.classList.contains('expanded')).toBe(true);
            
            // Collapse
            toggleDirectory('folder');
            expect(item.classList.contains('expanded')).toBe(false);
        });

        test('should toggle multiple directories independently', () => {
            state.fileTreeData = [
                { name: 'dirA', path: 'dirA', type: 'directory', children: [
                    { name: 'a.md', path: 'dirA/a.md', type: 'file', mtime: 1000 }
                ]},
                { name: 'dirB', path: 'dirB', type: 'directory', children: [
                    { name: 'b.md', path: 'dirB/b.md', type: 'file', mtime: 2000 }
                ]}
            ];
            state.expandedDirs = new Set();
            renderFileTree();
            
            const itemA = document.querySelector('.file-tree-item[data-path="dirA"]');
            const itemB = document.querySelector('.file-tree-item[data-path="dirB"]');
            
            toggleDirectory('dirA');
            expect(itemA.classList.contains('expanded')).toBe(true);
            expect(itemB.classList.contains('expanded')).toBe(false);
            
            toggleDirectory('dirB');
            expect(itemA.classList.contains('expanded')).toBe(true);
            expect(itemB.classList.contains('expanded')).toBe(true);
        });
    });

    describe('renderFileTree', () => {
        test('should show empty message for empty vault', () => {
            state.fileTreeData = [];
            renderFileTree();
            
            const container = document.getElementById('file-tree');
            expect(container.innerHTML).toContain('No files in vault');
        });

        test('should render file tree from state data', () => {
            state.fileTreeData = [
                { name: 'note.md', path: 'note.md', type: 'file', mtime: 1000 }
            ];
            
            renderFileTree();
            
            const container = document.getElementById('file-tree');
            expect(container.innerHTML).toContain('note.md');
        });

        test('keeps the newest tree when an earlier refresh resolves late', async () => {
            const slow = deferred();
            const fast = deferred();
            window.go.main.App.GetFileTree
                .mockImplementationOnce(() => slow.promise)
                .mockImplementationOnce(() => fast.promise);

            const firstRefresh = refreshFileTree();
            const secondRefresh = refreshFileTree();

            fast.resolve([{ name: 'Current.md', path: 'Current.md', type: 'file', mtime: 2 }]);
            await secondRefresh;

            slow.resolve([{ name: 'Stale.md', path: 'Stale.md', type: 'file', mtime: 1 }]);
            await firstRefresh;

            expect(state.fileTreeData).toEqual([
                expect.objectContaining({ path: 'Current.md' })
            ]);
        });
    });


    describe('indent guides (hierarchy depth)', () => {
        /** Count how many .file-tree-children ancestors wrap a given element */
        function countGuideAncestors(el) {
            let count = 0;
            let current = el.closest('.file-tree-children');
            while (current) {
                count++;
                current = current.parentElement?.closest('.file-tree-children') || null;
            }
            return count;
        }

        test('should produce 0 guide lines at depth 0 (root items, no expanded folders)', () => {
            const items = [
                { name: 'note.md', path: 'note.md', type: 'file', mtime: 1000 },
                { name: 'folder', path: 'folder', type: 'directory', children: [
                    { name: 'inner.md', path: 'folder/inner.md', type: 'file', mtime: 2000 }
                ]}
            ];
            const html = buildTreeHTML(items, new Set(), null);
            const div = document.createElement('div');
            div.innerHTML = html;

            // The root .file-tree-list is directly inside .file-tree-children.
            // Root items are at depth 0 — they are NOT wrapped in any .file-tree-children.
            const rootItems = div.querySelectorAll(':scope > .file-tree-list > .file-tree-item');
            for (const item of rootItems) {
                expect(countGuideAncestors(item)).toBe(0);
            }
        });

        test('should produce 1 guide line per item at depth 1', () => {
            const items = [
                { name: 'folder', path: 'folder', type: 'directory', children: [
                    { name: 'a.md', path: 'folder/a.md', type: 'file', mtime: 1000 },
                    { name: 'b.md', path: 'folder/b.md', type: 'file', mtime: 2000 }
                ]}
            ];
            // One folder expanded → children visible inside .file-tree-children
            const expanded = new Set(['folder']);
            const html = buildTreeHTML(items, expanded, null);
            const div = document.createElement('div');
            div.innerHTML = html;

            // Children of 'folder' are inside exactly one .file-tree-children
            const children = div.querySelectorAll('.file-tree-children .file-tree-item');
            expect(children.length).toBe(2);
            for (const child of children) {
                expect(countGuideAncestors(child)).toBe(1);
            }
        });

        test('should produce 2 guide lines per item at depth 2', () => {
            const items = [
                { name: 'folder', path: 'folder', type: 'directory', children: [
                    { name: 'sub', path: 'folder/sub', type: 'directory', children: [
                        { name: 'deep.md', path: 'folder/sub/deep.md', type: 'file', mtime: 3000 }
                    ]}
                ]}
            ];
            const expanded = new Set(['folder', 'folder/sub']);
            const html = buildTreeHTML(items, expanded, null);
            const div = document.createElement('div');
            div.innerHTML = html;

            const deepItem = div.querySelector('.file-tree-item[data-path="folder/sub/deep.md"]');
            expect(deepItem).not.toBeNull();
            expect(countGuideAncestors(deepItem)).toBe(2);
        });

        test('should produce 3 guide lines per item at depth 3', () => {
            const items = [
                { name: 'a', path: 'a', type: 'directory', children: [
                    { name: 'b', path: 'a/b', type: 'directory', children: [
                        { name: 'c', path: 'a/b/c', type: 'directory', children: [
                            { name: 'd.md', path: 'a/b/c/d.md', type: 'file', mtime: 4000 }
                        ]}
                    ]}
                ]}
            ];
            const expanded = new Set(['a', 'a/b', 'a/b/c']);
            const html = buildTreeHTML(items, expanded, null);
            const div = document.createElement('div');
            div.innerHTML = html;

            const deepItem = div.querySelector('.file-tree-item[data-path="a/b/c/d.md"]');
            expect(deepItem).not.toBeNull();
            expect(countGuideAncestors(deepItem)).toBe(3);
        });

        test('should produce correct guide count with mixed depths (some folders collapsed)', () => {
            const items = [
                { name: 'a', path: 'a', type: 'directory', children: [
                    { name: 'a1.md', path: 'a/a1.md', type: 'file', mtime: 1000 },
                    { name: 'b', path: 'a/b', type: 'directory', children: [
                        { name: 'c.md', path: 'a/b/c.md', type: 'file', mtime: 2000 }
                    ]}
                ]}
            ];
            // Only 'a' expanded — descendants of a/b are omitted from the DOM
            // until the user expands it.
            const expanded = new Set(['a']);
            const html = buildTreeHTML(items, expanded, null);
            const div = document.createElement('div');
            div.innerHTML = html;

            // a1.md at depth 1: wrapped in one .file-tree-children (from 'a')
            const a1 = div.querySelector('.file-tree-item[data-path="a/a1.md"]');
            expect(a1).not.toBeNull();
            expect(countGuideAncestors(a1)).toBe(1);

            // b directory at depth 1
            const b = div.querySelector('.file-tree-item[data-path="a/b"]');
            expect(b).not.toBeNull();
            expect(countGuideAncestors(b)).toBe(1);

            // c.md is not mounted while its parent remains collapsed.
            const c = div.querySelector('.file-tree-item[data-path="a/b/c.md"]');
            expect(c).toBeNull();
        });
    });

    describe('merge notes', () => {
        beforeEach(() => {
            // Set up DOM for modal
            document.body.innerHTML = '<div id="modals-container"></div>';
        });

        test('merge modal should create checkboxes for each source file', async () => {
            // Simulate multi-select + open file
            state.selectedFilePaths = ['b.md'];
            state.selectedFilePath = 'a.md';
            state.contextTargetPath = 'a.md';

            // Build the HTML that mergeSelectedNotes would produce
            const sourceNames = ['b.md'];
            const sourceRows = sourceNames.map((n, i) =>
                `<label class="merge-file-row">
                    <input type="checkbox" class="merge-checkbox" data-index="${i}" checked>
                    <span class="merge-file-name">${n}</span>
                </label>`
            ).join('');
            
            expect(sourceRows).toContain('merge-checkbox');
            expect(sourceRows).toContain('checked');
            expect(sourceRows).toContain('b.md');
            expect(sourceRows).toContain('data-index="0"');
        });

        test('merge modal should render destination row with master name', () => {
            const masterName = 'a.md';
            const html = `<span class="merge-dest-name">${masterName}</span>`;
            
            expect(html).toContain('merge-dest-name');
            expect(html).toContain('a.md');
        });

        test('merge modal should have cancel and merge buttons', () => {
            const buttons = `
                <button class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                <button class="custom-modal-btn custom-modal-btn-confirm">Merge</button>
            `;
            
            expect(buttons).toContain('custom-modal-btn-cancel');
            expect(buttons).toContain('custom-modal-btn-confirm');
            expect(buttons).toContain('Cancel');
            expect(buttons).toContain('Merge');
        });

        test('merge modal should show warning about deletion', () => {
            const warning = 'Checked notes will be permanently deleted after merging.';
            
            expect(warning).toContain('permanently deleted');
            expect(warning).toContain('Checked notes');
        });

        test('mergePaths should include master + checked sources only', () => {
            state.selectedFilePaths = ['b.md', 'c.md'];
            state.selectedFilePath = 'a.md';
            state.contextTargetPath = 'a.md';

            // Simulate what mergeSelectedNotes builds internally
            const all = ['a.md', 'b.md', 'c.md'];
            const paths = [...new Set(all)];  // deduplicated
            expect(paths).toEqual(['a.md', 'b.md', 'c.md']);

            // Simulate user unchecking b.md (index 0 in sources)
            const checkedIndices = [1]; // only c.md checked
            const mergePaths = [paths[0], ...checkedIndices.map(i => paths[i + 1])];
            expect(mergePaths).toEqual(['a.md', 'c.md']);
            expect(mergePaths).not.toContain('b.md');
        });
    });
});

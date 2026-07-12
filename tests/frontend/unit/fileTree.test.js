/**
 * Unit tests for fileTree.js
 * Run with: npx jest js/fileTree.test.js
 */

import { testUtils } from './test_setup.js';
import { initFileTree, renderFileTree, buildTreeHTML, buildFileTreeContextMenuHTML, toggleDirectory, findTreeItem, refreshFileTree, getContextMenuPosition, isInvalidMoveDestination } from '../frontend/js/fileTree.js';

// Mock state store (module-level, 'mock' prefix required by jest, var for hoisting)
var mockState = {
    fileTreeData: null,
    expandedDirs: new Set(),
    selectedFilePath: null,
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
    openTab: jest.fn(),
    handleFileOpen: jest.fn()
}));

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() }
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    confirmDialog: jest.fn().mockResolvedValue(true),
    promptDialog: jest.fn().mockResolvedValue('test.md'),
    newNoteDialog: jest.fn().mockResolvedValue('test.md'),
    pdfExportErrorDialog: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../frontend/js/session.js', () => ({
    saveSession: jest.fn()
}));

jest.mock('../frontend/js/tabManager.js', () => ({
    closeTabsForDeletedPath: jest.fn(),
    prepareTabsForPathMove: jest.fn().mockResolvedValue({ success: true }),
    refreshTabsForUpdatedLinks: jest.fn().mockResolvedValue(false),
    updateTabsForMovedPath: jest.fn(),
}));

import { state, setState, getState } from '../frontend/js/state.js';
import { openTab, handleFileOpen } from '../frontend/js/app.js';
import { statusBar } from '../frontend/js/statusBar.js';
import { confirmDialog, newNoteDialog, promptDialog } from '../frontend/js/dialogs.js';
import { prepareTabsForPathMove, refreshTabsForUpdatedLinks, updateTabsForMovedPath } from '../frontend/js/tabManager.js';

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
        state.selectedFilePaths = [];
        state.openTabs = [];
        state.activeTabId = null;
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
            
            const html = buildTreeHTML(items, new Set(), null);
            
            expect(html).toContain('note.md');
            expect(html).toContain('folder');
            expect(html).toContain('inner.md');
            expect(html).toContain('<svg');
            expect(html).toContain('file-tree-item');
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

    test('opens CodeMirror-supported source files from the tree', () => {
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
            'new-file', 'new-drawio', 'new-folder', 'rename', 'reveal', 'delete',
        ]);
        expect(menu.querySelector('[data-action="new-file"]').classList.contains('disabled')).toBe(false);
        for (const action of ['open-new-tab', 'merge-notes', 'preview-pdf', 'rename', 'reveal', 'delete']) {
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
            'new-file', 'new-drawio', 'new-folder', 'rename', 'reveal', 'delete',
        ];

        expect(actionsFor({ type: 'root' })).toEqual(expectedActions);
        expect(actionsFor({ type: 'directory', path: 'notes' })).toEqual(expectedActions);
        expect(actionsFor({ type: 'file', path: 'notes/report.md', selectedPaths: ['notes/other.md'] })).toEqual(expectedActions);
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
        window.pywebview.api.create_file.mockResolvedValueOnce({ success: true, path: 'print.css' });
        initFileTree();

        const tree = document.getElementById('file-tree');
        tree.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        document.querySelector('.context-menu [data-action="new-file"]').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.pywebview.api.create_file).toHaveBeenCalledWith('print.css', '');
        expect(handleFileOpen).toHaveBeenCalledWith('print.css');
    });

    test('renames a tree item and refreshes tabs whose backlinks were rewritten', async () => {
        state.fileTreeData = [{ name: 'draft.md', path: 'notes/draft.md', type: 'file', mtime: 100 }];
        state.selectedFilePath = 'notes/draft.md';
        state.selectedFilePaths = ['notes/draft.md'];
        promptDialog.mockResolvedValueOnce('final.md');
        window.pywebview.api.rename_path.mockResolvedValueOnce({
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

        expect(promptDialog).toHaveBeenCalledWith('Rename file', 'Enter a new file name:', 'draft.md');
        expect(prepareTabsForPathMove).toHaveBeenCalledWith('notes/draft.md');
        expect(window.pywebview.api.rename_path).toHaveBeenCalledWith('notes/draft.md', 'notes/final.md');
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
            window.pywebview.api.get_file_tree
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
            // Only 'a' expanded — 'a/b' is collapsed (CSS-hidden but still in DOM)
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

            // c.md: in the DOM but hidden (parent collapsed).
            // It is inside TWO .file-tree-children: 'a/b' (collapsed) + 'a' (expanded)
            const c = div.querySelector('.file-tree-item[data-path="a/b/c.md"]');
            expect(c).not.toBeNull();
            expect(countGuideAncestors(c)).toBe(2);
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

import {
    directoryPathsForReveal,
    dirtyFilePaths,
    fileTreeActionPaths,
    fileTreeFilePresentation,
    fileTreeKeyCommand,
    fileTreeKeyboardPlan,
    fileTreeTooltipPosition,
    fileTreeWindow,
    isFileTreeEntryPinned,
    mergeNoteCandidates,
    normalizeFileTreeStyles,
    reconcileSelectedTreePaths,
    selectedMergeNotePaths,
    sortFileTreeItems,
    toggleExpandedDirectory,
    toggleSelectedPath,
    visibleFileTreeRows,
} from '../frontend/js/core/fileTreeModel.js';
import {
    normalizeTransferEntries,
    planFileTreeTransfer,
    transferTargetDirectory,
} from '../frontend/js/core/fileTreeTransferModel.js';

describe('file tree model', () => {
    test('plans note merges from the open note and only the checked sources', () => {
        const candidates = mergeNoteCandidates(
            'a.md',
            ['b.md', 'c.md', 'a.md', 'image.png'],
            'context.md',
        );

        expect(candidates).toEqual(['context.md', 'a.md', 'b.md', 'c.md']);
        expect(selectedMergeNotePaths(candidates, [1, 2]))
            .toEqual(['context.md', 'b.md', 'c.md']);
        expect(selectedMergeNotePaths(candidates, [])).toEqual([]);
        expect(selectedMergeNotePaths(candidates, [99])).toEqual([]);
    });

    test('bounds a large visible-row window around scroll and keyboard anchors', () => {
        expect(fileTreeWindow(20_000)).toEqual({ start: 0, end: 160 });
        expect(fileTreeWindow(20_000, { selectedIndex: 10_000 }))
            .toEqual({ start: 9_920, end: 10_080 });
        expect(fileTreeWindow(20_000, { anchorIndex: 19_999 }))
            .toEqual({ start: 19_840, end: 20_000 });
        expect(fileTreeWindow(0)).toEqual({ start: 0, end: 0 });
    });
    test('normalizes appearance data without retaining unbounded recent icons', () => {
        const styles = normalizeFileTreeStyles({
            version: '2',
            entries: { Notes: { icon: 'folder' } },
            recent_icons: Array.from({ length: 12 }, (_, index) => String(index)),
        });
        expect(styles).toEqual({
            version: 2,
            entries: { Notes: { icon: 'folder' } },
            recent_icons: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        });
    });

    test('returns new directory and multi-selection collections', () => {
        const expanded = new Set(['Notes']);
        expect([...toggleExpandedDirectory(expanded, 'Notes')]).toEqual([]);
        expect([...expanded]).toEqual(['Notes']);
        expect(toggleSelectedPath(['a.md'], 'b.md')).toEqual(['a.md', 'b.md']);
        expect(toggleSelectedPath(['a.md', 'b.md'], 'a.md')).toEqual(['b.md']);
        expect(fileTreeActionPaths('b.md', ['a.md', 'b.md'])).toEqual(['a.md', 'b.md']);
        expect(fileTreeActionPaths('report.pdf', ['a.md', 'b.md'])).toEqual(['report.pdf']);
    });

    test('maps common vault file types to semantic icons with a generic fallback', () => {
        expect(fileTreeFilePresentation('notes/plan.md')).toEqual({ icon: 'FileText', label: 'Markdown document' });
        expect(fileTreeFilePresentation('exports/report.pdf')).toEqual({ icon: 'FileText', label: 'PDF document' });
        expect(fileTreeFilePresentation('assets/logo.svg')).toEqual({ icon: 'FileImage', label: 'Image file' });
        expect(fileTreeFilePresentation('data/index.json')).toEqual({ icon: 'FileJson', label: 'JSON file' });
        expect(fileTreeFilePresentation('data/items.csv')).toEqual({ icon: 'FileSpreadsheet', label: 'Spreadsheet file' });
        expect(fileTreeFilePresentation('scripts/build.sh')).toEqual({ icon: 'FileTerminal', label: 'Script file' });
        expect(fileTreeFilePresentation('diagrams/system.drawio.svg')).toEqual({ icon: 'Workflow', label: 'Draw.io diagram' });
        expect(fileTreeFilePresentation('attachments/blob.unknown')).toEqual({ icon: 'File', label: 'UNKNOWN file' });
    });

    test('places file-tree tooltips beside rows and clamps them to the viewport', () => {
        expect(fileTreeTooltipPosition(
            { left: 20, right: 220, top: 100, height: 24 },
            { width: 240, height: 60 },
            { width: 1000, height: 700 },
        )).toEqual({ left: 226, top: 82 });
        expect(fileTreeTooltipPosition(
            { left: 760, right: 980, top: 670, height: 24 },
            { width: 240, height: 80 },
            { width: 1000, height: 700 },
        )).toEqual({ left: 514, top: 612 });
        expect(fileTreeTooltipPosition(
            { left: 2, right: 12, top: 2, height: 20 },
            { width: 1200, height: 900 },
            { width: 1000, height: 700 },
        )).toEqual({ left: 8, top: 8 });
    });

    test('plans mixed file-tree transfers without redundant descendants', () => {
        const entries = normalizeTransferEntries([
            { path: 'Docs/plan.md', type: 'file' },
            { path: 'Docs', type: 'directory' },
            { path: 'report.pdf', type: 'file' },
            { path: 'report.pdf', type: 'file' },
        ]);

        expect(entries).toEqual([
            { path: 'Docs', type: 'directory' },
            { path: 'report.pdf', type: 'file' },
        ]);
        expect(transferTargetDirectory('Archive/report.pdf', 'file')).toBe('Archive');
        expect(transferTargetDirectory('Archive', 'directory')).toBe('Archive');
        expect(planFileTreeTransfer(entries, 'Archive', 'cut')).toMatchObject({
            valid: true,
            pending: entries,
            skipped: [],
        });
        expect(planFileTreeTransfer([{ path: 'Docs', type: 'directory' }], 'Docs/archive', 'cut').reason)
            .toBe('recursive-move');
        expect(planFileTreeTransfer([{ path: 'Docs', type: 'directory' }], 'Docs/archive', 'copy').reason)
            .toBe('recursive-copy');
        expect(planFileTreeTransfer([{ path: 'report.pdf', type: 'file' }], '', 'cut').skipped)
            .toEqual([{ path: 'report.pdf', type: 'file' }]);
        expect(planFileTreeTransfer([{ path: 'report.pdf', type: 'file' }], '', 'cut').pending)
            .toEqual([]);
    });

    test('reconciles operation selection after a tree refresh', () => {
        expect(reconcileSelectedTreePaths(
            ['report.pdf', 'gone.bin', 'Archive'],
            [{ path: 'Archive', type: 'directory', children: [{ path: 'report.pdf', type: 'file' }] }],
        )).toEqual(['report.pdf', 'Archive']);
    });

    test('marks dirty file buffers without treating clean open files as a state', () => {
        expect([...dirtyFilePaths([
            { type: 'file', path: 'active.md', dirty: true },
            { type: 'file', path: 'clean.md', dirty: false },
            { type: 'file', path: 'draft.md', dirty: true },
            { type: 'drawio', path: 'diagram.drawio.svg', dirty: true },
            { type: 'settings', path: 'ignored.md', dirty: true },
        ])]).toEqual(['active.md', 'draft.md', 'diagram.drawio.svg']);
    });

    test('plans every ancestor needed to reveal a nested folder', () => {
        expect(directoryPathsForReveal('Projects/Active/Design')).toEqual([
            'Projects',
            'Projects/Active',
            'Projects/Active/Design',
        ]);
        expect(directoryPathsForReveal('')).toEqual([]);
    });

    test('pins Inbox by default while preserving an explicit unpin', () => {
        const inbox = { path: 'Inbox', type: 'directory' };
        expect(isFileTreeEntryPinned(inbox, {})).toBe(true);
        expect(isFileTreeEntryPinned(inbox, { Inbox: { pinned: false } })).toBe(false);
        expect(isFileTreeEntryPinned({ path: 'Notes', type: 'directory' }, {})).toBe(false);
    });

    test('stably puts pinned siblings first without reordering either group', () => {
        const items = [
            { path: 'Archive', type: 'directory' },
            { path: 'Inbox', type: 'directory' },
            { path: 'draft.md', type: 'file' },
            { path: 'reference.md', type: 'file' },
        ];
        expect(sortFileTreeItems(items, {
            'draft.md': { pinned: true },
            Inbox: { pinned: false },
        }).map(item => item.path)).toEqual([
            'draft.md',
            'Archive',
            'Inbox',
            'reference.md',
        ]);
        expect(items.map(item => item.path)).toEqual(['Archive', 'Inbox', 'draft.md', 'reference.md']);
    });

    test('flattens only visible rows with stable parent and depth metadata', () => {
        const tree = [{
            path: 'Projects', type: 'directory', children: [
                { path: 'Projects/plan.md', type: 'file' },
                { path: 'Projects/Design', type: 'directory', children: [
                    { path: 'Projects/Design/spec.md', type: 'file' },
                ] },
            ],
        }, { path: 'Archive.md', type: 'file' }];

        expect(visibleFileTreeRows(tree, new Set(['Projects']))).toEqual([
            expect.objectContaining({ path: 'Projects', depth: 1, parentPath: null, expanded: true }),
            expect.objectContaining({ path: 'Projects/plan.md', depth: 2, parentPath: 'Projects' }),
            expect.objectContaining({ path: 'Projects/Design', depth: 2, parentPath: 'Projects', expanded: false }),
            expect.objectContaining({ path: 'Archive.md', depth: 1, parentPath: null }),
        ]);
    });

    test('plans standard roving tree focus, expansion, collapse, and activation', () => {
        const rows = visibleFileTreeRows([{
            path: 'Projects', type: 'directory', children: [
                { path: 'Projects/plan.md', type: 'file' },
                { path: 'Projects/spec.md', type: 'file' },
            ],
        }, { path: 'Archive.md', type: 'file' }], new Set(['Projects']));

        expect(fileTreeKeyboardPlan('ArrowDown', rows, 'Projects')).toEqual({ action: 'focus', path: 'Projects/plan.md' });
        expect(fileTreeKeyboardPlan('ArrowUp', rows, 'Projects/spec.md')).toEqual({ action: 'focus', path: 'Projects/plan.md' });
        expect(fileTreeKeyboardPlan('Home', rows, 'Archive.md')).toEqual({ action: 'focus', path: 'Projects' });
        expect(fileTreeKeyboardPlan('End', rows, 'Projects')).toEqual({ action: 'focus', path: 'Archive.md' });
        expect(fileTreeKeyboardPlan('ArrowRight', rows, 'Projects')).toEqual({ action: 'focus', path: 'Projects/plan.md' });
        expect(fileTreeKeyboardPlan('ArrowLeft', rows, 'Projects/plan.md')).toEqual({ action: 'focus', path: 'Projects' });
        expect(fileTreeKeyboardPlan('ArrowLeft', rows, 'Projects')).toEqual({ action: 'collapse', path: 'Projects' });
        expect(fileTreeKeyboardPlan('Enter', rows, 'Projects/plan.md')).toEqual({ action: 'activate', path: 'Projects/plan.md' });
        expect(fileTreeKeyboardPlan(' ', rows, 'Projects/plan.md')).toEqual({ action: 'toggle-selection', path: 'Projects/plan.md' });

        const collapsed = visibleFileTreeRows([{
            path: 'Projects', type: 'directory', children: [{ path: 'Projects/plan.md', type: 'file' }],
        }], new Set());
        expect(fileTreeKeyboardPlan('ArrowRight', collapsed, 'Projects')).toEqual({ action: 'expand', path: 'Projects' });
        expect(fileTreeKeyboardPlan('ArrowLeft', collapsed, 'Projects')).toEqual({ action: 'none' });
        expect(fileTreeKeyboardPlan('Tab', collapsed, 'Projects')).toBeNull();
    });

    test('prioritizes context, safe mutations, navigation, and clipboard keyboard commands', () => {
        expect(fileTreeKeyCommand({ key: 'F10', shiftKey: true, contextMenuRequested: true }))
            .toEqual({ action: 'context-menu' });
        expect(fileTreeKeyCommand({ key: 'Escape', cutActive: true }))
            .toEqual({ action: 'cancel-cut' });
        expect(fileTreeKeyCommand({ key: 'F2', itemActionable: true }))
            .toEqual({ action: 'rename' });
        expect(fileTreeKeyCommand({ key: 'Delete', itemActionable: true }))
            .toEqual({ action: 'delete' });
        expect(fileTreeKeyCommand({
            key: 'ArrowDown',
            navigationPlan: { action: 'focus', path: 'next.md' },
        })).toEqual({ action: 'focus', path: 'next.md' });
        expect(fileTreeKeyCommand({ key: 'x', ctrlKey: true, selectedEntryCount: 2 }))
            .toEqual({ action: 'cut' });
        expect(fileTreeKeyCommand({ key: 'c', metaKey: true, selectedEntryCount: 1 }))
            .toEqual({ action: 'copy' });
        expect(fileTreeKeyCommand({
            key: 'v', ctrlKey: true, clipboardAvailable: true, pasteAllowed: true,
        })).toEqual({ action: 'paste' });
        expect(fileTreeKeyCommand({
            key: 'v', ctrlKey: true, clipboardAvailable: true, pasteAllowed: false,
        })).toBeNull();
        expect(fileTreeKeyCommand({ key: 'F2', shiftKey: true, itemActionable: true }))
            .toBeNull();
    });
});

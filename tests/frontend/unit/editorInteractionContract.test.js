import { readTabContent } from '../../../frontend/js/usecases/tabContent.js';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { undo } from '@codemirror/commands';
import { testUtils } from './test_setup.js';
import { state, setState, subscribe } from '../../../frontend/js/state.js';
import * as tabs from '../../../frontend/js/tabManager.js';
import { configureEditorWorkspace, initEditor, createEditorView, setEditorContent } from '../../../frontend/js/editor.js';
import { initWindowChrome, resetWindowChromeForTests } from '../../../frontend/js/windowChrome.js';
import { initEditorBreadcrumb } from '../../../frontend/js/editorBreadcrumb.js';
import { initEditorPreviewLaunchers } from '../../../frontend/js/editorPreviewLaunchers.js';
import { initOutlinePanel, openOutlinePanel, closeOutlinePanel } from '../../../frontend/js/outline.js';
import { editorDiagnostics } from '../../../frontend/js/editorDiagnostics.js';
import { buildSessionSnapshot } from '../../../frontend/js/core/sessionModel.js';
import { subscribeEditorUpdates } from '../../../frontend/js/editorUpdates.js';
import { saveSession } from '../../../frontend/js/session.js';

// Assemble the real editor, tab owner, notification hub and shell adapters.
// Only external effects and unrelated launcher actions are substituted.
test('assembled cursor and typing paths obey the notification and work contract', async () => {
    testUtils.createMockDOM();
    const breadcrumb = document.createElement('nav'); breadcrumb.id = 'editor-breadcrumb';
    document.body.append(breadcrumb);
    window.go.desktop.App.SaveSession.mockResolvedValue({ success: true });
    window.go.desktop.App.WindowSetTitle.mockResolvedValue(undefined);
    window.go.desktop.App.WindowCaptureState.mockResolvedValue(undefined);
    tabs.configureTabManagerWorkspace({ confirm: async () => true });
    configureEditorWorkspace({
        getActiveTab: tabs.getActiveTab, recordTabCursor: tabs.recordTabCursor,
        recordTabEdit: tabs.recordTabEdit, recordTabContent: tabs.recordTabContent,
        closeTab: tabs.closeTab, markTabDirty: tabs.markTabDirty, openTab: tabs.openTab,
        replaceActiveFileTab: tabs.replaceActiveFileTab, saveFileSnapshot: tabs.saveFileSnapshot,
        switchTab: tabs.switchTab, confirm: async () => true,
        openFile: jest.fn(), openPDFPreview: jest.fn(), openRawTextPreview: jest.fn(),
        refreshFileTree: jest.fn(), saveActiveFile: jest.fn(),
    });
    const source = '# Heading\n\nThis is ordinary prose with space for many cursor positions.\n\n| A | B |\n| - | - |\n| x | y |\n\n$$\nx+y\n$$\n\n## Last\nMore prose.\n\n![One](one.png)';
    setState('openTabs', [{ id: 'note', path: 'Notes/note.md', title: 'note.md', type: 'file' }]);
    setState('activeTabId', 'note'); setState('showEditorBreadcrumbs', true);
    await initEditor();
    const view = createEditorView();
    await setEditorContent(source, 'note', { anchor: 15, head: 15 });
    tabs.initTabManager(); initWindowChrome(); initEditorBreadcrumb(); initOutlinePanel();
    openOutlinePanel();
    const previews = initEditorPreviewLaunchers({ getActiveTab: tabs.getActiveTab, getEditorDocumentTabId: () => 'note' });
    // Let initial layout/plugin work settle before counting a warmed interaction.
    await new Promise(resolve => setTimeout(resolve, 30));
    const presentation = jest.fn(), documentObserver = jest.fn();
    const stops = [subscribe('tabPresentation', presentation), subscribeEditorUpdates('writing', documentObserver)];
    const fullRead = jest.spyOn(view.state.doc, 'toString');
    const storage = jest.spyOn(localStorage, 'setItem');
    const nativeTitle = window.go.desktop.App.WindowSetTitle; nativeTitle.mockClear();
    const originalBreadcrumb = breadcrumb.firstChild;
    const originalTab = document.querySelector('#tab-strip .tab');
    const originalHeading = document.querySelector('.outline-item');
    editorDiagnostics.start();
    try {
        for (let index = 0; index < 100; index++) view.dispatch({ selection: { anchor: 15 + index % 30 } });
        await Promise.resolve();
        expect(presentation).not.toHaveBeenCalled();
        expect(documentObserver).not.toHaveBeenCalled();
        expect(storage).not.toHaveBeenCalled();
        expect(nativeTitle).not.toHaveBeenCalled();
        expect(fullRead).not.toHaveBeenCalled();
        expect(breadcrumb.firstChild).toBe(originalBreadcrumb);
        expect(document.querySelector('#tab-strip .tab')).toBe(originalTab);
        expect(buildSessionSnapshot(state).cursorStates.note).toEqual({ anchor: 24, head: 24 });
        const cursorTrace = editorDiagnostics.snapshot();
        expect(cursorTrace).toHaveLength(100);
        for (const record of cursorTrace) {
            expect(record.counters['notifications.tabPresentation'] || 0).toBe(0);
            expect(record.counters['document.materialize'] || 0).toBe(0);
            expect(record.counters['dom.outlineSelection'] || 0).toBe(0);
            expect(record.counters['decorations.images'] || 0).toBe(0);
            for (const name of ['markers', 'styles', 'code']) {
                expect(record.counters[`syntax.nodes.${name}`] || 0).toBe(0);
                expect(record.counters[`decorations.${name}`] || 0).toBe(0);
            }
            expect(Object.keys(record.counters).filter(key => key.startsWith('parse.'))).toEqual([]);
            expect(record.work.some(work => /previews|writing|activity|state:tabPresentation/u.test(work.consumer))).toBe(false);
            // Held-key navigation never schedules a session write.
            expect(record.work.some(work => work.consumer === 'session')).toBe(false);
            expect(record.counters['io.sessionWrite'] || 0).toBe(0);
        }
        fullRead.mockRestore();
        // The first edit must publish dirty state; following edits only update buffers.
        for (let index = 0; index < 5; index++) view.dispatch({ changes: { from: 20, insert: 'a' }, selection: { anchor: 21 } });
        expect(presentation).toHaveBeenCalledTimes(1);
        expect(tabs.getActiveTab().dirty).toBe(true);
        expect(documentObserver).toHaveBeenCalledTimes(5);
        expect(document.querySelector('.outline-item')).toBe(originalHeading);
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(readTabContent(tabs.getActiveTab())).toBe(view.state.doc.toString());
        tabs.updateTabTitle('note', 'Renamed.md');
        expect(presentation).toHaveBeenCalledTimes(2);
        expect(document.title).toContain('Renamed.md');
        // Cursor positions stay in memory; no write follows a pause in movement,
        // and the next session save (tab switch, blur or quit) carries the latest one.
        const writes = window.go.desktop.App.SaveSession.mock.calls.length;
        await new Promise(resolve => setTimeout(resolve, 380));
        expect(window.go.desktop.App.SaveSession.mock.calls.length).toBe(writes);
        await saveSession();
        const session = window.go.desktop.App.SaveSession.mock.calls.at(-1)[0];
        expect(session.cursorStates.note).toEqual({ anchor: 21, head: 21 });
        const edited = view.state.doc.toString();
        setState('openTabs', [...state.openTabs, { id: 'other', path: 'other.md', title: 'Other', type: 'file' }]);
        setState('activeTabId', 'other');
        await setEditorContent('Another buffer', 'other');
        tabs.updateTabsForMovedPath('Notes/note.md', 'Archive/note.md');
        setState('activeTabId', 'note');
        await setEditorContent(edited, 'note');
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(source);
        // Large assembled fixture catches uninstrumented vendor/root-node work.
        const large = '# Navigation\n\nFirst prose line.\nSecond prose line.\n\n'
            + '```js\nconst retained = true;\n```\n\n| A | B |\n| - | - |\n| x | y |\n\n![One](one.png)\n\n'
            + Array(1000).fill('## Another heading\n\n**Bold** text.\n\n').join('');
        // jsdom reports a zero-height scroller and exposes the entire document.
        // Inject only the viewport boundary; every installed update handler stays real.
        Object.defineProperty(view, 'visibleRanges', { configurable: true, get: () => [{ from: 0, to: 51 }] });
        await setEditorContent(large, 'note', { anchor: 17, head: 17 });
        ensureSyntaxTree(view.state, view.state.doc.length, 10000);
        view.dispatch({});
        await new Promise(resolve => setTimeout(resolve, 40));
        const tree = syntaxTree(view.state), iterate = tree.iterate.bind(tree);
        let visits = 0;
        const walk = jest.spyOn(tree, 'iterate').mockImplementation(options => iterate({
            ...options, enter: node => { visits++; return options.enter?.(node); },
        }));
        const slices = jest.spyOn(view.state.doc, 'sliceString');
        try {
            for (let index = 0; index < 20; index++) view.dispatch({ selection: { anchor: index % 2 ? 17 : 35 } });
            expect(visits).toBeLessThan(2000);
            expect(slices.mock.calls.some(([from, to]) => from === 0 && to === large.length)).toBe(false);
            expect(slices.mock.calls.every(([from, to]) => to - from < 5000)).toBe(true);
        } finally { walk.mockRestore(); slices.mockRestore(); }
        editorDiagnostics.clear();
        for (let index = 0; index < 20; index++) {
            view.dispatch({ changes: { from: 17, to: index % 2 ? 18 : 17, insert: index % 2 ? '' : 'x' },
                selection: { anchor: 17 } });
        }
        expect(view.state.doc.toString()).toBe(large);
        const typingTrace = editorDiagnostics.snapshot();
        expect(typingTrace).toHaveLength(20);
        for (const record of typingTrace) {
            for (const name of ['guides', 'images', 'tables', 'code']) {
                expect(record.counters[`parse.${name}`] || 0).toBe(0);
            }
            expect(record.counters['source.slices.code'] || 0).toBe(0);
        }
        delete view.visibleRanges;
    } finally {
        fullRead.mockRestore(); storage.mockRestore(); stops.forEach(stop => stop());
        editorDiagnostics.stop(); previews.destroy(); closeOutlinePanel({ restoreFocus: false });
        resetWindowChromeForTests(); view.destroy();
    }
}, 15000);

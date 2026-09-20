import { ensureSyntaxTree } from '@codemirror/language';
import { testUtils } from '../support/test_setup.js';
import { setState } from '../../../frontend/js/state.js';
import * as tabs from '../../../frontend/js/tabManager.js';
import { configureEditorWorkspace, initEditor, createEditorView, setEditorContent } from '../../../frontend/js/editor.js';
import { initWindowChrome, resetWindowChromeForTests } from '../../../frontend/js/windowChrome.js';
import { initEditorBreadcrumb } from '../../../frontend/js/editorBreadcrumb.js';
import { initEditorPreviewLaunchers } from '../../../frontend/js/editorPreviewLaunchers.js';
import { initOutlinePanel, openOutlinePanel, closeOutlinePanel } from '../../../frontend/js/outline.js';
import { editorDiagnostics } from '../../../frontend/js/editorDiagnostics.js';

import { Text } from '@codemirror/state';
import { readTabContent } from '../../../frontend/js/usecases/tabContent.js';
import { initKanban } from '../../../frontend/js/kanban.js';

beforeEach(() => jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] }));
afterEach(() => jest.useRealTimers());

test.each([10, 1000])('typing with %i headings avoids Outline DOM churn, eager snapshots, hidden Kanban parses and prose projection rebuilds', async count => {
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
    const source = '# Start\n\nOrdinary prose here.\n\n' + Array(count).fill('## Heading\n\nBody prose.\n\n').join('');
    setState('openTabs', [{ id: 'note', path: 'Notes/note.md', title: 'note.md', type: 'file' }]);
    setState('activeTabId', 'note'); setState('showEditorBreadcrumbs', true);
    await initEditor();
    const view = createEditorView();
    const mounted = setEditorContent(source, 'note', { anchor: 15, head: 15 });
    await jest.advanceTimersByTimeAsync(80);
    await mounted;
    tabs.initTabManager(); initWindowChrome(); initEditorBreadcrumb(); initOutlinePanel();
    Object.defineProperty(view, 'visibleRanges', { configurable: true, get: () => [{ from: 0, to: 28 }] });
    ensureSyntaxTree(view.state, view.state.doc.length, 10000);
    view.dispatch({});
    openOutlinePanel();
    const previews = initEditorPreviewLaunchers({ getActiveTab: tabs.getActiveTab, getEditorDocumentTabId: () => 'note' });

    initKanban();
    await jest.advanceTimersByTimeAsync(80);
    const originalQuery = Element.prototype.querySelector;
    let outlineQueries = 0;
    const query = jest.spyOn(Element.prototype, 'querySelector').mockImplementation(function(selector) {
        if (selector === '.outline-item-text' || selector === '.outline-item-type') outlineQueries++;
        return originalQuery.call(this, selector);
    });
    let fullReads = 0, fullReadCharacters = 0;
    const originalRead = Text.prototype.toString;
    const read = jest.spyOn(Text.prototype, 'toString').mockImplementation(function() {
        if (this.length >= source.length) { fullReads++; fullReadCharacters += this.length; }
        return originalRead.call(this);
    });
    let outlineWrites = 0;
    const observer = new MutationObserver(records => { outlineWrites += records.length; });
    observer.observe(document.querySelector('.outline-panel'), { subtree: true, attributes: true, attributeFilter: ['data-position'] });
    const snapshots = [];
    const changed = event => snapshots.push(event.detail);
    document.addEventListener('file-content-changed', changed);
    editorDiagnostics.start({limit:1000});
    try {
        // Advance the real scheduled callbacks at controlled frame intervals; CPU contention
        // must not turn this typing burst into a legitimate 160ms statistics pause.
        for (let i=0;i<10;i++) {
            view.dispatch({changes:{from:15,insert:'x'},selection:{anchor:16}});
            await jest.advanceTimersByTimeAsync(35);
        }
        await jest.advanceTimersByTimeAsync(65);
        const trace=editorDiagnostics.stop();
        const counters={};
        for(const item of trace) for(const [key,value] of Object.entries(item.counters||{})) counters[key]=(counters[key]||0)+value;
        expect(fullReads).toBe(0); expect(fullReadCharacters).toBe(0);
        expect(outlineQueries).toBe(0);
        expect(outlineWrites + observer.takeRecords().length).toBe(0);
        for (const name of ['parse.kanban', 'geometry.indentationStyle', 'decorations.listWidgets', 'decorations.extras']) {
            expect(counters[name] || 0).toBe(0);
        }
        expect(counters['notifications.tabBuffers']).toBe(10);
        expect(counters['notifications.tabPresentation']).toBe(1);
        expect(snapshots).toHaveLength(10);
        const expected = source.slice(0, 15) + 'x'.repeat(10) + source.slice(15);
        expect(readTabContent(tabs.getActiveTab())).toBe(expected);
        expect(snapshots.at(-1).content).toBe(expected);
        expect(snapshots.at(-1).readContent()).toBe(expected);
        expect(fullReads).toBe(1);
        expect(snapshots[0].content).toBe(source.slice(0, 15) + 'x' + source.slice(15));

    } finally {
        document.removeEventListener('file-content-changed', changed);
        read.mockRestore();query.mockRestore();observer.disconnect();
        previews.destroy();closeOutlinePanel({restoreFocus:false});resetWindowChromeForTests();
        delete view.visibleRanges;view.destroy();
    }
},20000);

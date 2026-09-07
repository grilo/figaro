import { writingTestPorts } from '../support/writingPorts.js';
import { initWritingLenses } from '../../../frontend/js/writingLenses.js';
import { claimRightPane, registerRightPaneMode, resetRightPaneModesForTests } from '../../../frontend/js/rightPaneCoordinator.js';
import { setRightSidebarSuppressed } from '../../../frontend/js/rightSidebarState.js';

jest.mock('../../../frontend/js/historyPanel.js', () => ({ updateRightSidebarEditorLayout: jest.fn() }));

describe('Writing lenses pane and Pure picker', () => {
    let controller;
    let tab;
    let mounted;
    let save;
    beforeEach(async () => {
        resetRightPaneModesForTests();
        document.body.innerHTML = `<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle" hidden></button><aside id="right-sidebar" inert aria-hidden="true"><span id="right-sidebar-title"></span><div id="right-sidebar-resizer"></div><div id="right-sidebar-content"></div></aside></div>`;
        tab = { id: 'memo', type: 'file', path: 'Memo.md', title: 'Memo.md' }; mounted = 'memo';
        save = jest.fn(async () => {});
        controller = initWritingLenses({ getActiveTab: () => tab, getEditorDocumentTabId: () => mounted, focusEditor: jest.fn(), loadPreferences: async () => ({ primary: 'direct', overlays: ['spelling'], language: 'en-US' }), savePreferences: save });
        await controller.ready;
    });
    afterEach(() => controller?.destroy());

    test('opens the shared pane, renders saved choices, and yields ownership to another pane', () => {
        document.getElementById('writing-lenses-toggle').click();
        const sidebar = document.getElementById('right-sidebar');
        const panel = document.getElementById('writing-lenses-panel');
        expect(sidebar.dataset.mode).toBe('writing-lenses');
        expect(sidebar.inert).toBe(false);
        expect(panel.querySelector('[role="combobox"]').getAttribute('aria-label')).toBe('Analysis language');
        expect(panel.querySelector('.writing-lenses-document')).toBeNull();
        expect(panel.querySelector('input[value="proofreading"]').indeterminate).toBe(true);
        expect(panel.querySelector('input[value="direct"]').disabled).toBe(false);
        expect(panel.textContent).toContain('Writing review');
        claimRightPane('raw-text-preview', sidebar);
        expect(panel.hidden).toBe(true);
        expect(document.getElementById('writing-lenses-toggle').getAttribute('aria-expanded')).toBe('false');
    });

    test('Pure picker changes the same preferences while the details pane remains suppressed', async () => {
        controller.toggle();
        const sidebar = document.getElementById('right-sidebar');
        document.getElementById('app').classList.add('pure-editing-chrome');
        setRightSidebarSuppressed(sidebar, true);
        document.dispatchEvent(new CustomEvent('figaro:pure-editing-chrome-changed'));
        document.getElementById('writing-lenses-quick-toggle').click();
        const popup = document.getElementById('writing-lenses-quick');
        expect(popup.hidden).toBe(false);
        expect(sidebar.inert).toBe(true);
        popup.querySelector('input[value="clarity"]').click();
        expect(save).toHaveBeenLastCalledWith('Memo.md', { language: 'en-US', lenses: ['spelling', 'plain', 'direct', 'readability'] });
        expect(document.querySelector('#writing-lenses-panel input[value="clarity"]').checked).toBe(true);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(popup.hidden).toBe(true);
        expect(document.activeElement.id).toBe('writing-lenses-quick-toggle');
        expect(sidebar.dataset.mode).toBe('writing-lenses');
    });

    test('Escape from the pane returns focus to its launcher without changing source', () => {
        controller.toggle();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('right-sidebar').getAttribute('aria-hidden')).toBe('true');
        expect(document.activeElement.id).toBe('writing-lenses-toggle');
        expect(save).not.toHaveBeenCalled();
    });

    test('Pure help is owned by the picker and consumes its first Escape without closing the picker', () => {
        document.getElementById('app').classList.add('pure-editing-chrome');
        controller.toggle();
        const popup = document.getElementById('writing-lenses-quick');
        const info = popup.querySelector('[data-lens-help="proofreading"]'); info.click();
        const help = document.getElementById('writing-lenses-quick-help');
        help.querySelector('p').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        expect(popup.hidden).toBe(false); expect(help.hidden).toBe(false);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(help.hidden).toBe(true); expect(popup.hidden).toBe(false);
        expect(document.activeElement).toBe(info);
        info.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(popup.hidden).toBe(true);
        expect(save).not.toHaveBeenCalled();
    });

    test('switching to Pure releases help portalled from the suppressed right pane', () => {
        controller.toggle();
        document.querySelector('#writing-lenses-panel .ui-disclosure-trigger').click();
        document.querySelector('#writing-lenses-panel [data-lens-help="proofreading"]').click();
        const help = document.getElementById('writing-lenses-pane-help');
        expect(help.hidden).toBe(false);
        document.getElementById('app').classList.add('pure-editing-chrome');
        document.dispatchEvent(new CustomEvent('figaro:pure-editing-chrome-changed'));
        expect(help.hidden).toBe(true);
        expect(help.dataset.floating).toBeUndefined();
    });

    test('closing an unrelated pane never exposes a stale Markdown owner', () => {
        registerRightPaneMode('history', () => {});
        mounted = 'other'; controller.refresh();
        expect(document.getElementById('writing-lenses-toggle').hidden).toBe(true);
        controller.toggle();
        expect(document.getElementById('right-sidebar').dataset.mode).toBeUndefined();
        mounted = 'memo'; tab = { ...tab, path: 'diagram.drawio.svg' }; controller.refresh();
        expect(document.getElementById('writing-lenses-toggle').hidden).toBe(true);
    });
});

test('writing pane applies one undoable CodeMirror phrase edit and refuses an outdated action', async () => {
    const { EditorState } = await import('@codemirror/state');
    const { EditorView } = await import('@codemirror/view');
    const { history, undo } = await import('@codemirror/commands');
    const { analyzeRetext } = await import('../../../frontend/vendored/writing/runtime.js');
    jest.useFakeTimers();
    resetRightPaneModesForTests();
    document.body.innerHTML = '<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle"></button><aside id="right-sidebar"><span id="right-sidebar-title"></span><div id="right-sidebar-content"></div></aside><div id="editor-test"></div></div>';
    const source = 'We utilize **ordinary words**.';
    const view = new EditorView({ parent: document.getElementById('editor-test'), state: EditorState.create({ doc: source, extensions: [history()] }) });
    const ports = { ...writingTestPorts, retext: { analyze: async text => analyzeRetext(text), cancel() {} }, vale: { analyze: async () => '{}', cancel() {} }, spelling: async () => [], ready: Promise.resolve(), destroy() {} };
    const controller = initWritingLenses({ getActiveTab: () => ({ id: 'memo', type: 'file', path: 'Memo.md' }), getEditorDocumentTabId: () => 'memo', getView: () => view, getSpellingPreferences: () => ({ enabled: false, language: 'es' }), focusEditor: () => view.focus(), loadPreferences: async () => ({ primary: 'plain', language: 'en-US' }), savePreferences: jest.fn(async () => {}), analysisPorts: ports });
    try {
        await controller.ready; controller.toggle(); await jest.advanceTimersByTimeAsync(500);
        document.querySelector('[aria-label="Replace “utilize” with “use”"]').click();
        expect(view.state.doc.toString()).toBe('We use **ordinary words**.');
        expect(undo(view)).toBe(true); expect(view.state.doc.toString()).toBe(source);
        controller.refresh(); await jest.advanceTimersByTimeAsync(500);
        const stale = document.querySelector('[aria-label="Replace “utilize” with “use”"]');
        view.dispatch({ changes: { from: 0, insert: 'Now ' } });
        stale.click();
        expect(view.state.doc.toString()).toBe('Now ' + source);
        expect(document.querySelector('.writing-results [role="status"]').textContent).toContain('needs refreshing');
    } finally { controller.destroy(); view.destroy(); jest.useRealTimers(); }
});

test('document lens choices stay with their note through late loads, failed saves, and switching back', async () => {
    resetRightPaneModesForTests();
    document.body.innerHTML = '<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle"></button><aside id="right-sidebar"><span id="right-sidebar-title"></span><div id="right-sidebar-content"></div></aside></div>';
    let tab = { id: 'first', type: 'file', path: 'First.md' }, finishFirst, failSave;
    const load = jest.fn(path => path === 'First.md' ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve({ lenses: ['repetition'], language: 'en-GB' }));
    const save = jest.fn(() => new Promise((_, reject) => { failSave = reject; }));
    const controller = initWritingLenses({ getActiveTab: () => tab, getEditorDocumentTabId: () => tab.id, loadPreferences: load, savePreferences: save });
    const input = lens => document.querySelector(`#writing-lenses-panel input[value="${lens}"]`);
    try {
        tab = { ...tab, id: 'second', path: 'Second.md' }; controller.refresh();
        for (let i = 0; i < 10; i++) await Promise.resolve();
        expect(input('proofreading').indeterminate).toBe(true);
        expect(input('proofreading').getAttribute('aria-description')).toContain('Enabled checks: Repetition.');
        finishFirst({ lenses: ['spelling'], language: 'en-US' }); await controller.ready;
        expect(input('proofreading').getAttribute('aria-description')).toContain('Enabled checks: Repetition.');
        tab = { ...tab, id: 'first', path: 'First.md' }; controller.refresh();
        expect(input('proofreading').indeterminate).toBe(true);
        expect(input('proofreading').getAttribute('aria-description')).toContain('Enabled checks: Spelling.');
        input('direct').click();
        expect(save).toHaveBeenCalledWith('First.md', { lenses: ['spelling', 'direct'], language: 'en-US' });
        tab = { ...tab, id: 'second', path: 'Second.md' }; controller.refresh();
        failSave(new Error('read only')); for (let i = 0; i < 10; i++) await Promise.resolve();
        expect(input('direct').checked).toBe(false);
        expect(document.querySelector('#writing-lenses-panel [data-retry]').hidden).toBe(true);
        tab = { ...tab, id: 'first', path: 'First.md' }; controller.refresh();
        expect(input('direct').checked).toBe(true);
        expect(document.querySelector('#writing-lenses-panel [data-retry]').hidden).toBe(false);
        expect(load.mock.calls.map(call => call[0])).toEqual(['First.md', 'Second.md']);
    } finally { controller.destroy(); }
});

test('Proofreading detects teh despite legacy Settings and frontmatter disablement, then stops when unchecked', async () => {
    const { EditorState } = await import('@codemirror/state');
    const { EditorView } = await import('@codemirror/view');
    const { writingSpellingObservations } = await import('../../../frontend/js/spellcheck.js');
    jest.useFakeTimers(); resetRightPaneModesForTests();
    document.body.innerHTML = '<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle"></button><aside id="right-sidebar"><span id="right-sidebar-title"></span><div id="right-sidebar-content"></div></aside></div>';
    const source = '---\nspellcheck: false\nwriting-language: none\n---\nteh';
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: source }) });
    const checker = { correct: word => word === 'the', spell: word => ({ correct: word === 'the' }), suggest: () => [] };
    const spelling = jest.fn((text, language) => writingSpellingObservations(text, language, async () => checker));
    const legacy = jest.fn(() => ({ enabled: false })), setSpelling = jest.fn();
    const controller = initWritingLenses({ getActiveTab: () => ({ id: 'memo', path: 'Memo.md', type: 'file' }), getEditorDocumentTabId: () => 'memo', getView: () => view,
        loadPreferences: async () => ({ lenses: ['spelling', 'repetition', 'consistency', 'grammar'], language: 'en-US' }), savePreferences: async () => {},
        getSpellingPreferences: legacy, setSpelling,
        analysisPorts: { ...writingTestPorts, retext: { cancel() {} }, vale: { cancel() {} }, spelling, destroy() {} } });
    try {
        await controller.ready; await jest.advanceTimersByTimeAsync(0);
        expect(legacy).not.toHaveBeenCalled();
        expect(document.querySelector('[aria-label="Replace “teh” with “the”"]')).not.toBeNull();
        expect(setSpelling).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true, language: 'en-US' }));
        document.querySelector('#writing-lenses-panel input[value="proofreading"]').click();
        await jest.advanceTimersByTimeAsync(0);
        expect(document.querySelector('[aria-label="Replace “teh” with “the”"]')).toBeNull();
        expect(setSpelling).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
        expect(view.state.doc.toString()).toBe(source);
    } finally { controller.destroy(); view.destroy(); jest.useRealTimers(); }
});

test('programmatic document replacement refreshes asynchronous lenses even without authored change ranges', async () => {
    const { EditorState } = await import('@codemirror/state');
    const { EditorView } = await import('@codemirror/view');
    const { analyzeWriting } = await import('../../../frontend/vendored/writing/runtime.js');
    jest.useFakeTimers(); resetRightPaneModesForTests();
    document.body.innerHTML = '<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle"></button><aside id="right-sidebar"><span id="right-sidebar-title"></span><div id="right-sidebar-content"></div></aside></div>';
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: 'Ordinary prose.' }) });
    const controller = initWritingLenses({ getActiveTab: () => ({ id: 'memo', type: 'file', path: 'Memo.md' }), getEditorDocumentTabId: () => 'memo', getView: () => view,
        loadPreferences: async () => ({ lenses: ['plain'], language: 'en-US' }), savePreferences: async () => {},
        analysisPorts: { ...writingTestPorts, retext: { analyze: analyzeWriting, cancel() {} }, vale: { analyze: async () => '{}', cancel() {} }, spelling: async () => [] } });
    try {
        await controller.ready; await jest.advanceTimersByTimeAsync(0);
        expect(document.querySelector('[aria-label="Replace “utilize” with “use”"]')).toBeNull();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'We utilize ordinary words.' } });
        document.dispatchEvent(new CustomEvent('editor-view-updated', { detail: { docChanged: true, documentTabId: 'memo' } }));
        await jest.advanceTimersByTimeAsync(600);
        expect(document.querySelector('[aria-label="Replace “utilize” with “use”"]')).not.toBeNull();
    } finally { controller.destroy(); view.destroy(); jest.useRealTimers(); }
});

test('renaming an open note retains its mounted lens choices and reversible review decisions', async () => {
    resetRightPaneModesForTests();
    document.body.innerHTML = '<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle"></button><aside id="right-sidebar"><span id="right-sidebar-title"></span><div id="right-sidebar-content"></div></aside></div>';
    let tab = { id: 'note', type: 'file', path: 'Folder/Note.md' };
    const decision = { id: 'accepted', type: 'acronym', language: 'en-US', acronym: 'XYZ' };
    const load = jest.fn(async () => ({ lenses: ['spelling'], language: 'en-US' }));
    const save = jest.fn(async () => {}), change = jest.fn(async () => []);
    const controller = initWritingLenses({ getActiveTab: () => tab, getEditorDocumentTabId: () => tab.id,
        loadPreferences: load, savePreferences: save, loadDecisions: async () => [decision], changeDecisions: change });
    try {
        await controller.ready;
        await controller.movePaths(async () => ({ success: true, old_path: 'Folder', path: 'Archive' }));
        tab = { ...tab, path: 'Archive/Note.md' }; controller.refresh();
        expect(load).toHaveBeenCalledTimes(1);
        const panel = document.getElementById('writing-lenses-panel');
        expect(panel.querySelector('input[value="proofreading"]').indeterminate).toBe(true);
        panel.querySelector('input[value="direct"]').click();
        expect(save).toHaveBeenCalledWith('Archive/Note.md', { language: 'en-US', lenses: ['spelling', 'direct'] });
        panel.querySelector('[aria-controls="writing-saved-decisions-0"]').click();
        panel.querySelector('[data-decision="accepted"]').click();
        for (let i = 0; i < 15; i++) await Promise.resolve();
        expect(change).toHaveBeenCalledWith('Archive/Note.md', { action: 'remove', id: 'accepted' });
    } finally { controller.destroy(); }
});

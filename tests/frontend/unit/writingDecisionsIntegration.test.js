import { writingTestPorts } from '../support/writingPorts.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { initWritingLenses } from '../../../frontend/js/writingLenses.js';
import { writingChangedRanges } from '../../../frontend/js/writingInline.js';
import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { resetRightPaneModesForTests } from '../../../frontend/js/rightPaneCoordinator.js';
jest.mock('../../../frontend/js/historyPanel.js', () => ({ updateRightSidebarEditorLayout: jest.fn() }));

function mount(store, source = 'We utilize words. The SLO is ready.', beforeSave = async () => {}, track = writingTestPorts.trackDecisions) {
    resetRightPaneModesForTests();
    document.body.innerHTML = '<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle"></button><aside id="right-sidebar"><span id="right-sidebar-title"></span><div id="right-sidebar-content"></div></aside></div>';
    let tab = { type: 'file', path: 'Memo.md', id: 'memo' };
    const view = new EditorView({ state: EditorState.create({ doc: source, extensions: [history(), EditorView.updateListener.of(update => {
        if (update.docChanged) document.dispatchEvent(new CustomEvent('editor-view-updated', { detail: {
            documentTabId: tab.id, writingChanges: writingChangedRanges(update.changes),
        } }));
    })] }), parent: document.body });
    const controller = initWritingLenses({ getActiveTab: () => tab, getEditorDocumentTabId: () => tab.id, getView: () => view,
        loadPreferences: async () => ({ lenses: ['plain'], language: 'en-US' }), savePreferences: async () => {},
        loadDecisions: async path => store.get(path) || [], changeDecisions: async (path, command) => {
            await beforeSave(command);
            const old = store.get(path) || [];
            const next = command.action === 'add' ? [...old, command.decision] : command.action === 'reanchor'
                ? old.map(item => command.anchors.find(anchor => anchor.id === item.id) || item) : old.filter(item => item.id !== command.id);
            store.set(path, JSON.parse(JSON.stringify(next))); return next;
        }, analysisPorts: { ...writingTestPorts, trackDecisions: track, ready: Promise.resolve(), destroy() {}, spelling: async () => [],
            retext: { analyze: source => analyzeWriting(source), cancel() {} },
            vale: { analyze: async (_, text) => ({ 'stdin.txt': [...text.matchAll(/\bSLO\b/g)].map(match => {
                const prefix = text.slice(0, match.index), col = Array.from(prefix.slice(prefix.lastIndexOf('\n') + 1)).length + 1;
                return { Check: 'Microsoft.Acronyms', Match: 'SLO', Line: prefix.split('\n').length, Span: [col, col + 2] };
            }) }), cancel() {} },
        } });
    return { controller, view, switchNote(path, source) {
        tab = { ...tab, id: path, path };
        if (source !== undefined) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
        else controller.refresh();
    }, destroy() { controller.destroy(); view.destroy(); } };
}
const pane = () => document.getElementById('writing-lenses-panel');
const button = label => pane().querySelector(`[aria-label="${label}"]`);
const settle = async () => { await jest.advanceTimersByTimeAsync(0); };

test('document review decisions persist through switch/recreation, cover new acronym occurrences, and restore individually', async () => {
    jest.useFakeTimers(); const store = new Map(); let app = mount(store);
    try {
        await app.controller.ready; await settle();
        button('Ignore Simpler word').click(); await settle();
        button('Accept “SLO” in this document').click(); await settle();
        expect(store.get('Memo.md')).toHaveLength(2); expect(pane().querySelectorAll('[data-finding]')).toHaveLength(0);
        app.switchNote('Other.md'); await settle(); expect(pane().querySelectorAll('[data-finding]')).toHaveLength(2);
        app.switchNote('Memo.md'); await settle(); expect(pane().querySelectorAll('[data-finding]')).toHaveLength(0);
        app.destroy(); app = mount(store, 'Earlier context.\n\nWe utilize words. The SLO is ready.\n\nThe SLO is useful.');
        await app.controller.ready; await settle(); expect(pane().querySelectorAll('[data-finding]')).toHaveLength(0);
        const toggle = pane().querySelector('.writing-decisions [aria-controls]'); toggle.click();
        const restores = pane().querySelectorAll('.writing-decisions [data-decision]');
        restores[1].click(); await settle(); expect(pane().querySelectorAll('[data-finding]')).toHaveLength(1);
        pane().querySelector('.writing-decisions [data-decision]').click(); await settle();
        expect(pane().querySelectorAll('[data-finding]')).toHaveLength(2); expect(store.get('Memo.md')).toEqual([]);
        expect(app.view.state.doc.toString()).toContain('We utilize words.');
    } finally { app.destroy(); jest.useRealTimers(); }
});

test('Apply to all identical occurrences is one CodeMirror undo/redo step and preserves protected source', async () => {
    jest.useFakeTimers(); const source = 'We utilize tools. We utilize words. `utilize` stays.';
    const app = mount(new Map(), source);
    try {
        await app.controller.ready; await settle();
        expect(pane().querySelectorAll('[data-finding]')).toHaveLength(1);
        button('Apply to all 2 occurrences in this document').click();
        expect(app.view.state.doc.toString()).toBe('We use tools. We use words. `utilize` stays.');
        expect(undo(app.view)).toBe(true); expect(app.view.state.doc.toString()).toBe(source);
        expect(redo(app.view)).toBe(true); expect(app.view.state.doc.toString()).toContain('We use tools. We use words.');
    } finally { app.destroy(); jest.useRealTimers(); }
});

test('Ignore tracks known edits on both sides, persists anchors, and stays effective after controller recreation', async () => {
    jest.useFakeTimers(); const store = new Map(); let app = mount(store, 'Before the draft. We utilize clear language for readers. After the draft.');
    try {
        await app.controller.ready; await settle(); button('Ignore Simpler word').click(); await settle();
        const replace = (old, text) => {
            const from = app.view.state.doc.toString().indexOf(old);
            app.view.dispatch({ changes: { from, to: from + old.length, insert: text } }); app.controller.refresh();
        };
        replace('clear', 'concise'); replace('Before the draft.', 'Following our discussion.');
        await jest.advanceTimersByTimeAsync(1200);
        const source = app.view.state.doc.toString();
        expect(store.get('Memo.md')[0].before).toContain('Following our discussion.');
        expect(store.get('Memo.md')[0].after).toContain('concise');
        app.destroy(); app = mount(store, source); await app.controller.ready; await settle();
        expect(pane().querySelectorAll('[data-finding]')).toHaveLength(0);
    } finally { app.destroy(); jest.useRealTimers(); }
});

test('deleting an ignored paragraph with similar surrounding text preserves advice on the surviving paragraph after restart', async () => {
    jest.useFakeTimers(); const store = new Map();
    const prefix = 'We are reviewing the ordinary draft carefully before we decide to ';
    const source = prefix + 'utilize clear words for readers.\n\n' + prefix + 'utilize concise words for readers.';
    let app = mount(store, source);
    try {
        await app.controller.ready; await settle(); button('Ignore Simpler word').click(); await settle();
        app.view.dispatch({ changes: { from: 0, to: source.indexOf('\n\n') + 2, insert: '' } });
        await jest.advanceTimersByTimeAsync(1200);
        expect(store.get('Memo.md')[0].exactOnly).toBe(true);
        const remaining = app.view.state.doc.toString();
        app.destroy(); app = mount(store, remaining); await app.controller.ready; await settle();
        expect(button('Ignore Simpler word')).not.toBeNull();
        pane().querySelector('.writing-decisions [aria-controls]').click();
        expect(pane().querySelector('.writing-decisions').textContent).toContain('Inactive:');
    } finally { app.destroy(); jest.useRealTimers(); }
});


test('Apply to all leaves wiki destinations and embeds intact while changing safe display aliases', async () => {
    jest.useFakeTimers();
    const source = 'We utilize prose. [[utilize]] [[utilize#heading]] [[utilize|our reference]] ![[utilize]] [[Target|utilize]] [utilize](utilize.md)';
    const app = mount(new Map(), source);
    try {
        await app.controller.ready; await settle();
        button('Apply to all 3 occurrences in this document').click();
        expect(app.view.state.doc.toString()).toBe('We use prose. [[utilize]] [[utilize#heading]] [[utilize|our reference]] ![[utilize]] [[Target|use]] [use](utilize.md)');
        expect(undo(app.view)).toBe(true); expect(app.view.state.doc.toString()).toBe(source);
    } finally { app.destroy(); jest.useRealTimers(); }
});

test.each(['edit around', 'delete'])('an Ignore pending storage follows actual editor changes: %s target', async action => {
    jest.useFakeTimers(); const store = new Map();
    const prefix = 'We are reviewing the ordinary draft carefully before we decide to ';
    const source = prefix + 'utilize clear words for readers.\n\n' + prefix + 'utilize concise words for readers.';
    let release;
    let app = mount(store, source, command => command.action === 'add' ? new Promise(resolve => { release = resolve; }) : Promise.resolve());
    try {
        await app.controller.ready; await settle(); button('Ignore Simpler word').click(); await settle();
        if (action === 'delete') app.view.dispatch({ changes: { from: 0, to: source.indexOf('\n\n') + 2, insert: '' } });
        else {
            const at = source.indexOf('clear');
            app.view.dispatch({ changes: [{ from: 0, to: 2, insert: 'They' }, { from: at, to: at + 5, insert: 'simple' }] });
        }
        release(); await jest.advanceTimersByTimeAsync(1200);
        if (action === 'delete') expect(store.get('Memo.md')[0].exactOnly).toBe(true);
        else expect(store.get('Memo.md')[0].after).toContain('simple');
        const remaining = app.view.state.doc.toString(); app.destroy(); app = mount(store, remaining);
        await app.controller.ready; await settle();
        expect(pane().querySelectorAll('[data-finding]')).toHaveLength(1);
        expect(pane().textContent).toContain('1 suggestion');
        pane().querySelector('.writing-decisions [aria-controls]').click();
        expect(pane().querySelector('.writing-decisions').textContent.includes('Inactive:')).toBe(action === 'delete');
    } finally { app.destroy(); jest.useRealTimers(); }
});


test('async saved-decision refresh keeps the current note context and says Analyzing while typing', async () => {
    jest.useFakeTimers(); let delay = false, finish;
    const store = new Map([['Memo.md', [{ id: 'accepted', type: 'acronym', acronym: 'SLO', language: 'en-US' }]]]);
    const track = input => delay ? new Promise(resolve => { finish = () => resolve(writingTestPorts.trackDecisions(input)); }) : writingTestPorts.trackDecisions(input);
    const app = mount(store, 'We utilize ordinary words.', async () => {}, track);
    try {
        await app.controller.ready; await settle(); delay = true;
        app.view.dispatch({ changes: { from: 0, insert: 'Today ' } }); await settle();
        expect(pane().querySelector('.writing-results [role=status]').textContent).toBe('Analyzing…');
        expect(button('Ignore Simpler word')).toBeNull();
        delay = false; finish(); await jest.advanceTimersByTimeAsync(600);
        expect(button('Ignore Simpler word')).not.toBeNull();
    } finally { app.destroy(); jest.useRealTimers(); }
});


test.each(['nearby', 'both sides'])('a new note mounted before controller selection retains Ignore through its first %s edit and recreation', async mode => {
    jest.useFakeTimers(); const store = new Map(), track = jest.fn(writingTestPorts.trackDecisions);
    let app = mount(store, 'Other note.', async () => {}, track);
    try {
        await app.controller.ready; await settle();
        const original = '# Short\n\nWe utilize green paper.\n';
        app.switchNote('Short.md', original); // Editor event arrives before queued refresh creates this controller.
        await jest.advanceTimersByTimeAsync(700);
        button('Ignore Simpler word').click(); await settle();
        const from = original.indexOf('green');
        const changes = [{ from, to: from + 5, insert: 'blue' }];
        if (mode === 'both sides') changes.unshift({ from: 0, to: 7, insert: '# Revised note' });
        app.view.dispatch({ changes }); await jest.advanceTimersByTimeAsync(1200);
        expect(track.mock.calls.some(([input]) => input.before === original && input.after === app.view.state.doc.toString())).toBe(true);
        expect(store.get('Short.md')[0].after).toContain('blue');
        expect(pane().querySelectorAll('[data-finding]')).toHaveLength(0);
        const source = app.view.state.doc.toString(); app.destroy();
        app = mount(store, 'Other note.'); await app.controller.ready; await settle();
        app.switchNote('Short.md', source); await jest.advanceTimersByTimeAsync(700);
        expect(pane().querySelectorAll('[data-finding]')).toHaveLength(0);
    } finally { app.destroy(); jest.useRealTimers(); }
});

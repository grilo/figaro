import { publishEditorUpdate } from '../frontend/js/editorUpdates.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import nativeCases from '../../fixtures/writing-grammar-native.json';
import { writingTestPorts } from '../support/writingPorts.js';
import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { initWritingLenses } from '../../../frontend/js/writingLenses.js';
import { writingChangedRanges } from '../../../frontend/js/writingInline.js';
import { resetRightPaneModesForTests } from '../../../frontend/js/rightPaneCoordinator.js';
jest.mock('../../../frontend/js/historyPanel.js', () => ({ updateRightSidebarEditorLayout: jest.fn() }));

const example = nativeCases.probes.find(f => f.name === 'emphasis');
async function mountGrammar(sample = example) {
    resetRightPaneModesForTests();
    document.body.innerHTML = '<div id="app"><button id="writing-lenses-toggle"></button><button id="writing-lenses-quick-toggle"></button><aside id="right-sidebar"><span id="right-sidebar-title"></span><div id="right-sidebar-content"></div></aside></div>';
    const tab = { id: 'grammar', type: 'file', path: 'Grammar.md' }, decisions = [];
    const view = new EditorView({ state: EditorState.create({ doc: sample.source, extensions: [history(), EditorView.updateListener.of(update => {
        if (update.docChanged) publishEditorUpdate({ documentTabId: tab.id, writingChanges: writingChangedRanges(update.changes) });
    })] }), parent: document.body });
    const controller = initWritingLenses({ getActiveTab: () => tab, getEditorDocumentTabId: () => tab.id, getView: () => view,
        loadPreferences: async () => ({ language: 'en-US', lenses: ['grammar'] }), savePreferences: async () => {},
        loadDecisions: async () => decisions, changeDecisions: async (_, command) => { if (command.action === 'add') decisions.push(command.decision); return decisions; },
        analysisPorts: { ...writingTestPorts, ready: Promise.resolve(), spelling: async () => [],
            retext: { analyze: analyzeWriting, cancel() {} }, vale: { analyze: async (_, text) => text === sample.projectionText ? sample.native : {}, cancel() {} } } });
    await controller.ready; await controller.toggle(); await jest.advanceTimersByTimeAsync(0);
    return { view, decisions, destroy() { controller.destroy(); view.destroy(); } };
}
const button = label => document.querySelector(`[aria-label="${label}"]`);
test('native grammar Apply preserves Markdown, is one Undo step, and supports occurrence Ignore', async () => {
    jest.useFakeTimers(); const app = await mountGrammar();
    try {
        const apply = button('Replace “go” with “goes”'); expect(apply).not.toBeNull(); apply.click();
        expect(app.view.state.doc.toString()).toBe('She **goes** to school.');
        expect(undo(app.view)).toBe(true); expect(app.view.state.doc.toString()).toBe(example.source);
        await jest.advanceTimersByTimeAsync(1200);
        button('Ignore Check pronoun and verb agreement').click(); await jest.advanceTimersByTimeAsync(0);
        expect(app.decisions).toHaveLength(1);
        expect(app.decisions[0].kind).toBe('grammar.figarogrammar.pronounverbagreement');
        expect(button('Replace “go” with “goes”')).toBeNull();
        expect(app.view.state.doc.toString()).toBe(example.source);
    } finally { app.destroy(); jest.useRealTimers(); }
});
test('a grammar Apply captured before editing cannot overwrite the changed source', async () => {
    jest.useFakeTimers(); const app = await mountGrammar();
    try {
        const stale = button('Replace “go” with “goes”'); expect(stale).not.toBeNull();
        app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: 'She goes somewhere else.' } });
        stale.click(); expect(app.view.state.doc.toString()).toBe('She goes somewhere else.');
        await jest.advanceTimersByTimeAsync(1200); expect(button('Replace “go” with “goes”')).toBeNull();
    } finally { app.destroy(); jest.useRealTimers(); }
});

test.each([
    ['homophone emphasis', "it's", 'its', "The dog wagged **its** tail."],
    ['noun phrase emphasis', 'an advice', 'a piece of advice', 'I asked for **a piece of advice**.'],
    ['compound subject emphasis', 'me', 'I', 'My mother and **I** went home.'],
    ['question emphasis', 'Do', 'Am', '**Am** I ready yet?'],
    ['broad phrase emphasis', 'bare in mind', 'bear in mind', 'Please **bear in mind** the deadline.'],
    ['broad verb emphasis', 'meet', 'meeting', '😀 We look forward to **meeting** you.'],
    ['usage preposition emphasis', 'in', 'at', 'She is good **at** swimming.'],
    ['usage noun agreement emphasis', 'is', 'are', 'The spare chairs **are** ready.'],
    ['usage countability emphasis', 'fewer', 'less', 'We need **less** time.'],
    ['usage word choice emphasis', 'safe', 'save', 'Please try to **save** the file.'],
    ['usage possessive emphasis', 'me', 'mine', 'She is a friend of **mine**.'],
    ['quality question emphasis', 'dose', 'does', '😀 What **does** the warning mean?'],
    ['quality preposition phrase emphasis', 'with regard to', 'of', 'Beware **of** the loose wires.'],
    ['quality adverb emphasis', 'seam', 'seem', 'We all **seem** to agree.'],
    ['quality software emphasis', 'a software', 'a piece of software', 'We need **a piece of software** for analysis.'],
    ['gap attraction emphasis', 'were', 'was', 'The small box of tools **was** waiting.'],
    ['gap participle emphasis', 'saw', 'seen', 'Maya had **seen** the missing tool.'],
    ['gap countable emphasis', 'amount of times', 'number of times', 'The **number of times** is limited to `10`.'],
    ['comma before emphasis', ',', ', ', 'Hello, *world*.'],
    ['policy9 object pronoun emphasis', 'and I', 'and me', 'Chen will send it to **Ana and me** on Friday.'],
    ['policy9 possessive time curly', 'years', 'year’s', 'It’s late: compare last year’s prices.'],
    ['policy9 list item comma existential', 'their', 'there', '- Bruno said the the migration is almost done, there is one table left.'],
])('%s applies a native expansion as one Markdown-preserving Undo step', async (name, actual, replacement, corrected) => {
    jest.useFakeTimers();
    const sample = nativeCases.probes.find(f => f.name === name);
    const app = await mountGrammar(sample);
    try {
        const apply = button(`Replace “${actual}” with “${replacement}”`);
        expect(apply).not.toBeNull(); apply.click();
        expect(app.view.state.doc.toString()).toBe(corrected);
        expect(undo(app.view)).toBe(true);
        expect(app.view.state.doc.toString()).toBe(sample.source);
    } finally { app.destroy(); jest.useRealTimers(); }
});

test.each([
    ['DoubleModal', 'Review adjacent modal verbs', 'doublemodal'],
    ['MultipleSequentialPronouns', 'Review adjacent pronouns', 'multiplesequentialpronouns'],
    ['IfWouldve', 'Review past conditional', 'ifwouldve'],
    ['CommaSplice', 'Review comma between clauses', 'commasplice'],
    ['CouldCareLess', 'Review “could care less”', 'couldcareless'],
])('%s offers rule-specific Ignore without a guessed correction', async (rule, title, kind) => {
    jest.useFakeTimers();
    const sample = nativeCases.fixtures.find(f => f.rule === `FigaroGrammar.${rule}`);
    const app = await mountGrammar(sample);
    try {
        expect(document.querySelector('[aria-label^="Replace “"]')).toBeNull();
        button(`Ignore ${title}`).click();
        await jest.advanceTimersByTimeAsync(0);
        expect(app.decisions).toHaveLength(1);
        expect(app.decisions[0].kind).toBe(`grammar.figarogrammar.${kind}`);
        expect(app.view.state.doc.toString()).toBe(sample.source);
    } finally { app.destroy(); jest.useRealTimers(); }
});

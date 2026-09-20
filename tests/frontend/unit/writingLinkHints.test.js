import { EditorState } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, activateHover } from '@codemirror/view';
import { indexWritingLinkFindings, writingLinkFindingsInRange, writingLinkLabel, writingLinkSegments } from '../../../frontend/js/core/writingLinkModel.js';
import { createWritingLinkHints } from '../../../frontend/js/writingLinkHints.js';
import { updateInlineWriting, writingInlineExtension, openInlineWriting } from '../../../frontend/js/writingInline.js';

test.each([
    ['[teh label](https://teh.test "teh")', 'teh label', 1],
    ['[[teh target|teh label]]', 'teh label', 13],
    ['[teh label][teh]', 'teh label', 1],
    ['[  teh label  ][teh]', 'teh label', 3],
    ['[teh label][]', 'teh label', 1],
    ['[teh label]', 'teh label', 1],
])('rendered writing hints map only the exact label: %s', (source, label, offset) => {
    const range = writingLinkLabel(source, label, 100);
    expect(range).toEqual({ from: 100 + offset, to: 100 + offset + label.length });
    const good = { from: range.from, to: range.from + 3, actual: 'teh' };
    const plan = writingLinkSegments(label, range, [good, { from: 102, to: 105, actual: 'target' }, { from: range.to + 2, to: range.to + 5, actual: 'teh' }]);
    expect(plan.findings).toEqual([good]); expect(plan.segments).toEqual([{ text: 'teh', marked: true }, { text: ' label', marked: false }]);
});

test('link labels reject unmatched display text and bare wiki destinations, and split overlapping Unicode ranges without changing text', () => {
    expect(writingLinkLabel('[[teh]]', 'teh', 0)).toBeNull();
    expect(writingLinkLabel('[teh](url)', 'different', 0)).toBeNull();
    const text = '😀 teh words', range = { from: 10, to: 22 };
    const plan = writingLinkSegments(text, range, [{ from: 13, to: 16, actual: 'teh' }, { from: 13, to: 22, actual: 'teh words' }]);
    expect(plan.segments.map(item => item.text).join('')).toBe(text);
    expect(plan.findings).toHaveLength(2);
});

class Link extends WidgetType {
    toDOM() { const a = document.createElement('a'); a.className = 'cm-link-widget'; a.textContent = 'teh label'; a.title = 'Destination title'; a.href = 'https://teh.test'; return a; }
}

test('indexed writing findings retain overlap and input order with bounded offscreen work', () => {
    let reads = 0;
    const findings = Array.from({ length: 1000 }, (_, i) => ({
        get from() { reads++; return i * 20; }, get to() { reads++; return i * 20 + 10; },
    }));
    const spanning = { from: 0, to: 10000 };
    findings.unshift(spanning);
    const index = indexWritingLinkFindings(findings); reads = 0;
    expect(writingLinkFindingsInRange(index, 100, 110)).toEqual([spanning, findings[6]]);
    expect(reads).toBeLessThan(20);
    expect(writingLinkFindingsInRange(index, 110, 120)).toEqual([spanning]);
    expect(writingLinkFindingsInRange(indexWritingLinkFindings([]), 0, 100)).toEqual([]);
});

test('writing link redraws reuse the viewport query, and a changed viewport finds formerly offscreen results', () => {
    let reads = 0;
    const findings = Array.from({ length: 1000 }, (_, i) => ({ id: String(i),
        get from() { reads++; return 100 + i * 20; }, get to() { reads++; return 103 + i * 20; }, actual: 'teh' }));
    const hints = createWritingLinkHints(() => findings);
    const view = new EditorView({ parent: document.body, state: EditorState.create({
        doc: 'Prose.\n\n' + 'x'.repeat(20100), extensions: [hints],
    }) });
    let viewport = { from: 0, to: 50 };
    Object.defineProperty(view, 'viewport', { configurable: true, get: () => viewport });
    try {
        const plugin = view.plugin(hints); plugin.docViewUpdate(view); reads = 0;
        for (let i = 0; i < 20; i++) plugin.docViewUpdate(view);
        expect(reads).toBe(0);
        viewport = { from: 100, to: 120 }; plugin.docViewUpdate(view);
        expect(plugin.visible.findings).toEqual([findings[0]]);
        expect(reads).toBeLessThan(10);
    } finally { delete view.viewport; view.destroy(); }
});
test('a concrete replaced link receives writing marks without rebuilding its widget, then restores ordinary tooltip information when checks clear', async () => {
    const source = 'Before\n\n[teh label](https://teh.test)\n\nAfter', from = source.indexOf('['), to = source.indexOf(')') + 1;
    const replacement = Decoration.set([Decoration.replace({ widget: new Link() }).range(from, to)]);
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: source,
        extensions: [EditorView.decorations.of(replacement), writingInlineExtension] }) });
    const current = { id: 'note', revision: 0, configuration: 'spelling', source };
    const finding = { id: 'word', lens: 'spelling', from: from + 1, to: from + 4, actual: 'teh', title: 'Check spelling', fixes: [] };
    const snapshot = { current, analyzed: current, groups: [{ findings: [finding] }] };
    const painted = () => new Promise(resolve => view.requestMeasure({ read: () => null, write: resolve }));
    try {
        const link = view.contentDOM.querySelector('a');
        updateInlineWriting(view, snapshot, {}); await painted();
        expect(link.querySelector('.cm-writing-range').textContent).toBe('teh');
        expect(link.textContent).toBe('teh label'); expect(link.hasAttribute('title')).toBe(false);
        const span = link.firstChild; updateInlineWriting(view, snapshot, {}); await painted(); expect(link.firstChild).toBe(span);
        updateInlineWriting(view, { ...snapshot, groups: [{ findings: [{ ...finding, message: 'Updated explanation' }] }] }, {});
        activateHover(view, from, 1);
        expect(view.dom.querySelector('.cm-writing-tooltip')).toBeNull(); // No stale choices before the next paint.
        await painted(); activateHover(view, from, 1);
        expect(view.dom.querySelector('.cm-writing-tooltip').textContent).toContain('Updated explanation');
        view.dispatch({ selection: { anchor: from + 2 } }); expect(openInlineWriting(view)).toBe(true);
        expect(view.dom.querySelector('.cm-writing-tooltip').textContent).toContain('Destination title — https://teh.test');
        updateInlineWriting(view, null, {}); await painted();
        expect(link.querySelector('.cm-writing-range')).toBeNull(); expect(link.dataset.uiTooltip).toBe('Destination title');
        expect(view.dom.querySelector('.cm-writing-tooltip')).toBeNull();
        expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
});

test('a sentence finding crossing a rendered link paints only its visible label while retaining the original finding identity', () => {
    const source = 'We [utilize](target) words.', from = source.indexOf('utilize');
    const finding = { id: 'sentence', from: 0, to: source.length, actual: 'We utilize words.', sourceText: source };
    expect(writingLinkSegments('utilize', { from, to: from + 7 }, [finding])).toEqual({ findings: [finding], segments: [{ text: 'utilize', marked: true }] });
});

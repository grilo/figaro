import { EditorState } from '@codemirror/state';
import { EditorView, hasHoverTooltips } from '@codemirror/view';
import { inlineWritingState, writingInlineExtension, updateInlineWriting, openInlineWriting } from '../../../frontend/js/writingInline.js';
import { inlineWritingFindings, writingFindingsAt, filterAcceptedSpelling, visibleWritingRanges, writingTooltipBounds } from '../../../frontend/js/core/writingInlineModel.js';
import { createWritingInlineView } from '../../../frontend/js/views/writingInlineView.js';
import { analyzeRetext, analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';

const source = 'We utilize words.';
const finding = { id: 'vocabulary', lens: 'plain', from: 3, to: 10, actual: 'utilize', title: 'Simpler word', message: 'Consider a familiar word.', fixes: [{ from: 3, to: 10, expected: 'utilize', replacement: 'use' }] };
const current = { id: 'memo', revision: 1, configuration: 'plain', source };
const snapshot = { current, analyzed: current, groups: [{ findings: [finding] }] };

test('review shortcut consumes an empty or refreshing result instead of handing off to the native emoji picker', () => {
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: 'Clear prose.', extensions: [writingInlineExtension] }) });
    try {
        expect(openInlineWriting(view)).toBe(true);
        expect(hasHoverTooltips(view.state)).toBe(false);
    } finally { view.destroy(); }
});

test('many inline alternatives show one comparison and two initial Apply choices, with the rest keyboard reachable', () => {
    const onApply = jest.fn(), onClose = jest.fn();
    const many = { ...finding, fixes: Array.from({ length: 7 }, (_, index) => ({ expected: 'utilize', replacement: `choice ${index}` })) };
    const dom = createWritingInlineView({ findings: [many], onApply, onIgnore() {}, onClose });
    document.body.replaceChildren(dom);
    const visible = () => [...dom.querySelectorAll('[aria-label^="Replace"]')].filter(button => !button.closest('[hidden]'));
    expect(visible()).toHaveLength(2);
    expect(dom.querySelectorAll('.writing-examples')).toHaveLength(1);
    expect(dom.querySelector('.writing-result-actions').compareDocumentPosition(dom.querySelector('.writing-examples')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const more = [...dom.querySelectorAll('button')].find(button => button.textContent === 'More alternatives (5)');
    more.click(); expect(visible()).toHaveLength(7); expect(document.activeElement).toBe(visible()[2]);
    document.activeElement.click(); expect(onApply).toHaveBeenCalledWith(finding.id, 2);
    more.click(); expect(visible()).toHaveLength(2);
    const ignore = dom.querySelector('[aria-label^="Ignore"]'); ignore.focus();
    ignore.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
});

test('textlint inline review offers a canonical name fix and advisory punctuation example through existing controls', async () => {
    const source = 'We use Javascript (draft.';
    const result = resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: { lenses: ['consistency', 'grammar'] } });
    const findings = result.groups.flatMap(group => group.findings), onApply = jest.fn();
    const dom = createWritingInlineView({ findings, onApply, onIgnore() {}, onClose() {} });
    document.body.replaceChildren(dom);
    const apply = dom.querySelector('[aria-label="Replace “Javascript” with “JavaScript”"]');
    expect(apply.classList.contains('ui-button')).toBe(true);
    apply.click(); expect(onApply).toHaveBeenCalledWith(findings[0].id, 0);
    expect(dom.textContent).toContain('Before: The draft (including the appendix is ready.');
    expect(dom.querySelector('[aria-label="Ignore Check paired punctuation in this document"]')).not.toBeNull();
    expect(dom.querySelectorAll('[aria-label^="Replace"]')).toHaveLength(1);
});

test('spacing and diacritics use the existing inline actions and show explicit space counts plus accented alternatives', () => {
    const source = 'Beyonce sang.  Two songs followed.';
    const result = resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses: ['consistency'] } });
    const findings = result.groups.flatMap(group => group.findings), onApply = jest.fn(), onIgnore = jest.fn();
    const dom = createWritingInlineView({ findings, onApply, onIgnore, onClose() {} });
    document.body.replaceChildren(dom);
    expect(dom.textContent).toContain('Suggested spacing (2 spaces → 1)');
    expect(dom.textContent).toContain('After: Beyoncé');
    dom.querySelector('[aria-label="Replace “Beyonce” with “Beyoncé”"]').click();
    expect(onApply).toHaveBeenCalledWith(findings[0].id, 0);
    dom.querySelector('[aria-label="Replace “sang.  Two” with “sang. Two”"]').click();
    expect(onApply).toHaveBeenCalledWith(findings[1].id, 0);
    dom.querySelector('[aria-label^="Ignore"]').click();
    expect(onIgnore).toHaveBeenCalledWith(findings[0].id);
    expect(dom.querySelector('[aria-label^="Add “"]')).toBeNull();
});

test('Inclusive language inline review exposes contextual alternatives and occurrence Ignore without dictionary actions', () => {
    const source = 'The chairman spoke.';
    const result = resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses: ['inclusive'] } });
    const findings = result.groups.flatMap(group => group.findings), onApply = jest.fn(), onIgnore = jest.fn();
    const dom = createWritingInlineView({ findings, onApply, onIgnore, onClose() {} });
    document.body.replaceChildren(dom);
    expect(dom.textContent).toContain('in some contexts');
    dom.querySelector('[aria-label="Replace “chairman” with “chairperson”"]').click();
    expect(onApply).toHaveBeenCalledWith(findings[0].id, findings[0].fixes.findIndex(fix => fix.replacement === 'chairperson'));
    dom.querySelector('[aria-label^="Ignore"]').click(); expect(onIgnore).toHaveBeenCalledWith(findings[0].id);
    expect(dom.querySelector('[aria-label^="Add “"]')).toBeNull();
});

test('inline writing marks only current visible source occurrences and exposes overlapping advice', () => {
    expect(inlineWritingFindings(snapshot)).toEqual([finding]);
    for (const changed of [{ id: 'other' }, { revision: 2 }, { configuration: 'direct' }]) {
        expect(inlineWritingFindings({ ...snapshot, current: { ...current, ...changed } })).toEqual([]);
    }
    expect(inlineWritingFindings({ ...snapshot, groups: [{ findings: [{ ...finding, actual: 'stale' }] }] })).toEqual([]);
    const overlap = { ...finding, id: 'another', from: 0, to: 10 };
    expect(writingFindingsAt([finding, overlap], 5)).toEqual([finding, overlap]);
    expect(writingFindingsAt([finding], 3, -1)).toEqual([]);
    expect(writingFindingsAt([finding], 10, 1)).toEqual([]);
    expect(filterAcceptedSpelling([{ actual: 'Figaro' }, { actual: 'teh' }], ['figaro'])).toEqual([{ actual: 'teh' }]);
    expect(visibleWritingRanges([finding], [{ from: 0, to: 5 }, { from: 8, to: 9 }, { from: 20, to: 30 }]))
        .toEqual([{ finding, from: 3, to: 5 }, { finding, from: 8, to: 9 }]);
});

test('inline writing underlines preserve source and selection, then clear synchronously on typing', () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({ parent, state: EditorState.create({ doc: source, extensions: [writingInlineExtension] }) });
    try {
        updateInlineWriting(view, snapshot, {});
        expect(parent.querySelector('.cm-writing-range').textContent).toBe('utilize');
        view.dispatch({ selection: { anchor: 4 } });
        expect(view.state.selection.main.head).toBe(4);
        expect(view.state.doc.toString()).toBe(source);
        expect(openInlineWriting(view)).toBe(true);
        expect(hasHoverTooltips(view.state)).toBe(true);
        parent.querySelector('.cm-writing-tooltip button').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(hasHoverTooltips(view.state)).toBe(false);
        expect(view.hasFocus).toBe(true);
        openInlineWriting(view);
        view.dispatch({ changes: { from: 0, insert: 'Now ' } });
        expect(hasHoverTooltips(view.state)).toBe(false);
        expect(view.state.field(inlineWritingState).findings).toEqual([]);
        expect(parent.querySelector('.cm-writing-range')).toBeNull();
    } finally { view.destroy(); parent.remove(); }
});

test('Readability underlines a full sentence across Markdown formatting with a general example and no Apply action', () => {
    const source = 'Before we publish the **final report**, we need to review the examples with the team, check every figure against the source material, explain the remaining limitations to our readers, and decide which recommendations should appear in the introduction.';
    const current = { id: 'memo', revision: 1, configuration: 'readability', source };
    const result = resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses: ['readability'] } });
    const snapshot = { ...result, current, analyzed: current };
    expect(inlineWritingFindings(snapshot)).toHaveLength(2);
    expect(inlineWritingFindings({ ...snapshot, current: { ...current, source: source.replace('report', 'letter') } })).toEqual([]);
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({ parent, state: EditorState.create({ doc: source, extensions: [writingInlineExtension] }) });
    try {
        updateInlineWriting(view, snapshot, {});
        expect(parent.querySelector('.cm-writing-range').textContent).toBe(source);
        view.dispatch({ selection: { anchor: source.indexOf('final') } });
        expect(openInlineWriting(view)).toBe(true);
        expect(parent.querySelector('.cm-writing-tooltip').textContent).toContain('where the idea changes');
        expect(parent.querySelector('.cm-writing-tooltip').textContent).toContain('ExampleBefore: We finished the draft');
        expect(parent.querySelector('.cm-writing-tooltip').textContent).toContain('Review sentence readability');
        expect(parent.querySelector('[aria-label^="Replace"]')).toBeNull();
        expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); parent.remove(); }
});

test('hover review offers applicable actions and keyboard exit without inventing passive replacements', async () => {
    const onApply = jest.fn(), onIgnore = jest.fn(), onClose = jest.fn();
    const dom = createWritingInlineView({ findings: [finding, { ...finding, id: 'passive', kind: 'syntax.passive', title: 'Possible passive construction', fixes: [] }], onApply, onIgnore, onClose });
    document.body.replaceChildren(dom);
    expect(dom.getAttribute('role')).toBe('dialog');
    expect(dom.querySelector('.writing-examples').textContent).toContain('Before: utilizeAfter: use');
    expect(dom.querySelectorAll('.writing-examples')[1].textContent).toContain('ExampleBefore: The report was written by Maya.After: Maya wrote the report.');
    const controls = dom.querySelectorAll('button');
    expect(controls).toHaveLength(3);
    controls[0].click(); expect(onApply).toHaveBeenCalledWith('vocabulary', 0);
    controls[1].click(); await Promise.resolve(); expect(onIgnore).toHaveBeenCalledWith('vocabulary');
    controls[0].focus(); controls[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    controls[2].focus(); controls[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    controls[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(3);
});

test('Add to dictionary is spelling-only and a failed save keeps a retryable visible error', async () => {
    let reject;
    const onAddWord = jest.fn(() => new Promise((_, fail) => { reject = fail; }));
    const spelling = { ...finding, lens: 'spelling', actual: 'Figaro' };
    const dom = createWritingInlineView({ findings: [finding, spelling], onAddWord, onClose() {} });
    document.body.replaceChildren(dom);
    const add = dom.querySelector('[aria-label^="Add “"]');
    expect(dom.querySelectorAll('[aria-label^="Add “"]')).toHaveLength(1);
    add.click(); expect(onAddWord).toHaveBeenCalledWith(spelling); expect(add.disabled).toBe(true);
    reject(new Error('Disk full')); await Promise.resolve(); await Promise.resolve();
    expect(add.disabled).toBe(false);
    expect(dom.querySelector('[role="status"]').textContent).toContain('Nothing was changed');
    expect(dom.querySelector('[role="status"]').classList.contains('ui-notice--warning')).toBe(true);
});

test('writing tooltip bounds keep examples and actions clear of the sidebar and viewport edges', () => {
    expect(writingTooltipBounds({ left: 300, top: 40, right: 900, bottom: 800 }, { width: 1200, height: 700 }))
        .toEqual({ left: 308, top: 48, right: 892, bottom: 692 });
    expect(writingTooltipBounds({ left: -100, top: -40, right: 1400, bottom: 1000 }, { width: 1200, height: 700 }))
        .toEqual({ left: 8, top: 8, right: 1192, bottom: 692 });
});

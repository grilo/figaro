import { markdownExtraLinePlan, markdownListIndentPlan, markdownListNodePlan, markdownQuoteIndentPlan } from '../../../frontend/js/core/markdownLineModel.js';

test('list plans retain source markers, nesting, checkbox state and tab-expanded prefixes', () => {
    expect(markdownListNodePlan({ kind: 'ListMark', text: '  -', from: 10, depth: 2 })).toEqual({ kind: 'bullet', from: 12, to: 13, label: '◦ ' });
    expect(markdownListNodePlan({ kind: 'ListMark', text: '12)', from: 10, ordered: true })).toEqual({ kind: 'bullet', from: 10, to: 13, label: '12) ' });
    expect(markdownListNodePlan({ kind: 'Task', text: '[X] Completed', from: 20 })).toEqual({ kind: 'task', from: 20, to: 23, checked: true });
    expect(markdownListNodePlan({ kind: 'Task', text: '[ ] Open', from: 20 }).checked).toBe(false);
    expect(markdownListNodePlan({ kind: 'Task', text: 'Ordinary', from: 0 })).toBeNull();
    expect(markdownListNodePlan({ kind: 'ListMark', text: 'Ordinary', from: 0 })).toBeNull();
    expect(markdownListIndentPlan('\t-\tBody', { tabSize: 4, trailingSourceWhitespace: '\t' })).toEqual({ columns: 8, sourceMarker: '-\t', separator: '\t', leading: '        ' });
    expect(markdownListIndentPlan('Ordinary prose')).toBeNull();
});

test('quote and extra plans separate source visibility from unchanged marks and callouts', () => {
    expect(markdownQuoteIndentPlan('  > > Quote')).toEqual({ text: '    ', columns: 4 });
    expect(markdownQuoteIndentPlan('  > > Quote', { markerVisible: true })).toEqual({ text: '  > > ', columns: 6 });
    expect(markdownQuoteIndentPlan('Ordinary')).toBeNull();
    expect(markdownExtraLinePlan('> [!NOTE] Title').callout).toBe('note');
    expect(markdownExtraLinePlan('> Continuation', 'note')).toMatchObject({ callout: 'note', quote: false });
    expect(markdownExtraLinePlan('Ordinary', 'note')).toMatchObject({ callout: '', quote: false });
    expect(markdownExtraLinePlan('> ==Emphasis== [^1]')).toEqual({ callout: '', quote: true, rule: false,
        marks: [{ from: 2, to: 14, className: 'cm-highlight' }, { from: 15, to: 19, className: 'cm-footnote' }] });
    for (const text of ['---', '***', '___']) expect(markdownExtraLinePlan(text).rule).toBe(true);
    expect(markdownExtraLinePlan('- - -').rule).toBe(false);
});

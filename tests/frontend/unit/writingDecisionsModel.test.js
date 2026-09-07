import { createWritingDecision, writingDecisionRange, applyWritingDecisions, remapWritingDecision } from '../../../frontend/js/core/writingDecisionsModel.js';

const source = 'Before the draft. We utilize words for readers. After the draft.';
const finding = { kind: 'lexicon.complex-word', title: 'Simpler word', actual: 'utilize', from: source.indexOf('utilize'), to: source.indexOf('utilize') + 7 };
const ignore = () => createWritingDecision(finding, source, 'en-US', 'occurrence', 'one');

test('saved occurrence decisions survive serialization and edits elsewhere without hiding another occurrence', () => {
    const decision = JSON.parse(JSON.stringify(ignore()));
    const moved = 'A new paragraph.\n\n' + source + '\n\nWe utilize other words.';
    const range = writingDecisionRange(moved, decision);
    expect(moved.slice(range.from, range.to)).toBe('utilize');
    const findings = [{ ...finding, ...range }, { ...finding, from: moved.lastIndexOf('utilize'), to: moved.lastIndexOf('utilize') + 7 }];
    applyWritingDecisions(findings, [decision], moved, 'en-US');
    expect(findings[0].suppressed).toBe('Occurrence ignored for this document');
    expect(findings[1].suppressed).toBeUndefined();
    const otherLanguage = [{ ...finding }];
    applyWritingDecisions(otherLanguage, [decision], source, 'en-GB'); expect(otherLanguage[0].suppressed).toBeUndefined();
});

test('changed or duplicated context fails open instead of silently ignoring the wrong suggestion', () => {
    expect(writingDecisionRange(source.replace('utilize', 'use'), ignore())).toBeNull();
    expect(writingDecisionRange(source + '\n\n' + source, ignore())).toBeNull();
    const repeated = 'x'.repeat(70) + 'utilize' + 'y'.repeat(70);
    expect(() => createWritingDecision({ ...finding, from: 70, to: 77 }, repeated + repeated, 'en-US', 'occurrence', 'one')).toThrow('identical context');
    expect(() => createWritingDecision({ ...finding, actual: 'old' }, source, 'en-US', 'occurrence', 'one')).toThrow('safely');
});

test('acronym acceptance suppresses all future same-language acronym reports but keeps other advice', () => {
    const f = { kind: 'clarity.undefined-acronym', actual: 'SLO' };
    const decision = createWritingDecision(f, '', 'en-US', 'acronym', 'acronym');
    const findings = [{ ...f }, { ...f, from: 20 }, { kind: 'style.redundant-acronym', actual: 'SLO' }, { ...f, actual: 'XYZ' }];
    applyWritingDecisions(findings, [decision], '', 'en-US');
    expect(findings.map(item => Boolean(item.suppressed))).toEqual([true, true, false, false]);
    const restored = [{ ...f }]; applyWritingDecisions(restored, [], '', 'en-US'); expect(restored[0].suppressed).toBeUndefined();
    expect(() => createWritingDecision({ kind: 'grammar.spelling', actual: 'SLO' }, '', 'en-US', 'acronym', 'one')).toThrow('undefined acronym');
});

test('empty context fields omitted by the native bridge and Unicode context stay safe after reopening', () => {
    const f = { ...finding, actual: 'teh', from: 0, to: 3 };
    expect(writingDecisionRange('teh', { type: 'occurrence', text: 'teh' })).toEqual({ from: 0, to: 3 });
    const text = '😀'.repeat(40) + 'utilize' + '😀'.repeat(40);
    const d = createWritingDecision({ ...finding, from: 80, to: 87 }, text, 'en-US', 'occurrence', 'one');
    expect(writingDecisionRange(text, JSON.parse(JSON.stringify(d)))).toEqual({ from: 80, to: 87 });
    expect(createWritingDecision(f, 'teh', 'en-US', 'occurrence', 'one').text).toBe('teh');
});

test('a distinctive surviving context keeps Ignore after a nearby edit but refuses ambiguous or changed targets', () => {
    const edited = source.replace('words', 'concise words');
    expect(writingDecisionRange(edited, JSON.parse(JSON.stringify(ignore())))).toEqual({ from: finding.from, to: finding.to });
    expect(writingDecisionRange(edited + '\n\n' + edited, ignore())).toBeNull();
    expect(writingDecisionRange(source.replace('utilize', 'use') + ' We utilize other words.', ignore())).toBeNull();
    expect(writingDecisionRange('Elsewhere we utilize words.', ignore())).toBeNull();
});

test('known edits reanchor an unchanged target and serialized anchors survive editing both surrounding sides', () => {
    const first = source.replace('words', 'concise words');
    const second = first.replace('Before the draft.', 'After our review.');
    const d = remapWritingDecision(remapWritingDecision(ignore(), source, first), first, second);
    const reopened = JSON.parse(JSON.stringify(d));
    const range = writingDecisionRange(second, reopened);
    expect(second.slice(range.from, range.to)).toBe('utilize');
    expect(reopened.before).toContain('After our review.');
    expect(remapWritingDecision(ignore(), source, source.replace('utilize', 'use'))).toEqual({ ...ignore(), exactOnly: true });
});

test('editing or deleting an ignored target never relocates Ignore to another word with a shared context side', () => {
    const prefix = 'We are reviewing the ordinary draft carefully before we decide to ';
    const original = prefix + 'utilize clear words for readers.\n\n' + prefix + 'utilize concise words for readers.';
    const from = original.indexOf('utilize');
    const decision = createWritingDecision({ ...finding, from, to: from + 7 }, original, 'en-US', 'occurrence', 'target');
    const replaced = original.replace('utilize', 'use');
    expect(writingDecisionRange(replaced, decision)).toBeNull();
    const removed = original.slice(original.indexOf('\n\n') + 2);
    const mapped = remapWritingDecision(decision, original, removed);
    expect(mapped.exactOnly).toBe(true);
    expect(writingDecisionRange(removed, JSON.parse(JSON.stringify(mapped)))).toBeNull();
    // Undo restores the precise original context and can reactivate the decision.
    expect(writingDecisionRange(original, mapped)).toEqual({ from, to: from + 7 });
});

test('1000 inactive decisions search missing context once instead of rescanning every repeated word', () => {
    const source = 'We utilize ordinary words while reviewing the current draft carefully. '.repeat(500);
    const records = Array.from({ length: 1000 }, (_, index) => ({ type: 'occurrence', text: 'utilize', before: `Missing previous context ${index} `, after: '' }));
    const search = jest.spyOn(String.prototype, 'indexOf');
    let calls;
    try {
        for (const record of records) expect(writingDecisionRange(source, record)).toBeNull();
        calls = search.mock.calls.filter(args => args[0] === 'utilize' || String(args[0]).startsWith('Missing previous context')).length;
    } finally { search.mockRestore(); }
    expect(calls).toBeLessThanOrEqual(3000);
});

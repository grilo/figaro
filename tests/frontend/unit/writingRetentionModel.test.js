import { canRetainWritingResults, writingEditChangesStructure, retainWritingFindings } from '../../../frontend/js/core/writingRetentionModel.js';

const local = { kind: 'lexicon.complex-word', from: 20, to: 27 };
const edit = { changes: [{ from: 2, to: 4, insertedLength: 5 }], paragraphs: [{ from: 0, to: 12 }] };

test('retained writing marks shift unaffected paragraphs and invalidate touched or document-dependent findings', () => {
    const findings = [local, { ...local, from: 3, to: 10 }, { ...local, kind: 'style.quotation' },
        { ...local, kind: 'clarity.undefined-acronym' }, { ...local, members: [{ kind: 'style.consistency' }] }];
    expect(retainWritingFindings(findings, edit)).toEqual([{ ...local, from: 23, to: 30 }]);
    expect(retainWritingFindings(findings, { ...edit, structural: true })).toEqual([]);
    expect(findings[0]).toEqual(local);
});

test('retained writing ranges follow multiple edits, deletions and paragraph moves without authorizing fixes', () => {
    expect(retainWritingFindings([local], { changes: [{ from: 0, to: 2, insertedLength: 0 }, { from: 9, to: 9, insertedLength: 4 }], paragraphs: [] }))
        .toEqual([{ ...local, from: 22, to: 29 }]);
    expect(retainWritingFindings([local], { changes: [], paragraphs: [{ from: 15, to: 40 }] })).toEqual([]);
});

test.each(['```', '[target]: /new', '---', '$', '*', '<!--', '~~~'])('structural edit %s invalidates retained writing marks', inserted => {
    expect(writingEditChangesStructure({ removed: '', inserted, beforeLine: '', afterLine: inserted })).toBe(true);
});

test('ordinary text and line insertion can preserve other paragraphs, while reference-definition edits cannot', () => {
    expect(writingEditChangesStructure({ removed: '', inserted: '\n', beforeLine: 'ordinary', afterLine: 'ordinary\n' })).toBe(false);
    expect(writingEditChangesStructure({ removed: 'old', inserted: 'new', beforeLine: '[ref]: old', afterLine: '[ref]: new' })).toBe(true);
    const previous = { id: 'note', language: 'en-US', preferences: { lenses: ['plain'] }, spelling: {} };
    expect(canRetainWritingResults(previous, { ...previous, revision: 2 })).toBe(true);
    for (const change of [{ id: 'other' }, { language: 'none' }, { preferences: { lenses: [] } }, { spelling: { words: ['new'] } }]) {
        expect(canRetainWritingResults(previous, { ...previous, ...change })).toBe(false);
    }
});

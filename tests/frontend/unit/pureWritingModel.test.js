import {
    adaptiveTypographyPlan,
    normalizePureFocusScope,
    pureFocusRange,
    shouldRunTypewriterScroll,
    typewriterMotionPlan,
    typewriterScrollTarget,
} from '../frontend/js/core/pureWritingModel.js';

describe('Pure writing model', () => {
    test('normalizes the three deliberately small focus choices', () => {
        expect(normalizePureFocusScope('off')).toBe('off');
        expect(normalizePureFocusScope('phrase')).toBe('phrase');
        expect(normalizePureFocusScope('paragraph')).toBe('paragraph');
        expect(normalizePureFocusScope('sentence')).toBe('off');
    });

    test('keeps a whole Markdown block or the phrase containing the caret', () => {
        const source = 'First phrase. Second phrase here.';
        const blockRange = { from: 0, to: source.length };
        const phrases = [
            { from: 0, to: 14 },
            { from: 14, to: source.length },
        ];

        expect(pureFocusRange({
            source, position: 22, scope: 'paragraph', blockRange, phraseRanges: phrases,
        })).toEqual(blockRange);
        expect(pureFocusRange({
            source, position: 22, scope: 'phrase', blockRange, phraseRanges: phrases,
        })).toEqual(phrases[1]);
        expect(pureFocusRange({ source, position: 22, scope: 'off', blockRange })).toBeNull();
    });

    test('runs typewriter motion only for authored typing transactions in Pure mode', () => {
        const eligible = {
            pureActive: true,
            enabled: true,
            docChanged: true,
            selectionEmpty: true,
            pointerSelecting: false,
            searchOpen: false,
        };
        expect(shouldRunTypewriterScroll({ ...eligible, userEvents: ['input.type'] })).toBe(true);
        expect(shouldRunTypewriterScroll({ ...eligible, userEvents: ['input.type.compose'] })).toBe(true);
        expect(shouldRunTypewriterScroll({ ...eligible, userEvents: ['input.paste'] })).toBe(true);
        expect(shouldRunTypewriterScroll({ ...eligible, userEvents: ['delete.backward'] })).toBe(true);
        expect(shouldRunTypewriterScroll({ ...eligible, userEvents: ['input.task-checkbox'] })).toBe(false);
        expect(shouldRunTypewriterScroll({ ...eligible, userEvents: ['select.pointer'] })).toBe(false);
        expect(shouldRunTypewriterScroll({ ...eligible, pointerSelecting: true, userEvents: ['input.type'] })).toBe(false);
        expect(shouldRunTypewriterScroll({ ...eligible, searchOpen: true, userEvents: ['input.type'] })).toBe(false);
        expect(shouldRunTypewriterScroll({ ...eligible, pureActive: false, userEvents: ['input.type'] })).toBe(false);
    });

    test('targets the 42 percent caret line and clamps to the scroll range', () => {
        expect(typewriterScrollTarget({
            scrollTop: 200,
            scrollHeight: 1600,
            clientHeight: 500,
            caretTop: 410,
            viewportTop: 100,
        })).toBe(300);
        expect(typewriterScrollTarget({
            scrollTop: 0,
            scrollHeight: 500,
            clientHeight: 500,
            caretTop: 20,
            viewportTop: 0,
        })).toBe(0);
    });

    test('uses short distance-aware motion and removes it for reduced motion', () => {
        expect(typewriterMotionPlan({ from: 100, to: 150 }).duration).toBeGreaterThanOrEqual(120);
        expect(typewriterMotionPlan({ from: 100, to: 900 }).duration).toBe(220);
        expect(typewriterMotionPlan({ from: 100, to: 150, reducedMotion: true }))
            .toEqual({ from: 100, to: 150, duration: 0 });
    });

    test('keeps adaptive typography in three hysteretic bands', () => {
        expect(adaptiveTypographyPlan({ pureActive: true, enabled: true, viewportWidth: 650 }))
            .toEqual({ tier: 'compact', scale: 0.94 });
        expect(adaptiveTypographyPlan({ pureActive: true, enabled: true, viewportWidth: 1200 }))
            .toEqual({ tier: 'spacious', scale: 1.08 });
        expect(adaptiveTypographyPlan({
            pureActive: true, enabled: true, viewportWidth: 1100, previousTier: 'spacious',
        })).toEqual({ tier: 'spacious', scale: 1.08 });
        expect(adaptiveTypographyPlan({
            pureActive: false, enabled: true, viewportWidth: 1200, previousTier: 'spacious',
        })).toEqual({ tier: 'regular', scale: 1 });
    });
});


test('focus normalization accepts a document length without materializing its source', () => {
    expect(pureFocusRange({ documentLength: 100000, scope: 'paragraph', position: 60000,
        blockRange: { from: 59980, to: 60100 } })).toEqual({ from: 59980, to: 60100 });
    expect(pureFocusRange({ documentLength: 20, scope: 'paragraph', position: 18,
        blockRange: { from: 10, to: 99 } })).toEqual({ from: 10, to: 20 });
});


import { preparePurePhraseRanges } from '../../../frontend/js/core/pureWritingModel.js';
test('indexed Pure phrases preserve inclusive boundaries, gaps, clamping and unusual input order', () => {
    for (const phraseRanges of [[{ from: 0, to: 10 }, { from: 10, to: 20 }, { from: 25, to: 30 }],
        [{ from: 9, to: 30 }, { from: 0, to: 20 }], [{ from: -2, to: 12 }, { from: 12, to: 99 }]]) {
        const phraseIndex = preparePurePhraseRanges(phraseRanges, 30);
        for (const position of [-1, 0, 9, 10, 12, 20, 23, 25, 30, 99]) {
            const expected = phraseRanges.map(range => ({ from: Math.max(0, range.from), to: Math.min(30, range.to) }))
                .find(range => range.from <= Math.max(0, Math.min(30, position)) && Math.max(0, Math.min(30, position)) <= range.to)
                || { from: 0, to: 30 };
            expect(pureFocusRange({ documentLength: 30, scope: 'phrase', position, phraseIndex })).toEqual(expected);
        }
    }
});

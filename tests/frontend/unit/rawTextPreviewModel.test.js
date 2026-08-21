import {
    rawPreviewScrollTopForAnchor,
    rawPreviewScrollTopForProgress,
} from '../frontend/js/core/rawTextPreviewModel.js';

describe('raw text preview scroll model', () => {
    test('keeps the matching source anchor at the shared viewport marker', () => {
        expect(rawPreviewScrollTopForAnchor({
            anchorViewportTop: 500,
            stageViewportTop: 50,
            currentScrollTop: 100,
            scrollHeight: 1000,
            clientHeight: 200,
            markerRatio: 0.3,
        })).toBe(490);
    });

    test('clamps anchors and source-progress fallback to the raw document range', () => {
        expect(rawPreviewScrollTopForAnchor({
            anchorViewportTop: -200,
            stageViewportTop: 50,
            currentScrollTop: 0,
            scrollHeight: 1000,
            clientHeight: 200,
        })).toBe(0);
        expect(rawPreviewScrollTopForAnchor({
            anchorViewportTop: 2000,
            stageViewportTop: 0,
            currentScrollTop: 0,
            scrollHeight: 1000,
            clientHeight: 200,
        })).toBe(800);
        expect(rawPreviewScrollTopForProgress(600, 1000, 1000, 200)).toBe(480);
        expect(rawPreviewScrollTopForProgress(20, 0, 1000, 200)).toBe(0);
    });
});

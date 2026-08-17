import {
    isVerticalMotionKey,
    unexpectedVerticalMotionTarget,
    verticalBoundaryTarget,
    verticalViewportBoundaryTarget,
    verticalViewportScrollDelta,
} from '../frontend/js/core/verticalCursorModel.js';

describe('vertical cursor boundary policy', () => {
    test('recognizes regular and Vim visual-row motions without treating insert-mode text as navigation', () => {
        expect(isVerticalMotionKey({ key: 'ArrowDown' })).toBe(true);
        expect(isVerticalMotionKey({ key: 'ArrowUp', shiftKey: true })).toBe(true);
        expect(isVerticalMotionKey({ key: 'PageDown' })).toBe(true);
        expect(isVerticalMotionKey({ key: 'PageUp' })).toBe(true);
        expect(isVerticalMotionKey({ key: 'n', ctrlKey: true })).toBe(true);
        expect(isVerticalMotionKey({ key: 'j', vimActive: true })).toBe(true);
        expect(isVerticalMotionKey({ key: 'k', vimActive: true, vimInsertMode: true })).toBe(false);
        expect(isVerticalMotionKey({ key: 'j' })).toBe(false);
        expect(isVerticalMotionKey({ key: 'ArrowDown', altKey: true })).toBe(false);
    });

    test('consumes further movement at both absolute document edges', () => {
        expect(verticalBoundaryTarget({
            beforePosition: 42,
            afterPosition: 42,
            sourceLineNumber: 5,
            movedLineNumber: 5,
            sourceLineFrom: 36,
            sourceLineTo: 42,
            totalLines: 5,
            documentLength: 42,
            forward: true,
        })).toBe(42);
        expect(verticalBoundaryTarget({
            beforePosition: 0,
            afterPosition: 0,
            sourceLineNumber: 1,
            movedLineNumber: 1,
            sourceLineFrom: 0,
            sourceLineTo: 5,
            totalLines: 5,
            documentLength: 42,
            forward: false,
        })).toBe(0);
    });

    test('clamps an opposite-direction wrap to the requested source-line edge', () => {
        expect(verticalBoundaryTarget({
            beforePosition: 40,
            afterPosition: 2,
            sourceLineNumber: 5,
            movedLineNumber: 1,
            sourceLineFrom: 36,
            sourceLineTo: 42,
            totalLines: 5,
            documentLength: 42,
            forward: true,
        })).toBe(42);
        expect(verticalBoundaryTarget({
            beforePosition: 2,
            afterPosition: 40,
            sourceLineNumber: 1,
            movedLineNumber: 5,
            sourceLineFrom: 0,
            sourceLineTo: 5,
            totalLines: 5,
            documentLength: 42,
            forward: false,
        })).toBe(0);
    });

    test('leaves ordinary and same-direction vertical movement unchanged', () => {
        expect(verticalBoundaryTarget({
            beforePosition: 10,
            afterPosition: 18,
            sourceLineNumber: 2,
            movedLineNumber: 3,
            sourceLineFrom: 8,
            sourceLineTo: 14,
            totalLines: 5,
            documentLength: 42,
            forward: true,
        })).toBeNull();
        expect(verticalBoundaryTarget({
            beforePosition: 18,
            afterPosition: 10,
            sourceLineNumber: 3,
            movedLineNumber: 2,
            sourceLineFrom: 15,
            sourceLineTo: 21,
            totalLines: 5,
            documentLength: 42,
            forward: false,
        })).toBeNull();
    });

    test('repairs a stalled or multi-line engine result to the adjacent source line', () => {
        const common = {
            sourceLineNumber: 3,
            sourceLineColumn: 4,
            totalLines: 5,
            adjacentLineFrom: 20,
            adjacentLineTo: 27,
        };

        expect(unexpectedVerticalMotionTarget({
            ...common,
            beforePosition: 16,
            afterPosition: 16,
            movedLineNumber: 3,
            forward: true,
        })).toBe(24);
        expect(unexpectedVerticalMotionTarget({
            ...common,
            beforePosition: 16,
            afterPosition: 31,
            movedLineNumber: 5,
            forward: true,
        })).toBe(24);
        expect(unexpectedVerticalMotionTarget({
            ...common,
            beforePosition: 16,
            afterPosition: 22,
            movedLineNumber: 4,
            forward: true,
        })).toBeNull();
    });

    test('clamps wheel gestures that reach either viewport boundary', () => {
        expect(verticalViewportBoundaryTarget({
            scrollTop: 880,
            scrollHeight: 1000,
            clientHeight: 100,
            deltaY: 2,
            deltaMode: 1,
            lineHeight: 20,
        })).toBe(900);
        expect(verticalViewportBoundaryTarget({
            scrollTop: 30,
            scrollHeight: 1000,
            clientHeight: 100,
            deltaY: -1,
            deltaMode: 2,
        })).toBe(0);
    });

    test('leaves wheel gestures inside the viewport range unchanged', () => {
        expect(verticalViewportBoundaryTarget({
            scrollTop: 400,
            scrollHeight: 1000,
            clientHeight: 100,
            deltaY: 40,
        })).toBeNull();
        expect(verticalViewportBoundaryTarget({
            scrollTop: 400,
            scrollHeight: 1000,
            clientHeight: 100,
            deltaY: -40,
        })).toBeNull();
    });

    test('returns only the correction needed to keep a cursor inside its usable viewport', () => {
        expect(verticalViewportScrollDelta({
            cursorTop: 98,
            cursorBottom: 118,
            viewportTop: 100,
            viewportBottom: 300,
            topMargin: 8,
            bottomMargin: 6,
        })).toBe(-10);
        expect(verticalViewportScrollDelta({
            cursorTop: 280,
            cursorBottom: 320,
            viewportTop: 100,
            viewportBottom: 300,
            topMargin: 8,
            bottomMargin: 6,
        })).toBe(26);
        expect(verticalViewportScrollDelta({
            cursorTop: 150,
            cursorBottom: 170,
            viewportTop: 100,
            viewportBottom: 300,
            topMargin: 8,
            bottomMargin: 6,
        })).toBe(0);
        expect(verticalViewportScrollDelta({
            cursorTop: Number.NaN,
            cursorBottom: 170,
            viewportTop: 100,
            viewportBottom: 300,
        })).toBe(0);
    });
});

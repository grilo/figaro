import {
    EDITOR_TEXT_SCALE_DEFAULT,
    editorTextScaleForBuffer,
    editorTextScaleStatus,
    editorTextScaleWheelPlan,
    normalizeEditorTextScale,
} from '../frontend/js/core/editorTextScaleModel.js';

describe('editor text scale model', () => {
    test('normalizes saved and per-buffer values through the supported range', () => {
        expect(normalizeEditorTextScale('120')).toBe(120);
        expect(normalizeEditorTextScale('invalid')).toBe(EDITOR_TEXT_SCALE_DEFAULT);
        expect(normalizeEditorTextScale(20)).toBe(70);
        expect(normalizeEditorTextScale(900)).toBe(150);
        expect(editorTextScaleForBuffer(undefined, 110)).toBe(110);
        expect(editorTextScaleForBuffer(130, 110)).toBe(130);
    });

    test('uses Ctrl/Cmd+wheel direction and accumulates high-resolution input', () => {
        const first = editorTextScaleWheelPlan({
            currentScale: 100,
            deltaY: -18,
            modified: true,
        });
        expect(first).toEqual({ handled: true, accumulatedDeltaY: -18, scale: 100 });

        expect(editorTextScaleWheelPlan({
            currentScale: first.scale,
            deltaY: -22,
            accumulatedDeltaY: first.accumulatedDeltaY,
            modified: true,
        })).toEqual({ handled: true, accumulatedDeltaY: 0, scale: 110 });

        expect(editorTextScaleWheelPlan({
            currentScale: 110,
            deltaY: 1,
            deltaMode: 1,
            modified: true,
        }).scale).toBe(100);
    });

    test('does not claim ordinary or horizontal scrolling and clamps both limits', () => {
        expect(editorTextScaleWheelPlan({ deltaY: -100 }).handled).toBe(false);
        expect(editorTextScaleWheelPlan({
            deltaX: 100,
            deltaY: -10,
            modified: true,
        }).handled).toBe(false);
        expect(editorTextScaleWheelPlan({
            currentScale: 150,
            deltaY: -100,
            modified: true,
        }).scale).toBe(150);
        expect(editorTextScaleWheelPlan({
            currentScale: 70,
            deltaY: 100,
            modified: true,
        }).scale).toBe(70);
    });

    test('presents only file buffers and names the configured reset target', () => {
        expect(editorTextScaleStatus({ bufferType: 'settings' }).hidden).toBe(true);
        expect(editorTextScaleStatus({
            bufferType: 'file',
            scale: 130,
            configuredScale: 110,
        })).toEqual({
            hidden: false,
            label: 'Scale 130%',
            ariaLabel: 'Editor scale 130%. Reset to Settings default 110%',
            title: 'Reset editor scale to Settings default (110%)',
        });
    });
});

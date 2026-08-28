import {
    blockControlActivationRect,
    blockControlShouldReveal,
} from '../frontend/js/core/blockControlVisibilityModel.js';

describe('quiet block-control visibility', () => {
    const contentRect = { left: 100, right: 700, top: 20, bottom: 600 };
    const controlRect = { left: 54, right: 92, top: 140, bottom: 164 };
    const blockRect = { left: 100, right: 700, top: 130, bottom: 260 };

    test('joins the rendered block to its left rail without a pointer gap', () => {
        const activationRect = blockControlActivationRect({ controlRect, contentRect, blockRect });
        expect(activationRect).toEqual({ left: 46, right: 700, top: 130, bottom: 260 });
        expect(blockControlShouldReveal({ pointer: { x: 400, y: 200 }, activationRect })).toBe(true);
        expect(blockControlShouldReveal({ pointer: { x: 96, y: 200 }, activationRect })).toBe(true);
        expect(blockControlShouldReveal({ pointer: { x: 45, y: 200 }, activationRect })).toBe(false);
    });

    test('keeps headings to a narrow approach lane and folded controls visible', () => {
        const activationRect = blockControlActivationRect({
            controlRect, contentRect, blockRect, heading: true,
        });
        expect(activationRect.right).toBe(108);
        expect(blockControlShouldReveal({ pointer: { x: 400, y: 200 }, activationRect })).toBe(false);
        expect(blockControlShouldReveal({ folded: true })).toBe(true);
        expect(blockControlShouldReveal({ focused: true })).toBe(true);
        expect(blockControlShouldReveal({ caretInside: true })).toBe(true);
    });
});

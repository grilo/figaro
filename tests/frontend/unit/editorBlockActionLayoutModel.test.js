import {
    editorBlockActionLayout,
} from '../../../frontend/js/core/editorBlockActionLayoutModel.js';

describe('editor block action layout model', () => {
    test('keeps an unmeasured helper rail stationary at every valid width', () => {
        expect(editorBlockActionLayout(359)).toEqual({
            writingInset: 0,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(720)).toEqual({
            writingInset: 0,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
    });

    test('moves the left helper rail to the centered writing-column edge', () => {
        expect(editorBlockActionLayout(1105, {
            viewportLeft: 200,
            writingLeft: 570,
            beforeRailBaseRight: 397,
            beforeRailWidth: 88,
        })).toEqual({
            writingInset: 0,
            beforeRailOffset: 167,
            beforeRailWidth: 88,
        });

        expect(editorBlockActionLayout(320, {
            viewportLeft: 0,
            writingLeft: 80,
            beforeRailBaseRight: 100,
            beforeRailWidth: 60,
        })).toEqual({
            writingInset: 0,
            beforeRailOffset: -26,
            beforeRailWidth: 60,
        });
    });

    test('bounds invalid or negative measurements before publication', () => {
        expect(editorBlockActionLayout(-40)).toEqual({
            writingInset: 0,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(Number.NaN)).toEqual({
            writingInset: 0,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(400, {
            viewportLeft: 0,
            writingLeft: 1000,
            beforeRailBaseRight: 0,
            beforeRailWidth: 1000,
        })).toMatchObject({
            writingInset: 0,
            beforeRailOffset: 400,
            beforeRailWidth: 400,
        });
    });

    test('reserves the missing writing margin so full table actions cannot fall beneath the sidebar', () => {
        expect(editorBlockActionLayout(500, {
            viewportLeft: 300,
            writingLeft: 333,
            beforeRailBaseRight: 330,
            beforeRailWidth: 120,
        })).toEqual({ writingInset: 93, beforeRailOffset: 90, beforeRailWidth: 120 });
        expect(editorBlockActionLayout(500, {
            viewportLeft: 300,
            writingLeft: 424,
            beforeRailBaseRight: 330,
            beforeRailWidth: 120,
        })).toEqual({ writingInset: 2, beforeRailOffset: 90, beforeRailWidth: 120 });
        expect(editorBlockActionLayout(500, {
            viewportLeft: 300, writingLeft: 333, beforeRailBaseRight: 330, beforeRailWidth: 180,
        })).toEqual({ writingInset: 153, beforeRailOffset: 150, beforeRailWidth: 180 });
    });
});

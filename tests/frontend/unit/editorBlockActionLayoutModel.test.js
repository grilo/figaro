import {
    EDITOR_BLOCK_ACTION_MIN_RAIL_SPACE,
    editorBlockActionLayout,
} from '../../../frontend/js/core/editorBlockActionLayoutModel.js';

describe('editor block action layout model', () => {
    test('keeps an unmeasured helper rail stationary at every valid width', () => {
        expect(editorBlockActionLayout(359)).toEqual({
            stacked: false,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(720)).toEqual({
            stacked: false,
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
            stacked: false,
            beforeRailOffset: 169,
            beforeRailWidth: 88,
        });

        expect(editorBlockActionLayout(320, {
            viewportLeft: 0,
            writingLeft: 80,
            beforeRailBaseRight: 100,
            beforeRailWidth: 60,
        })).toEqual({
            stacked: true,
            beforeRailOffset: -24,
            beforeRailWidth: 60,
        });
    });

    test('bounds invalid or negative measurements before publication', () => {
        expect(editorBlockActionLayout(-40)).toEqual({
            stacked: false,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(Number.NaN)).toEqual({
            stacked: false,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(400, {
            viewportLeft: 0,
            writingLeft: 1000,
            beforeRailBaseRight: 0,
            beforeRailWidth: 1000,
        })).toMatchObject({
            stacked: false,
            beforeRailOffset: 400,
            beforeRailWidth: 400,
        });
    });

    test('uses the measured left margin instead of allowing controls beneath the sidebar', () => {
        expect(editorBlockActionLayout(500, {
            viewportLeft: 300,
            writingLeft: 300 + EDITOR_BLOCK_ACTION_MIN_RAIL_SPACE - 1,
            beforeRailBaseRight: 330,
            beforeRailWidth: 120,
        }).stacked).toBe(true);
        expect(editorBlockActionLayout(500, {
            viewportLeft: 300,
            writingLeft: 300 + EDITOR_BLOCK_ACTION_MIN_RAIL_SPACE,
            beforeRailBaseRight: 330,
            beforeRailWidth: 120,
        }).stacked).toBe(false);
    });
});

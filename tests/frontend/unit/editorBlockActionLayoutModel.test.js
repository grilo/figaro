import {
    EDITOR_BLOCK_ACTION_STACK_WIDTH,
    editorBlockActionLayout,
} from '../../../frontend/js/core/editorBlockActionLayoutModel.js';

describe('editor block action layout model', () => {
    test('uses one exact width boundary for side lanes and measured top rows', () => {
        expect(editorBlockActionLayout(EDITOR_BLOCK_ACTION_STACK_WIDTH - 1)).toEqual({
            viewportWidth: 359,
            stacked: true,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(EDITOR_BLOCK_ACTION_STACK_WIDTH)).toEqual({
            viewportWidth: 360,
            stacked: false,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(720)).toEqual({
            viewportWidth: 720,
            stacked: false,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
    });

    test('moves the left helper rail to the centered writing-column edge', () => {
        expect(editorBlockActionLayout(1105, {
            writingLeft: 570,
            beforeRailBaseRight: 397,
            beforeRailWidth: 88,
        })).toEqual({
            viewportWidth: 1105,
            stacked: false,
            beforeRailOffset: 169,
            beforeRailWidth: 88,
        });

        expect(editorBlockActionLayout(320, {
            writingLeft: 80,
            beforeRailBaseRight: 100,
            beforeRailWidth: 60,
        })).toEqual({
            viewportWidth: 320,
            stacked: true,
            beforeRailOffset: -24,
            beforeRailWidth: 60,
        });
    });

    test('bounds invalid or negative measurements before publication', () => {
        expect(editorBlockActionLayout(-40)).toEqual({
            viewportWidth: 0,
            stacked: true,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(Number.NaN)).toEqual({
            viewportWidth: 0,
            stacked: true,
            beforeRailOffset: 0,
            beforeRailWidth: 0,
        });
        expect(editorBlockActionLayout(400, {
            writingLeft: 1000,
            beforeRailBaseRight: 0,
            beforeRailWidth: 1000,
        })).toMatchObject({
            beforeRailOffset: 400,
            beforeRailWidth: 400,
        });
    });
});

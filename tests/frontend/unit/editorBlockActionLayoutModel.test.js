import {
    editorBlockActionLayout,
    editorHelperRailCompact,
    EDITOR_MINIMUM_PROSE_WIDTH,
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

test('activity reserves an outer lane independently of block guides at narrow widths', () => {
 const both=editorBlockActionLayout(500,{viewportLeft:300,writingLeft:333,beforeRailBaseRight:330,beforeRailWidth:120,activityRailWidth:75,activityRailBaseRight:405});
 expect(both.writingInset).toBe(174);
 expect(405+both.activityRailOffset).toBeLessThan(330+both.beforeRailOffset-120);
 const only=editorBlockActionLayout(500,{viewportLeft:300,writingLeft:333,beforeRailWidth:0,activityRailWidth:75,activityRailBaseRight:375});
 expect(only.writingInset).toBe(48); expect(375+only.activityRailOffset).toBe(375);
});

test('the helper rail compacts only when its full width would leave too little prose', () => {
    const wide = { proseRight: 1000, writingLeft: 400, fullWritingInset: 0 };
    expect(editorHelperRailCompact(wide)).toBe(false);
    // A 400px editor beside a details pane: 207px of prose with the full rail.
    const narrow = { proseRight: 600, writingLeft: 263, fullWritingInset: 130 };
    expect(600 - 263 - 130).toBeLessThan(EDITOR_MINIMUM_PROSE_WIDTH);
    expect(editorHelperRailCompact(narrow)).toBe(true);
    // Decided from the remembered full-rail inset, so the wider prose the
    // compact rail produces cannot switch it straight back.
    expect(editorHelperRailCompact({ ...narrow, fullWritingInset: 130 })).toBe(true);
    // Hidden, unmeasured or incomplete geometry never changes the mode.
    expect(editorHelperRailCompact({ proseRight: 0, writingLeft: 0, fullWritingInset: 0 })).toBe(false);
    expect(editorHelperRailCompact({ proseRight: 600, writingLeft: 263 })).toBe(false);
});

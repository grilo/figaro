import {
    statusBarPresentationModel,
    statusBarWritingRest,
} from '../frontend/js/core/statusBarPresentationModel.js';

describe('status bar writing-rest presentation', () => {
    test('recedes only while the editor has focus and the application is idle', () => {
        const idleWriting = {
            editorFocused: true,
            statusText: 'Ready',
            hasAction: false,
            activityVisible: false,
            vaultLoading: false,
        };

        expect(statusBarWritingRest(idleWriting)).toBe(true);
        expect(statusBarPresentationModel({ ...idleWriting, editorFocused: false })).toEqual({
            applicationIdle: true,
            writingRest: false,
        });
        for (const interruption of [
            { editorFocused: false },
            { statusText: 'Saving…' },
            { hasAction: true },
            { activityVisible: true },
            { vaultLoading: true },
        ]) {
            expect(statusBarWritingRest({ ...idleWriting, ...interruption })).toBe(false);
        }
    });

});

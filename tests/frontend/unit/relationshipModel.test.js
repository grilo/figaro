import { relationshipWindow } from '../frontend/js/core/relationshipModel.js';

describe('relationship result window', () => {
    test('bounds rendering around scroll and keyboard anchors', () => {
        expect(relationshipWindow(10_000)).toEqual({ start: 0, end: 96 });
        expect(relationshipWindow(10_000, { selectedIndex: 5_000 }))
            .toEqual({ start: 4_952, end: 5_048 });
        expect(relationshipWindow(10_000, { anchorIndex: 9_999 }))
            .toEqual({ start: 9_904, end: 10_000 });
        expect(relationshipWindow(0)).toEqual({ start: 0, end: 0 });
    });
});

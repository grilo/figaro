import { relationshipPage, relationshipWindow } from '../frontend/js/core/relationshipModel.js';

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

describe('relationship result paging', () => {
    test('shows at least one page and reveals the rest a page at a time', () => {
        expect(relationshipPage(0)).toEqual({ end: 0, remaining: 0, next: 0 });
        expect(relationshipPage(40)).toEqual({ end: 40, remaining: 0, next: 0 });
        expect(relationshipPage(250)).toEqual({ end: 100, remaining: 150, next: 100 });
        expect(relationshipPage(250, 200)).toEqual({ end: 200, remaining: 50, next: 50 });
        expect(relationshipPage(250, 999)).toEqual({ end: 250, remaining: 0, next: 0 });
        // A refreshed list that shrank keeps every revealed page it still has.
        expect(relationshipPage(180, 200)).toEqual({ end: 180, remaining: 0, next: 0 });
        expect(relationshipPage(5, 0, 2)).toEqual({ end: 2, remaining: 3, next: 2 });
    });
});

import { createPreviewCache } from '../frontend/js/core/previewCache.js';

test('preview retention bounds count and weight, refreshes recency, and transfers ownership once', () => {
    const cache = createPreviewCache({ maximumEntries: 2, maximumWeight: 10 });
    const first = {}, second = {}, third = {};
    cache.set('first', first, 4); cache.set('second', second, 4);
    expect(cache.get('first')).toBe(first);
    cache.set('third', third, 3);
    expect(cache.get('second')).toBeUndefined();
    expect(cache.stats()).toEqual({ entries: 2, weight: 7 });
    expect(cache.take('first')).toBe(first);
    expect(cache.take('first')).toBeUndefined();
    cache.set('third', third, 9);
    expect(cache.stats()).toEqual({ entries: 1, weight: 9 });
    cache.set('first', first, 4);
    expect(cache.get('third')).toBeUndefined();
    cache.clear();
    expect(cache.stats()).toEqual({ entries: 0, weight: 0 });
});

test('oversized or invalid preview entries cannot exceed retention budgets or leave an old replacement', () => {
    const cache = createPreviewCache({ maximumEntries: 2, maximumWeight: 10 });
    for (const size of [11, Infinity, NaN, -1]) {
        cache.set('preview', 'old', 2);
        expect(cache.set('preview', 'new', size)).toBe(false);
        expect(cache.get('preview')).toBeUndefined();
        expect(cache.stats()).toEqual({ entries: 0, weight: 0 });
    }
    expect(createPreviewCache({ maximumEntries: 0, maximumWeight: 10 }).set('a', 1, 1)).toBe(false);
});

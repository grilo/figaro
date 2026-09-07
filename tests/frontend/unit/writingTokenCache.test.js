import { createWritingTokenCache } from '../../../frontend/js/core/writingTokenCache.js';
const tokenize = jest.fn(text => [{ text, normalized: text.toLowerCase(), start: 0, end: text.length }]);
beforeEach(() => tokenize.mockClear());
test('long-note token cache shares repeated work without exposing mutable tokens or stale offsets', () => {
    const cache = createWritingTokenCache();
    const first = cache.tokens('Word', tokenize); first[0].start = 99; first.push({});
    expect(cache.tokens('Word', tokenize)).toEqual([{ text: 'Word', normalized: 'word', start: 0, end: 4 }]);
    expect(tokenize).toHaveBeenCalledTimes(1);
    cache.tokens('word', tokenize); expect(tokenize).toHaveBeenCalledTimes(2);
    cache.clear(); cache.tokens('Word', tokenize); expect(tokenize).toHaveBeenCalledTimes(3);
});
test('long-note token cache evicts least recent entries and does not retain oversized input', () => {
    const cache = createWritingTokenCache({ maximumEntries: 2, maximumWeight: 200 });
    cache.tokens('A', tokenize); cache.tokens('B', tokenize); cache.tokens('A', tokenize); cache.tokens('C', tokenize);
    cache.tokens('B', tokenize); expect(tokenize).toHaveBeenCalledTimes(4);
    const long = 'x'.repeat(200); cache.tokens(long, tokenize); cache.tokens(long, tokenize);
    expect(tokenize).toHaveBeenCalledTimes(6);
});

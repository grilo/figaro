import { writingFootnoteRanges } from '../../../frontend/js/core/writingFootnoteModel.js';

test('footnote protection preserves UTF-16 offsets and recognizes unresolved and definition markers', () => {
    const source = '😀[^missing] [^two words]\r\n[^label]: body';
    expect(writingFootnoteRanges(source).map(range => source.slice(range.from, range.to)))
        .toEqual(['[^missing]', '[^two words]', '[^label]']);
    expect(writingFootnoteRanges(source)[0].from).toBe(2);
});

test('footnote protection distinguishes escaped brackets, inline prose, and incomplete syntax', () => {
    expect(writingFootnoteRanges(String.raw`\[^literal] ^[inline prose] [^] [^unfinished`)).toEqual([]);
    const source = String.raw`\\[^reference]`;
    expect(writingFootnoteRanges(source)).toEqual([{ from: 2, to: source.length }]);
});

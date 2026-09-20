import { writingTechnicalRanges } from '../../../frontend/js/core/writingTechnicalModel.js';

test('slash alternatives and missing sentence spaces stay eligible for prose checking', () => {
    for (const text of ['writting/editting', 'writting.editting', 'writting/editting/reeding', 'read/write', 'Hello.World']) {
        expect(writingTechnicalRanges(text)).toEqual([]);
    }
});

test('URLs, email, explicit paths, filenames, and identifiers retain exact protected offsets', () => {
    const tokens = ['https://example.com/teh', 'person@example.com', '/usr/zzquux', './zzquux', '../zzquux', '~/zzquux',
        'C:/zzquux', 'C:\\zzquux', 'src/file_name.md', 'document.docx', 'file_name', 'cafe\u0301.pdf'];
    for (const token of tokens) {
        const text = `😀 Read ${token}.`;
        const ranges = writingTechnicalRanges(text);
        expect(ranges.some(range => text.slice(range.from, range.to) === token)).toBe(true);
        expect(ranges.every(range => range.to <= text.length - 1)).toBe(true);
    }
});

test('PascalCase and dotted camel-case members stay opaque without hiding sentence punctuation errors', () => {
    for (const token of ['AbortError', 'limit.clearQueue', 'limitedFunction.clearQueue', 'limit.activeCount']) {
        const text = `😀 Call ${token}.`;
        expect(writingTechnicalRanges(text).some(range => text.slice(range.from, range.to) === token)).toBe(true);
    }
    for (const text of ['Hello.World', 'writting.editting', 'Clear writing', 'Pascal', 'teh.TEST']) {
        expect(writingTechnicalRanges(text)).toEqual([]);
    }
});

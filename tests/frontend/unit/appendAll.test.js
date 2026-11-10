import { appendAll } from '../../../frontend/js/core/appendAll.js';
import { spellingSource } from '../../../frontend/js/core/spellingModel.js';
import { prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';

describe('source-sized collections are appended without spreading them into call arguments', () => {
    test('appends more items than an engine accepts as arguments and returns the target', () => {
        const items = Array.from({ length: 300_000 }, (_unused, index) => index);
        const target = ['first'];

        expect(appendAll(target, items)).toBe(target);
        expect(target).toHaveLength(300_001);
        expect(target[300_000]).toBe(299_999);
        expect(appendAll([], new Set(['a', 'b']))).toEqual(['a', 'b']);
    });

    test('projects one very long paragraph for the writing lenses', () => {
        // A transcript pasted with single line breaks is one paragraph; each
        // character is a projection unit, which used to overflow push(...units).
        const source = 'word '.repeat(40_000);

        const projection = prepareWritingSource(source);

        expect(projection.text.length).toBeGreaterThanOrEqual(source.trimEnd().length);
        expect(projection.units.length).toBeGreaterThanOrEqual(source.trimEnd().length);
    });

    test('collects spelling ranges from a note with more emphasis marks than the argument limit', () => {
        const source = '*a* '.repeat(70_000);

        const { words } = spellingSource(source);

        expect(Array.isArray(words)).toBe(true);
    });
});

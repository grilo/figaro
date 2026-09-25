import {
    diagramSizeKey,
    readDiagramSizeMemory,
    rememberDiagramSize,
    serializeDiagramSizeMemory,
    svgViewBoxSize,
} from '../../../frontend/js/core/diagramSizeModel.js';
import { DIAGRAM_SIZE_STORAGE_KEY, createDiagramSizeMemory } from '../../../frontend/js/adapters/diagramSizeMemory.js';

describe('diagram size model', () => {
    test('reads natural size from an SVG viewBox', () => {
        expect(svgViewBoxSize('0 0 329 70')).toEqual({ width: 329, height: 70 });
        expect(svgViewBoxSize('-8, -8, 120.5, 60')).toEqual({ width: 120.5, height: 60 });
        expect(svgViewBoxSize('0 0 0 70')).toBeNull();
        expect(svgViewBoxSize('')).toBeNull();
        expect(svgViewBoxSize('0 0 wide 70')).toBeNull();
    });

    test('keys sources compactly without storing their text', () => {
        const source = 'flowchart TD\n  Secret --> Plan';
        const key = diagramSizeKey('Mermaid', source);
        expect(key).toBe(diagramSizeKey('mermaid', source));
        expect(key).not.toContain('Secret');
        expect(key).not.toBe(diagramSizeKey('mermaid', `${source} `));
        expect(key.length).toBeLessThan(30);
    });

    test('keeps the most recent sizes within the limit and reports only changes', () => {
        const entries = new Map();
        expect(rememberDiagramSize(entries, 'a', { width: 10, height: 5 }, 2)).toBe(true);
        expect(rememberDiagramSize(entries, 'b', { width: 20, height: 5 }, 2)).toBe(true);
        expect(rememberDiagramSize(entries, 'a', { width: 10, height: 5 }, 2)).toBe(false);
        expect(rememberDiagramSize(entries, 'c', { width: 30, height: 5 }, 2)).toBe(true);
        expect([...entries.keys()]).toEqual(['a', 'c']);
        expect(rememberDiagramSize(entries, 'd', { width: 0, height: 5 }, 2)).toBe(false);
        expect(readDiagramSizeMemory(serializeDiagramSizeMemory(entries))).toEqual(entries);
    });

    test('ignores malformed stored data', () => {
        expect(readDiagramSizeMemory('not json').size).toBe(0);
        expect(readDiagramSizeMemory('[1,2]').size).toBe(0);
        expect([...readDiagramSizeMemory('{"a":[1,2],"b":[0,2],"c":"x"}').keys()]).toEqual(['a']);
    });
});

describe('diagram size memory', () => {
    function fakeStorage(initial = {}) {
        const values = new Map(Object.entries(initial));
        return {
            values,
            read: key => values.get(key) ?? null,
            write: jest.fn((key, value) => values.set(key, value)),
        };
    }

    test('restores natural sizes and persists changes once after a quiet delay', () => {
        const storage = fakeStorage({ [DIAGRAM_SIZE_STORAGE_KEY]: '{"known":[100,50]}' });
        const scheduled = [];
        const memory = createDiagramSizeMemory({
            storage, schedule: callback => scheduled.push(callback), cancel: () => {},
        });
        expect(memory.naturalSize('known')).toEqual({ width: 100, height: 50 });
        memory.rememberNaturalSize('known', { width: 100, height: 50 });
        expect(scheduled).toHaveLength(0);
        memory.rememberNaturalSize('new', { width: 40, height: 80 });
        memory.rememberNaturalSize('other', { width: 60, height: 80 });
        expect(scheduled).toHaveLength(1);
        scheduled[0]();
        expect(storage.write).toHaveBeenCalledTimes(1);
        expect(JSON.parse(storage.values.get(DIAGRAM_SIZE_STORAGE_KEY)))
            .toEqual({ known: [100, 50], new: [40, 80], other: [60, 80] });
    });

    test('keeps measured box heights for the session only', () => {
        const storage = fakeStorage();
        const memory = createDiagramSizeMemory({ storage, schedule: () => 1, cancel: () => {} });
        expect(memory.boxHeight('box')).toBe(0);
        memory.rememberBoxHeight('box', 238.5);
        expect(memory.boxHeight('box')).toBe(238.5);
        memory.flush();
        expect(storage.values.get(DIAGRAM_SIZE_STORAGE_KEY)).toBe('{}');
    });

    test('keeps measured box heights for the layout they were measured in', () => {
        const memory = createDiagramSizeMemory({ storage: null });
        memory.setLayout('640:28');
        memory.rememberBoxHeight('box', 240);
        memory.setLayout('480:28');
        expect(memory.boxHeight('box')).toBe(0);
        memory.rememberBoxHeight('box', 200);
        memory.setLayout('640:28');
        expect(memory.boxHeight('box')).toBe(240);
    });

    test('a session-only memory never schedules storage writes', () => {
        const schedule = jest.fn();
        const memory = createDiagramSizeMemory({ storage: null, schedule });
        memory.rememberNaturalSize('key', { width: 3, height: 4 });
        expect(memory.naturalSize('key')).toEqual({ width: 3, height: 4 });
        expect(schedule).not.toHaveBeenCalled();
    });

    test('stays usable when webview storage is unavailable', () => {
        const storage = { read: () => { throw new Error('denied'); }, write: () => { throw new Error('denied'); } };
        const memory = createDiagramSizeMemory({ storage, schedule: callback => callback(), cancel: () => {} });
        memory.rememberNaturalSize('key', { width: 1, height: 2 });
        expect(memory.naturalSize('key')).toEqual({ width: 1, height: 2 });
    });
});

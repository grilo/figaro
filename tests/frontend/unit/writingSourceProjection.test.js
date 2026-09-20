import { writingProjectionEdit, combineWritingProjections } from '../../../frontend/js/core/writingProjectionModel.js';
import { createWritingSourceProjection } from '../../../frontend/js/usecases/writingSourceProjection.js';

test('writing projection plan confines changes to one independent block and rejects reference context', () => {
    const source = '# Title\n\nOne paragraph.\n\nOther paragraph.';
    const entries = [{ from: 0, to: 7, type: 'heading' }, { from: 9, to: 23, type: 'paragraph' },
        { from: 25, to: source.length, type: 'paragraph' }];
    expect(writingProjectionEdit(source, source.replace('paragraph', 'long paragraph'), entries, '')).toEqual({ index: 1, from: 9, to: 28, delta: 5 });
    expect(writingProjectionEdit(source, source.replace('paragraph', 'para\ngraph'), entries, '')).toEqual({ index: 1, from: 9, to: 24, delta: 1 });
    for (const next of [source.replace('paragraph', '*paragraph*'), 'Prefix ' + source,
        source.replace('paragraph.\n\nOther', 'combined')]) expect(writingProjectionEdit(source, next, entries, '')).toBeNull();
    expect(writingProjectionEdit(source, source.replace('paragraph', 'text'), entries, '[ref]: /target')).toBeNull();
});

test('cached prose maps preserve unmoved units and rebase UTF-16 source, quotation and prose offsets', () => {
    const unit = { char: 'x', from: 10, to: 11, safe: true };
    const separator = { char: '\n', from: -1, to: -1 };
    const projection = { units: [unit, separator], typography: { units: [unit, separator] },
        regions: [{ from: 10, to: 11, start: 0, end: 1, type: 'paragraph' }], quotationSpans: [{ from: 0, to: 1 }] };
    const result = combineWritingProjections([{ from: 10, origin: 10, projection }, { from: 20, origin: 10, projection }]);
    expect(result.text).toBe('x\nx\n');
    expect(result.typography.text).toBe(result.text);
    expect(result.units[0]).toBe(unit);
    expect(result.units[2]).toEqual({ ...unit, from: 20, to: 21 });
    expect(result.units[3]).toBe(separator);
    expect(result.regions[1]).toMatchObject({ from: 20, to: 21, start: 2, end: 3 });
    expect(result.quotationSpans).toEqual([{ from: 0, to: 1 }, { from: 2, to: 3 }]);
});

test('projection coordinator keeps its last complete document after parser or projection failure', () => {
    const parse = jest.fn(source => ({ context: '', blocks: [{ from: 0, to: source.length, type: 'paragraph' }] }));
    const project = jest.fn((_block, source) => ({ units: [...source].map((char, from) => ({ char, from, to: from + 1 })),
        typography: { units: [] }, regions: [], quotationSpans: [] }));
    const runtime = createWritingSourceProjection({ parse, project });
    expect(runtime.prepare('ordinary prose').text).toBe('ordinary prose');
    parse.mockImplementationOnce(() => { throw new Error('parse failed'); });
    expect(() => runtime.prepare('ordinary longer prose')).toThrow('parse failed');
    project.mockImplementationOnce(() => { throw new Error('projection failed'); });
    expect(() => runtime.prepare('ordinary longer prose')).toThrow('projection failed');
    expect(runtime.prepare('ordinary longer prose').text).toBe('ordinary longer prose');
    const calls = parse.mock.calls.length;
    expect(runtime.prepare('ordinary longer prose').text).toBe('ordinary longer prose');
    expect(parse).toHaveBeenCalledTimes(calls);
});

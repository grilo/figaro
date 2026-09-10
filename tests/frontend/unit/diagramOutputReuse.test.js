import { createDiagramOutputReuse } from '../frontend/js/usecases/diagramOutputReuse.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('Vega output reuse counts unchanged revisits, source edits, and concurrent render work', async () => {
    const render = jest.fn(async input => `<svg>${input}</svg>`);
    const reuse = createDiagramOutputReuse({ render });
    expect(await Promise.all([reuse.render('a', 'a'), reuse.render('a', 'a')]))
        .toEqual(['<svg>a</svg>', '<svg>a</svg>']);
    await reuse.render('b', 'b');
    await reuse.render('a', 'a');
    expect(render).toHaveBeenCalledTimes(2);
    await reuse.render('edited', 'a edited');
    expect(render).toHaveBeenCalledTimes(3);
});

test('Vega reuse evicts least recently visited output and bounds total source/output characters', async () => {
    const render = jest.fn(async input => input);
    const reuse = createDiagramOutputReuse({ render, maxEntries: 2, maxCharacters: 12 });
    await reuse.render('a', '123'); await reuse.render('b', '456'); await reuse.render('a', '123');
    await reuse.render('c', '789'); await reuse.render('a', '123');
    expect(render).toHaveBeenCalledTimes(3);
    await reuse.render('b', '456'); expect(render).toHaveBeenCalledTimes(4);
    await reuse.render('large', '123456789'); await reuse.render('large', '123456789');
    expect(render).toHaveBeenCalledTimes(6);
    // This entry fits alone, but requires evicting both smaller entries.
    await reuse.render('d', '123456789'); await reuse.render('b', '456');
    expect(render).toHaveBeenCalledTimes(8);
});

test('failed, missing, and externally sourced output remains retryable', async () => {
    const render = jest.fn().mockRejectedValueOnce(new Error('bad data')).mockResolvedValueOnce(null).mockResolvedValue('<svg/>');
    const reuse = createDiagramOutputReuse({ render });
    await expect(reuse.render('a')).rejects.toThrow('bad data');
    expect(await reuse.render('a')).toBeNull();
    expect(await reuse.render('a')).toBe('<svg/>');
    await reuse.render(null); await reuse.render(null);
    expect(render).toHaveBeenCalledTimes(5);
});

test('font/engine invalidation prevents a late result from repopulating the output cache', async () => {
    const old = deferred();
    const render = jest.fn().mockReturnValueOnce(old.promise).mockResolvedValue('new');
    const reuse = createDiagramOutputReuse({ render });
    const pending = reuse.render('a'); await Promise.resolve();
    reuse.clear();
    expect(await reuse.render('a')).toBe('new');
    old.resolve('old'); expect(await pending).toBe('old');
    expect(await reuse.render('a')).toBe('new');
    expect(render).toHaveBeenCalledTimes(2);
});

test('pending-key retention is bounded without dropping requests', async () => {
    const pending = deferred();
    const render = jest.fn().mockReturnValue(pending.promise);
    const reuse = createDiagramOutputReuse({ render, maxEntries: 1 });
    const jobs = [reuse.render('a'), reuse.render('b'), reuse.render('b'), reuse.render('a')];
    pending.resolve('svg'); await Promise.all(jobs);
    expect(render).toHaveBeenCalledTimes(3);
});

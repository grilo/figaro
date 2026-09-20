import { createMermaidValidationReuse } from '../../../frontend/js/usecases/mermaidValidationReuse.js';

test('validation reuses successes, failures and in-flight requests by source and parser context', async () => {
    let finish;
    const error = new Error('Invalid diagram');
    const validate = jest.fn(source => source === 'bad' ? Promise.reject(error)
        : new Promise(resolve => { finish = resolve; }));
    const reuse = createMermaidValidationReuse(validate), context = {};
    const first = reuse('good', context), second = reuse('good', context);
    await Promise.resolve();
    expect(validate).toHaveBeenCalledTimes(1);
    finish({ diagramType: 'flowchart-v2' });
    await expect(first).resolves.toEqual(await second);
    await reuse('good', context);
    await expect(reuse('bad', context)).rejects.toBe(error);
    await expect(reuse('bad', context)).rejects.toBe(error);
    expect(validate).toHaveBeenCalledTimes(2);
    const replaced = reuse('good', {});
    await Promise.resolve();
    finish(true); await replaced;
    expect(validate).toHaveBeenCalledTimes(3);
});

test('validation evicts least-recent entries and bounds retained source characters', async () => {
    const validate = jest.fn().mockResolvedValue(true);
    const reuse = createMermaidValidationReuse(validate, { limit: 2, maxCharacters: 5 });
    await reuse('aa'); await reuse('bb'); await reuse('aa'); await reuse('cc');
    expect(validate).toHaveBeenCalledTimes(3);
    await reuse('bb');
    expect(validate).toHaveBeenCalledTimes(4);
    await reuse('large-source'); await reuse('large-source');
    expect(validate).toHaveBeenCalledTimes(6);
});

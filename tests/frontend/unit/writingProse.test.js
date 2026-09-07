import { createWritingProse } from '../../../frontend/js/usecases/writingProse.js';
import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';

const source = 'We saw a apple on teh table.';
const job = { source, language: 'en-US', preferences: { language: 'en-US', lenses: ['grammar', 'spelling'] },
    spelling: { enabled: true, language: 'en-US', words: [] }, decisions: [] };
const spelling = [{ engine: 'spelling', rule: 'figaro-spelling', actual: 'teh', from: 18, to: 21, replacements: ['the'] }];
const input = { job, proseRequired: true, spelling };

test('a replacement prose worker rebuilds required grammar evidence before completing later spelling results', async () => {
    const analyze = jest.fn(analyzeWriting), worker = createWritingProse({ analyze });
    const value = await worker.resolve(input);
    expect(analyze).toHaveBeenCalledWith(source);
    expect(value.result.groups.flatMap(group => group.findings).map(item => item.kind)).toEqual(['grammar.article', 'grammar.spelling']);
    expect(value.result.findings[0].fixes[0]).toMatchObject({ expected: 'a', replacement: 'an' });
    expect(value.result.inlineFindings).toHaveLength(2);
});

test('worker resolution reuses matching prose and rebuilds a missing source without exposing raw maps', async () => {
    const analyze = jest.fn(analyzeWriting), worker = createWritingProse({ analyze });
    const response = await worker.analyze(source);
    expect(response.observations).toEqual([]); expect(response.projection.units).toBeUndefined();
    await worker.resolve(input); expect(analyze).toHaveBeenCalledTimes(1);
    const next = { ...input, job: { ...job, source: 'We saw an apple.' }, spelling: [] };
    expect((await worker.resolve(next)).result.count).toBe(0);
    expect(analyze).toHaveBeenLastCalledWith(next.job.source);
});

test('failed or unrequested prose stays excluded while independent spelling remains available', async () => {
    const analyze = jest.fn(analyzeWriting), worker = createWritingProse({ analyze });
    await worker.analyze(source);
    const result = await worker.resolve({ ...input, proseRequired: false });
    expect(result.result.groups.flatMap(group => group.findings).map(item => item.kind)).toEqual(['grammar.spelling']);
    expect(analyze).toHaveBeenCalledTimes(1);
});

test('prose cache recovery failure preserves partial spelling with an explicit failure until a successful retry', async () => {
    const analyze = jest.fn().mockRejectedValueOnce(new Error('recovery failed')).mockImplementation(analyzeWriting);
    const worker = createWritingProse({ analyze });
    const failed = await worker.resolve({ ...input, valeOutput: '{}' });
    expect(failed).toMatchObject({ proseFailure: 'failed', result: { count: 1 } });
    expect(failed.result.findings[0].kind).toBe('grammar.spelling');
    expect(await worker.resolve(input)).toMatchObject({ proseFailure: undefined, result: { count: 2 } });
    expect(analyze).toHaveBeenCalledTimes(2);
});

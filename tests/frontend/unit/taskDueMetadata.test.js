import { taskDueMetadataPlan } from '../frontend/js/core/taskDueMetadataModel.js';
import { saveTaskDueMetadata } from '../frontend/js/taskDueMetadata.js';

describe('@date date-link planning and task metadata save sequencing', () => {
    test('inserts a plain date link at the command and preserves surrounding source', () => {
        const source = 'Before\nKeep  spacing #todo @date\nAfter';
        const from = source.indexOf('@date');
        expect(taskDueMetadataPlan(source, from + 5, { from, to: from + 5 }, '2026-09-02'))
            .toMatchObject({ line: 'Keep  spacing #todo [2026-09-02](2026-09-02.md)', isTask: true, lineNumber: 2,
                content: 'Before\nKeep  spacing #todo [2026-09-02](2026-09-02.md)\nAfter' });
    });
    test('untagged checklist items join TODO; prose gets a link without scheduling', () => {
        const source = '- [ ] Ship @date';
        const range = { from: 11, to: 16 };
        expect(taskDueMetadataPlan(source, 16, range, '2026-09-02').line).toBe('- [ ] Ship [2026-09-02](2026-09-02.md) #todo');
        expect(taskDueMetadataPlan('Plain @date', 11, { from: 6, to: 11 }, '2026-09-02', 'wikilink'))
            .toMatchObject({ line: 'Plain [[2026-09-02]]', isTask: false });
        expect(taskDueMetadataPlan(source, 15, range, '2026-02-30')).toBeNull();
        expect(taskDueMetadataPlan(source, 15, { from: 0, to: 4 }, '')).toBeNull();
    });
    test('matches the existing board column contract for hex-looking names', () => {
        expect(taskDueMetadataPlan('Coffee #cafe', 12, null, '2026-09-02').isTask).toBe(true);
        expect(taskDueMetadataPlan('Color #fff', 10, null, '2026-09-02').isTask).toBe(false);
    });
    test.each(['2026-01-01', '[[2026-01-01]]', '[2026-01-01](2026-01-01.md)', '[[2026-01-01.md|January]]'])('the rail replaces a sole date %s using the current link style', existing => {
        const source = `- [ ] Meet ${existing} #todo`;
        expect(taskDueMetadataPlan(source, 0, null, '2026-09-02', 'wikilink').line)
            .toBe('- [ ] Meet [[2026-09-02]] #todo');
    });
    test.each(['markdown', 'wikilink'])('multiple dates are preserved and another %s link is appended', style => {
        const source = '- [ ] Meet [[2026-01-01]] and [2026-02-01](2026-02-01.md) #todo';
        const link = style === 'wikilink' ? '[[2026-09-02]]' : '[2026-09-02](2026-09-02.md)';
        expect(taskDueMetadataPlan(source, 0, null, '2026-09-02', style).line).toBe(`${source} ${link}`);
        const macro = `${source} @date`;
        expect(taskDueMetadataPlan(macro, macro.length, { from: source.length + 1, to: macro.length }, '2026-09-02', style).line)
            .toBe(`${source} ${link}`);
    });
    test.each(['Meet [[2026-01-01]] @date', 'Meet @date [[2026-01-01]]'])('@date replaces the sole date and removes its command: %s', source => {
        const from = source.indexOf('@date');
        const plan = taskDueMetadataPlan(source, from + 5, { from, to: from + 5 }, '2026-09-02', 'wikilink');
        expect(plan.line).toBe('Meet [[2026-09-02]]');
        expect(plan.selectionOffset).toBe(plan.line.length);
    });
    test('dates on other lines and inside code, images or web links are not replaced', () => {
        const line = '- [ ] Use `2026-01-01` ![2026-01-01](2026-01-01.md) [web](https://example.com/2026-01-01) 2026-01-01.png #todo';
        const source = `[[2026-01-01]]\n${line}\nAfter`;
        const plan = taskDueMetadataPlan(source, source.indexOf('- [ ]'), null, '2026-09-02', 'wikilink');
        expect(plan.content).toBe(`[[2026-01-01]]\n${line} [[2026-09-02]]\nAfter`);
    });
    test('clearing a metadata deadline preserves authored date references', () => {
        const source = '- [ ] Meet [[2026-01-01]] #todo';
        expect(taskDueMetadataPlan(source, 0, null, '').content).toBe(source);
    });
    test('attaches metadata only after the exact note saves; failed saves and edits attach nothing', async () => {
        const calls = [];
        const setDue = jest.fn(async () => calls.push('dates'));
        const request = { task: { file: 'tasks.md', line: 1, source: 'Ship #todo' },
            date: '2026-09-02', content: 'Ship #todo', setDue, isCurrent: () => true,
            saveNote: async () => { calls.push('note'); return { success: true }; } };
        await saveTaskDueMetadata(request);
        expect(calls).toEqual(['note', 'dates']);
        expect(setDue).toHaveBeenCalledWith(request.task, request.date);
        setDue.mockClear();
        await expect(saveTaskDueMetadata({ ...request, saveNote: async () => ({ success: false }) })).rejects.toThrow('not saved');
        await expect(saveTaskDueMetadata({ ...request, isCurrent: () => false })).rejects.toThrow('task changed');
        expect(setDue).not.toHaveBeenCalled();
        await expect(saveTaskDueMetadata({ ...request, setDue: async () => { throw Error('Read only'); } })).rejects.toThrow('Read only');
    });
});

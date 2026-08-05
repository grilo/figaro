import { EditorState } from '@codemirror/state';
import { createTaskDueDateCompletionSource } from '../frontend/js/taskDueDateCompletions.js';

function completionContext(source, pos = source.length) {
    return { state: EditorState.create({ doc: source }), pos, explicit: true };
}

describe('task due-date completions', () => {
    const now = () => new Date(2026, 7, 14, 12);

    test('suggests known hashtags in prose but keeps due-date actions out', () => {
        const complete = createTaskDueDateCompletionSource({ getColumns: () => ['urgent'], now });
        const result = complete(completionContext('Long paragraph #ur'));
        expect(result.options.map(option => option.label)).toEqual(['#urgent']);
        expect(result.filter).toBe(false);
    });

    test('adds calendar, today, and tomorrow actions only for an eligible exact task tag', () => {
        const complete = createTaskDueDateCompletionSource({ getColumns: () => ['urgent'], now });
        expect(complete(completionContext('- [ ] Ship #to')).options.map(option => option.label)).toEqual(['#todo']);
        expect(complete(completionContext('- [ ] Ship #todo')).options.map(option => option.label)).toEqual([
            '#todo', 'Add due date…', 'Due today', 'Due tomorrow',
        ]);
        expect(complete(completionContext('- [x] Ship #todo')).options.map(option => option.label)).toEqual(['#todo']);
        expect(complete(completionContext('Paragraph #todo')).options.map(option => option.label)).toEqual(['#todo']);
    });

    test('inserts a shortcut date atomically', () => {
        const complete = createTaskDueDateCompletionSource({ now });
        const result = complete(completionContext('- [ ] Ship #todo'));
        const dueToday = result.options.find(option => option.label === 'Due today');
        const dispatch = jest.fn();
        dueToday.apply({ dispatch }, null, result.from, '- [ ] Ship #todo'.length);
        const replacement = '#todo [due 2026-08-14](2026-08-14.md)';
        expect(dispatch).toHaveBeenCalledWith({
            changes: { from: 11, to: 16, insert: replacement },
            selection: { anchor: 11 + replacement.length },
        });
    });

    test('opens the existing picker and restarts completion only after task-tag acceptance', async () => {
        const openPicker = jest.fn();
        const restartCompletion = jest.fn();
        const complete = createTaskDueDateCompletionSource({ now, openPicker, restartCompletion });
        const result = complete(completionContext('- [ ] Ship #todo'));
        const view = { dispatch: jest.fn(), isDestroyed: false };
        result.options[0].apply(view, null, result.from, 16);
        await Promise.resolve();
        expect(restartCompletion).toHaveBeenCalledWith(view);

        result.options.find(option => option.label === 'Add due date…').apply(view, null, result.from, 16);
        await Promise.resolve();
        expect(openPicker).toHaveBeenCalledWith(expect.objectContaining({
            view,
            position: 16,
            now,
            onSelect: expect.any(Function),
        }));

        const prose = complete(completionContext('Paragraph #todo'));
        restartCompletion.mockClear();
        prose.options[0].apply(view, null, prose.from, 'Paragraph #todo'.length);
        await Promise.resolve();
        expect(restartCompletion).not.toHaveBeenCalled();
    });
});

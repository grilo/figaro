import { EditorState } from '@codemirror/state';
import { createTaskDueDateCompletionSource } from '../frontend/js/taskDueDateCompletions.js';

function completionContext(source, pos = source.length) {
    return { state: EditorState.create({ doc: source }), pos, explicit: true };
}

describe('tagged-line due-date completions', () => {
    const now = () => new Date(2026, 7, 14, 12);

    test('suggests saved hashtags while typing without mixing in due actions', () => {
        const complete = createTaskDueDateCompletionSource({ getColumns: () => ['urgent'], now });
        expect(complete(completionContext('Long paragraph #ur')).options.map(option => option.label))
            .toEqual(['#urgent']);
        expect(complete(completionContext('Long paragraph #todo')).options.map(option => option.label))
            .toEqual(['#todo']);
    });

    test('offers due-date actions after Space for any valid standalone tag', () => {
        const complete = createTaskDueDateCompletionSource({ getColumns: () => ['urgent'], now });
        expect(complete(completionContext('Ordinary prose #new-column ')).options.map(option => option.label))
            .toEqual(['Add due date…', 'Due today', 'Due tomorrow']);
        expect(complete(completionContext('- [ ] Task #todo ')).options.map(option => option.label))
            .toEqual(['Add due date…', 'Due today', 'Due tomorrow']);
        expect(complete(completionContext('Finished #done '))).toBeNull();
        expect(complete(completionContext('Dated #todo [due 2026-08-14](2026-08-14.md) #urgent ')))
            .toBeNull();
    });

    test('inserts a shortcut date atomically after the tag whitespace', () => {
        const complete = createTaskDueDateCompletionSource({ now });
        const source = 'Plan the launch #roadmap ';
        const result = complete(completionContext(source));
        const dueToday = result.options.find(option => option.label === 'Due today');
        const dispatch = jest.fn();
        dueToday.apply({ dispatch, state: EditorState.create({ doc: source }), isDestroyed: false });
        const insertion = ' [due 2026-08-14](2026-08-14.md)';
        expect(dispatch).toHaveBeenCalledWith({
            changes: { from: source.length - 1, to: source.length, insert: insertion },
            selection: { anchor: source.length - 1 + insertion.length },
        });
    });

    test('opens the existing picker without changing the tagged line until a date is chosen', async () => {
        const openPicker = jest.fn();
        const complete = createTaskDueDateCompletionSource({ now, openPicker });
        const source = 'Paragraph #follow-up ';
        const result = complete(completionContext(source));
        const view = {
            dispatch: jest.fn(),
            state: EditorState.create({ doc: source }),
            isDestroyed: false,
        };

        result.options.find(option => option.label === 'Add due date…').apply(view);
        await Promise.resolve();
        expect(view.dispatch).not.toHaveBeenCalled();
        expect(openPicker).toHaveBeenCalledWith(expect.objectContaining({
            view,
            position: source.length,
            now,
            onSelect: expect.any(Function),
        }));
    });
});

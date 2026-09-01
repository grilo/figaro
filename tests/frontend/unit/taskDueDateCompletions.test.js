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

    test('does not offer legacy date-link writers after a tag', () => {
        const complete = createTaskDueDateCompletionSource();
        expect(complete(completionContext('Task #todo '))).toBeNull();
        expect(complete(completionContext('Task #urgent '))).toBeNull();
    });
});

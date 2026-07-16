import { EditorState } from '@codemirror/state';
import {
    createDateShortcutCompletionSource,
    dateShortcutLink,
} from '../frontend/js/dateShortcutCompletions.js';

function completionContext(source, pos = source.length) {
    return { state: EditorState.create({ doc: source }), pos, explicit: true };
}

describe('date shortcut completions', () => {
    const now = () => new Date(2024, 0, 15, 12);

    test('offers today before tomorrow for @to', () => {
        const completions = createDateShortcutCompletionSource({ now });
        const result = completions(completionContext('@to'));

        expect(result).not.toBeNull();
        expect(result.from).toBe(0);
        expect(result.options.map(option => option.label)).toEqual(['today', 'tomorrow']);
        expect(result.options.every(option => option.commitCharacters.includes(' '))).toBe(true);
        expect(result.filter).toBe(false);
    });

    test('keeps the full shortcut order and only triggers after whitespace', () => {
        const completions = createDateShortcutCompletionSource({ now });

        expect(completions(completionContext('@')).options.map(option => option.label)).toEqual([
            'today', 'tomorrow', 'yesterday',
        ]);
        expect(completions(completionContext('@y')).options.map(option => option.label)).toEqual(['yesterday']);
        expect(completions(completionContext('name@to'))).toBeNull();
    });

    test('replaces the selected shortcut with a date link', () => {
        const completions = createDateShortcutCompletionSource({ now });
        const result = completions(completionContext('@to'));
        const dispatch = jest.fn();

        result.options[0].apply({ dispatch }, null, result.from, 3);

        const replacement = '[2024-01-15](2024-01-15.md)';
        expect(dispatch).toHaveBeenCalledWith({
            changes: { from: 0, to: 3, insert: replacement },
            selection: { anchor: replacement.length },
        });
        expect(dateShortcutLink(1, new Date(2024, 11, 31, 12))).toBe('[2025-01-01](2025-01-01.md)');
    });
});

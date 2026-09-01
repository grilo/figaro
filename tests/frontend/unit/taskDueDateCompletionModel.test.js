import {
    hashtagCompletionPlan,
    isHashtagCompletionTrigger,
    normalizedKanbanColumns,
} from '../frontend/js/core/taskDueDateCompletionModel.js';

describe('tagged-line due-date completion planning', () => {
    test('keeps saved hashtag suggestions available while the tag is being typed', () => {
        expect(hashtagCompletionPlan(
            'A long paragraph that ends with #ur',
            'A long paragraph that ends with #ur'.length,
            ['urgent'],
        )).toEqual({
            fromOffset: 32,
            prefix: 'ur',
            columns: ['urgent'],
        });
    });

    test('starts completion while typing a tag, not after Space', () => {
        expect(isHashtagCompletionTrigger('Paragraph #to')).toBe(true);
        expect(isHashtagCompletionTrigger('Paragraph #todo ')).toBe(false);
        expect(isHashtagCompletionTrigger('Paragraph #follow-up  ')).toBe(false);
        expect(isHashtagCompletionTrigger('# Heading')).toBe(false);
        expect(isHashtagCompletionTrigger('Paragraph #todo then')).toBe(false);
    });

    test('normalizes the system and saved custom column vocabulary', () => {
        expect(normalizedKanbanColumns(['Urgent', 'todo', 'bad tag', 'urgent'])).toEqual([
            'todo', 'wip', 'done', 'urgent',
        ]);
    });

});

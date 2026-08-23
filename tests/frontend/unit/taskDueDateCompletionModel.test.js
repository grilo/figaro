import {
    hashtagCompletionPlan,
    isHashtagCompletionTrigger,
    normalizedKanbanColumns,
    planTaggedLineDueDateInsertion,
    semanticDueDateLink,
    taggedLineDueDateActionPlan,
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

    test('starts completion both while typing a tag and after its trailing Space', () => {
        expect(isHashtagCompletionTrigger('Paragraph #to')).toBe(true);
        expect(isHashtagCompletionTrigger('Paragraph #todo ')).toBe(true);
        expect(isHashtagCompletionTrigger('Paragraph #follow-up  ')).toBe(true);
        expect(isHashtagCompletionTrigger('# Heading')).toBe(false);
        expect(isHashtagCompletionTrigger('Paragraph #todo then')).toBe(false);
    });

    test('offers due actions after Space on ordinary, task, and unsaved custom tags', () => {
        const ordinary = 'Call the accountant #todo ';
        expect(taggedLineDueDateActionPlan(ordinary, ordinary.length)).toEqual({
            column: 'todo',
            fromOffset: ordinary.length,
            tagEndOffset: ordinary.length - 1,
        });
        const prose = 'Discuss the launch #follow-up ';
        expect(taggedLineDueDateActionPlan(prose, prose.length)).toEqual({
            column: 'follow-up',
            fromOffset: prose.length,
            tagEndOffset: prose.length - 1,
        });
        const checked = '- [x] Published but still tagged #archive ';
        expect(taggedLineDueDateActionPlan(checked, checked.length)?.column).toBe('archive');
    });

    test('keeps completed, dated, color, heading, and malformed contexts quiet', () => {
        const done = 'Finished #done ';
        const mixedDone = 'Finished #done Follow-up #todo ';
        expect(taggedLineDueDateActionPlan(done, done.length)).toBeNull();
        expect(taggedLineDueDateActionPlan(mixedDone, mixedDone.length)).toBeNull();
        const dated = 'Prepare #todo [due 2026-08-14](2026-08-14.md) #urgent ';
        expect(taggedLineDueDateActionPlan(dated, dated.length)).toBeNull();
        const color = 'Color #bad ';
        const alphaColor = 'Color #abcd ';
        const heading = '#topic ';
        const anchor = 'Anchor](#topic) ';
        expect(taggedLineDueDateActionPlan(color, color.length)).toBeNull();
        expect(taggedLineDueDateActionPlan(alphaColor, alphaColor.length)).toBeNull();
        expect(taggedLineDueDateActionPlan(heading, heading.length)).toBeNull();
        expect(taggedLineDueDateActionPlan(anchor, anchor.length)).toBeNull();
    });

    test('normalizes the system and saved custom column vocabulary', () => {
        expect(normalizedKanbanColumns(['Urgent', 'todo', 'bad tag', 'urgent'])).toEqual([
            'todo', 'wip', 'done', 'urgent',
        ]);
    });

    test('plans portable due links from trailing tag whitespace', () => {
        expect(semanticDueDateLink('2026-08-14')).toBe('[due 2026-08-14](2026-08-14.md)');
        expect(planTaggedLineDueDateInsertion('Prepare #todo ', 14, 'todo', '2026-08-14')).toEqual({
            from: 13,
            to: 14,
            insert: ' [due 2026-08-14](2026-08-14.md)',
        });
        const middle = 'Prepare #todo next step';
        expect(planTaggedLineDueDateInsertion(middle, 14, 'todo', '2026-08-14')).toEqual({
            from: 13,
            to: 14,
            insert: ' [due 2026-08-14](2026-08-14.md) ',
        });
        expect(planTaggedLineDueDateInsertion('Prepare #todo ', 14, 'urgent', '2026-08-14')).toBeNull();
        expect(planTaggedLineDueDateInsertion('Prepare #todo ', 14, 'todo', 'not-a-date')).toBeNull();
    });
});

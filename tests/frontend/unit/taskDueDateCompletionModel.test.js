import {
    hashtagTaskCompletionPlan,
    isExplicitUnfinishedTaskLine,
    normalizedKanbanColumns,
    planTaskDueDateInsertion,
    semanticDueDateLink,
    taskDueDateCompletionText,
} from '../frontend/js/core/taskDueDateCompletionModel.js';

describe('task due-date completion planning', () => {
    test('keeps hashtag suggestions in prose without adding scheduling actions', () => {
        expect(hashtagTaskCompletionPlan(
            'A long paragraph that ends with #ur',
            'A long paragraph that ends with #ur'.length,
            ['urgent'],
        )).toEqual({
            fromOffset: 32,
            prefix: 'ur',
            columns: ['urgent'],
            dueColumn: '',
            canSchedule: false,
        });
    });

    test('offers scheduling only for an exact known tag on an unchecked task without a date', () => {
        const line = '- [ ] Prepare release #todo';
        expect(hashtagTaskCompletionPlan(line, line.length, ['urgent'])).toEqual({
            fromOffset: 22,
            prefix: 'todo',
            columns: ['todo'],
            dueColumn: 'todo',
            canSchedule: true,
        });
        expect(hashtagTaskCompletionPlan('- [x] Prepare release #todo', 27, []).dueColumn).toBe('');
        const dated = '- [ ] Prepare #todo [due 2026-08-14](2026-08-14.md)';
        expect(hashtagTaskCompletionPlan(dated, 19, []).dueColumn).toBe('');
        expect(isExplicitUnfinishedTaskLine('1. [ ] Ordered task #todo')).toBe(true);
        expect(isExplicitUnfinishedTaskLine('Paragraph #todo')).toBe(false);
    });

    test('normalizes the system and custom column vocabulary', () => {
        expect(normalizedKanbanColumns(['Urgent', 'todo', 'bad tag', 'urgent'])).toEqual([
            'todo', 'wip', 'done', 'urgent',
        ]);
    });

    test('plans portable due links without disturbing the task text', () => {
        expect(semanticDueDateLink('2026-08-14')).toBe('[due 2026-08-14](2026-08-14.md)');
        expect(taskDueDateCompletionText('todo', '2026-08-14'))
            .toBe('#todo [due 2026-08-14](2026-08-14.md)');
        expect(planTaskDueDateInsertion('- [ ] Prepare #todo', 19, 'todo', '2026-08-14')).toEqual({
            from: 19,
            to: 19,
            insert: ' [due 2026-08-14](2026-08-14.md)',
        });
        expect(planTaskDueDateInsertion('- [x] Prepare #todo', 19, 'todo', '2026-08-14')).toBeNull();
        expect(planTaskDueDateInsertion('- [ ] Prepare #todo', 19, 'todo', 'not-a-date')).toBeNull();
    });
});

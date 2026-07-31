import {
    datePickerMonth,
    dueDatePresentation,
    dueTaskSummary,
    millisecondsUntilNextLocalDay,
    parseDueDateLink,
    sortTasksByDue,
    stripDueDateLinks,
} from '../frontend/js/core/dueDateModel.js';

describe('Due date model', () => {
    test('parses only matching valid semantic Markdown date links', () => {
        const line = '- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)';
        expect(parseDueDateLink(line)).toBe('2026-08-14');
        expect(stripDueDateLinks(line)).toBe('- [ ] Submit report #todo');
        expect(parseDueDateLink('[due 2026-02-30](2026-02-30.md)')).toBe('');
        expect(parseDueDateLink('[due 2026-08-14](2026-08-15.md)')).toBe('');
    });

    test('presents overdue, today, tomorrow, and later dates with local-date semantics', () => {
        expect(dueDatePresentation('2026-08-13', '2026-08-14', 'en-US')).toEqual({ state: 'overdue', label: 'Overdue · Aug 13' });
        expect(dueDatePresentation('2026-08-14', '2026-08-14', 'en-US')).toEqual({ state: 'today', label: 'Due today' });
        expect(dueDatePresentation('2026-08-15', '2026-08-14', 'en-US')).toEqual({ state: 'upcoming', label: 'Tomorrow' });
        expect(dueDatePresentation('2026-08-20', '2026-08-14', 'en-US')).toEqual({ state: 'upcoming', label: 'Due Aug 20' });
    });

    test('counts each unfinished due task once across multiple columns', () => {
        const shared = { file: 'task.md', line: 1, due_date: '2026-08-14' };
        expect(dueTaskSummary({
            urgent: [shared],
            todo: [shared, { file: 'late.md', line: 2, due_date: '2026-08-13' }],
            done: [{ file: 'done.md', line: 1, due_date: '2026-08-14', completed: true }],
        }, '2026-08-14')).toEqual({ dueToday: 1, overdue: 1, total: 2 });
    });

    test('sorts Home tasks by overdue, today, upcoming, then undated', () => {
        expect(sortTasksByDue([
            { text: 'None' },
            { text: 'Later', due_date: '2026-08-20' },
            { text: 'Today', due_date: '2026-08-14' },
            { text: 'Late', due_date: '2026-08-13' },
        ], '2026-08-14').map(task => task.text)).toEqual(['Late', 'Today', 'Later', 'None']);
    });

    test('builds a six-week picker grid with selected and today states', () => {
        const days = datePickerMonth(2026, 7, { selected: '2026-08-14', today: '2026-08-04' });
        expect(days).toHaveLength(42);
        expect(days.find(day => day.date === '2026-08-14').selected).toBe(true);
        expect(days.find(day => day.date === '2026-08-04').today).toBe(true);
    });

    test('plans the next local-day refresh without relying on UTC', () => {
        expect(millisecondsUntilNextLocalDay(new Date(2026, 7, 14, 23, 59, 59, 0))).toBe(1050);
    });
});

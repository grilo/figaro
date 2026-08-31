import {
    planTaskItemDueDateSelection,
    planTaskItemKanbanSelection,
    taskItemActionPlan,
} from '../../../frontend/js/core/taskItemActionModel.js';

describe('task item action planning', () => {
    test('offers actions only for unfinished bullet-list tasks', () => {
        expect(taskItemActionPlan('- [ ] Ship release')).toEqual({
            dueDate: '',
            completionOffset: '- [ ] Ship release'.length,
        });
        expect(taskItemActionPlan('  * [ ] Nested task')).not.toBeNull();
        expect(taskItemActionPlan('- [x] Finished')).toBeNull();
        expect(taskItemActionPlan('Plain [ ] text')).toBeNull();
    });

    test('produces the same canonical order whether Calendar or Kanban is selected first', () => {
        const dueFirst = planTaskItemDueDateSelection('- [ ] Ship release', '2026-09-14');
        expect(dueFirst.text).toBe('- [ ] Ship release [due 2026-09-14](2026-09-14.md)');
        expect(planTaskItemKanbanSelection(dueFirst.text, 'urgent').text).toBe(
            '- [ ] Ship release #urgent [due 2026-09-14](2026-09-14.md)',
        );

        const kanbanFirst = planTaskItemKanbanSelection('- [ ] Ship release', 'urgent');
        expect(kanbanFirst.text).toBe('- [ ] Ship release #urgent');
        expect(planTaskItemDueDateSelection(kanbanFirst.text, '2026-09-14').text).toBe(
            '- [ ] Ship release #urgent [due 2026-09-14](2026-09-14.md)',
        );
    });

    test('canonicalizes a due-before-tag line without duplicating an existing column', () => {
        const source = '- [ ] Ship [due 2026-09-14](2026-09-14.md) #urgent';
        expect(taskItemActionPlan(source).dueDate).toBe('2026-09-14');
        expect(planTaskItemKanbanSelection(source, 'urgent').text).toBe(
            '- [ ] Ship #urgent [due 2026-09-14](2026-09-14.md)',
        );
        expect(planTaskItemDueDateSelection(source, '2026-09-15').text).toBe(
            '- [ ] Ship #urgent [due 2026-09-15](2026-09-15.md)',
        );
    });

    test('clears a due date without disturbing authored task spacing away from the link', () => {
        expect(planTaskItemDueDateSelection(
            '- [ ] Keep  deliberate spacing #todo [due 2026-09-14](2026-09-14.md)',
            '',
        ).text).toBe('- [ ] Keep  deliberate spacing #todo');
        expect(planTaskItemKanbanSelection('- [ ] Task', 'bad tag')).toBeNull();
    });
});

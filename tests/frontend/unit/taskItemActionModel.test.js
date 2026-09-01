import { taskItemActionPlan, planTaskItemKanbanSelection } from '../../../frontend/js/core/taskItemActionModel.js';

test('task actions remain available only on unfinished checklist items', () => {
    expect(taskItemActionPlan('- [ ] Ship')).toEqual({ completionOffset: 10 });
    expect(taskItemActionPlan('- [x] Done')).toBeNull();
    expect(taskItemActionPlan('Plain prose')).toBeNull();
});
test('assigning a column preserves ordinary Markdown, including old due-looking links', () => {
    const source = '- [ ] Ship [due 2026-09-14](2026-09-14.md) #urgent';
    expect(planTaskItemKanbanSelection(source, 'urgent').text).toBe(source);
    expect(planTaskItemKanbanSelection(source, 'todo').text).toBe(source.replace('#urgent', '#todo'));
    expect(planTaskItemKanbanSelection('- [ ] Task', 'bad tag')).toBeNull();
});
test('column selection appends with zero or multiple hashtags and replaces only a single hashtag', () => {
    expect(planTaskItemKanbanSelection('- [ ] Task', 'wip').text).toBe('- [ ] Task #wip');
    expect(planTaskItemKanbanSelection('- [ ] Task #TODO later', 'wip').text).toBe('- [ ] Task #wip later');
    expect(planTaskItemKanbanSelection('- [ ] Task #todo #urgent', 'wip').text).toBe('- [ ] Task #todo #urgent #wip');
    expect(planTaskItemKanbanSelection('- [ ] Task #todo #wip', 'wip').text).toBe('- [ ] Task #todo #wip');
});
test('column selection leaves hashes in code, links, colors, and escaped text alone', () => {
    const source = '- [ ] Task `#code #other` [link](#section) #fff \\#escaped #todo';
    expect(planTaskItemKanbanSelection(source, 'wip').text).toBe(source.replace('#todo', '#wip'));
});

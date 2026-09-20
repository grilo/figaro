import { createKanbanBufferProjection, overlayKanbanCards } from '../../../frontend/js/core/kanbanBufferModel.js';

test('dirty task projection parses each changed buffer once and retains cards across prose edits', () => {
    const parse = jest.fn((file, content) => content.split('\n').flatMap((text, index) => text.includes('#todo')
        ? [{ file, line: index + 1, text, source: text, tag: 'todo' }] : []));
    const project = createKanbanBufferProjection(parse);
    const snapshots = new Map([['one.md', 'Task #todo\nProse'], ['two.md', 'Second #todo']]);
    const initial = project(snapshots);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(project(snapshots)).toBe(initial);
    snapshots.set('one.md', 'Task #todo\nEdited prose');
    expect(project(snapshots)).toBe(initial);
    expect(parse).toHaveBeenCalledTimes(3);
    snapshots.set('one.md', '\nTask #todo\nEdited prose');
    const moved = project(snapshots);
    expect(moved).not.toBe(initial);
    expect(moved.get('one.md')[0].line).toBe(2);
    expect(moved.get('two.md')).toBe(initial.get('two.md'));
    snapshots.delete('two.md');
    expect(project(snapshots).has('two.md')).toBe(false);
    snapshots.set('two.md', 'Second #todo');
    parse.mockClear(); project(snapshots);
    expect(parse).toHaveBeenCalledTimes(1);
});

test('dirty projections replace saved tasks, including empty projections and tag removal', () => {
    const saved = { todo: [{ file: 'one.md', text: 'Old' }, { file: 'two.md', text: 'Kept' }] };
    expect(overlayKanbanCards(saved, new Map([['one.md', []]]))).toEqual({ todo: [saved.todo[1]] });
    expect(saved.todo).toHaveLength(2);
});

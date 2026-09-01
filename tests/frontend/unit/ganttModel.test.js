import { ganttTasks, ganttBarGeometry, moveGanttDates, dayDistance, ganttWindow, ganttSummary } from '../frontend/js/core/ganttModel.js';

const task = { file: 'tasks.md', line: 1, text: 'Task', source: 'Task #todo', tag: 'todo', due_date: '2026-09-01' };
describe('Gantt schedule projection and gestures', () => {
    test('deduplicates task tags, colors by column and fades done without losing dates', () => {
        const rows = ganttTasks({ todo: [task], done: [{ ...task, tag: 'done' }] }, [], { done: '#12ab34' });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ done: true, color: '#12ab34', end: '2026-09-01' });
    });
    test('fresh metadata overrides stale board dates, including explicitly unscheduled tasks', () => {
        const entries = [{ id: '1', task, start: '', end: '' }];
        expect(ganttTasks({ todo: [task] }, entries)[0]).toMatchObject({ end: '', scheduleID: '1' });
        expect(ganttTasks({ todo: [{ ...task, source: 'New task #todo', due_date: '' }] }, entries)[0].scheduleID).toBe('');
    });
    test('moves whole ranges, resizes either edge, clamps inverted ranges and preserves end-only markers', () => {
        const range = { start: '2026-08-30', end: '2026-09-02' };
        expect(moveGanttDates(range, 'move', 2)).toEqual({ start: '2026-09-01', end: '2026-09-04' });
        expect(moveGanttDates(range, 'start', 20)).toEqual({ start: '2026-09-02', end: '2026-09-02' });
        expect(moveGanttDates(range, 'end', -20)).toEqual({ start: '2026-08-30', end: '2026-08-30' });
        expect(moveGanttDates({ start: '', end: '2026-09-02' }, 'move', 1)).toEqual({ start: '', end: '2026-09-03' });
        expect(range).toEqual({ start: '2026-08-30', end: '2026-09-02' });
    });
    test('uses inclusive day widths across DST, clips ranges and bounds mounted rows', () => {
        expect(dayDistance('2026-03-28', '2026-03-30')).toBe(2);
        expect(ganttBarGeometry({ start: '2026-08-30', end: '2026-09-01' }, '2026-08-31')).toEqual({ left: 0, width: 88, clippedStart: true, clippedEnd: false });
        expect(ganttBarGeometry({ end: '2026-08-01' }, '2026-08-31')).toBeNull();
        const window = ganttWindow(10000, 48000);
        expect(window.end - window.start).toBeLessThanOrEqual(80);
        expect(window.start).toBeGreaterThan(900);
        expect(ganttSummary([{ end: '2026-09-01', done: true }, { end: '' }], 2)).toBe('1 scheduled · 1 unscheduled · 1 done · 2 need reconnection');
    });
});

test('start-only tasks render ongoing work and moving them does not invent a deadline', () => {
    const task = { start: '2026-08-31', end: '' };
    expect(ganttBarGeometry(task, '2026-08-31', 42, '2026-09-02').width).toBe(132);
    expect(moveGanttDates(task, 'move', 1)).toEqual({ start: '2026-09-01', end: '' });
    expect(ganttSummary([task])).toBe('1 scheduled · 0 unscheduled · 0 done');
    expect(ganttBarGeometry({ start: '2026-09-02', end: '2026-08-31' }, '2026-08-31').width).toBe(132);
});

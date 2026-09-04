import { createKanbanGantt } from '../frontend/js/kanbanGantt.js';
import { mountKanbanWorkspace, configureKanbanWorkspace } from '../frontend/js/kanban.js';
import { setState } from '../frontend/js/state.js';
import { testUtils } from './test_setup.js';

const mockPicker = jest.fn();
jest.mock('../frontend/js/datePicker.js', () => ({
    openDatePicker: (...args) => mockPicker(...args),
    closeDatePicker: (...args) => jest.requireActual('../frontend/js/datePicker.js').closeDatePicker(...args),
}));
const realDatePicker = jest.requireActual('../frontend/js/datePicker.js');
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const card = { file: 'tasks.md', file_name: 'tasks.md', line: 1, text: 'Ship', source: 'Ship #todo', tag: 'todo' };
const schedules = [{ id: 'one', task: card, start: '2026-08-31', end: '2026-09-02' }];
const chooseDate = (root, field, value) => {
    root.querySelector(`[data-date="${field}"]`).click();
    return mockPicker.mock.calls.at(-1)[0].onSelect(value);
};
const pointer = (el, type, x) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    el.dispatchEvent(event);
};

describe('Kanban Gantt view adapter', () => {
    let root, session, save, open, status;
    beforeEach(() => {
        document.body.innerHTML = '<div id="gantt"></div>';
        root = document.getElementById('gantt');
        save = jest.fn().mockResolvedValue(null); open = jest.fn(); status = jest.fn();
        session = createKanbanGantt(root, { saveSchedule: save, openTask: open, setStatus: status, now: () => new Date(2026, 7, 31, 12) });
        session.update({ todo: [card] }, schedules, { todo: '#d8574a' }); session.setActive(true);
        mockPicker.mockReset();
    });
    afterEach(() => session.dispose());
    test('applies each date and clearing immediately without Save/Cancel; Escape only closes the prompt', async () => {
        root.querySelector('.kanban-gantt-bar').click();
        expect(root.querySelector('[data-edit="save"], [data-edit="cancel"]')).toBeNull();
        expect(root.querySelector('[data-edit="clear"]').disabled).toBe(false);
        root.querySelector('[data-edit="open"]').click(); expect(open).toHaveBeenCalledWith(expect.objectContaining(card));
        root.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(save).not.toHaveBeenCalled();
        expect(root.querySelector('[role="dialog"]')).toBeNull();
        root.querySelector('.kanban-gantt-bar').click();
        root.querySelector('[data-date="start"]').click();
        expect(mockPicker).toHaveBeenCalledWith(expect.objectContaining({ ariaLabel: 'Choose start date', clearLabel: 'Clear start date' }));
        await mockPicker.mock.calls[0][0].onSelect('2026-08-30');
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '2026-08-30', end: '2026-09-02' }, 'one');
        expect(root.querySelector('[data-date="start"]').textContent).toContain('30');
        await chooseDate(root, 'end', '2026-09-05');
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '2026-08-30', end: '2026-09-05' }, 'one');
        await chooseDate(root, 'end', '');
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '2026-08-30', end: '' }, 'one');
        root.querySelector('[data-edit="clear"]').click(); await flush();
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '', end: '' }, 'one');
        expect(root.querySelector('[data-edit="clear"]').disabled).toBe(true);
        expect(save).toHaveBeenCalledTimes(4);
        root.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(save).toHaveBeenCalledTimes(4);
        expect(document.activeElement.dataset.task).toBeTruthy();
    });
    test('keeps Unscheduled disabled until an undated task has at least one saved date', async () => {
        const undated = { ...card, line: 2, text: 'Undated', source: 'Undated #todo' };
        session.update({ todo: [undated] }, [], {});
        root.querySelector('.kanban-gantt-unscheduled').click();
        const clear = root.querySelector('[data-edit="clear"]');
        expect(clear.disabled).toBe(true);
        await chooseDate(root, 'start', '2026-08-31');
        expect(clear.disabled).toBe(false);
    });
    test('outside pointer presses dismiss the schedule inspector without swallowing the next action', () => {
        root.querySelector('.kanban-gantt-bar').click();
        const inspector = root.querySelector('[role="dialog"]');
        pointer(inspector.querySelector('strong'), 'pointerdown', 0);
        expect(inspector.isConnected).toBe(true);

        const outside = document.createElement('button');
        document.body.appendChild(outside);
        const clicked = jest.fn(() => outside.focus());
        outside.addEventListener('click', clicked);
        pointer(outside, 'pointerdown', 0); outside.click();
        expect(inspector.isConnected).toBe(false);
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(outside);
        expect(save).not.toHaveBeenCalled();

        root.querySelector('.kanban-gantt-bar').click();
        pointer(root.querySelector('.kanban-gantt-lane'), 'pointerdown', 0);
        expect(root.querySelector('[role="dialog"]')).toBeNull();
    });
    test.each(['start', 'end'])('the nested %s calendar remains interactive; Escape closes each popup in order', async field => {
        mockPicker.mockImplementation(realDatePicker.openDatePicker);
        root.querySelector('.kanban-gantt-bar').click();
        const inspector = root.querySelector('[role="dialog"]');
        const dateButton = inspector.querySelector(`[data-date="${field}"]`);
        dateButton.click();
        const calendar = document.querySelector('.ui-date-picker');
        const nextMonth = calendar.querySelector('[data-date-picker-nav="next"]');
        pointer(nextMonth, 'pointerdown', 0); nextMonth.click();
        expect(inspector.isConnected).toBe(true);
        expect(calendar.isConnected).toBe(true);
        const day = calendar.querySelector('[data-date-picker-day]');
        day.focus();
        day.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(calendar.isConnected).toBe(false);
        expect(inspector.isConnected).toBe(true);
        expect(document.activeElement).toBe(dateButton);
        expect(save).not.toHaveBeenCalled();

        dateButton.click();
        const selectedDay = document.querySelector('.ui-date-picker [data-date-picker-day]');
        const value = selectedDay.dataset.datePickerDay;
        pointer(selectedDay, 'pointerdown', 0); selectedDay.click(); await flush();
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith(expect.objectContaining(card), expect.objectContaining({ [field]: value }), 'one');
        expect(inspector.isConnected).toBe(true);
        expect(document.querySelector('.ui-date-picker')).toBeNull();
        expect(document.activeElement).toBe(dateButton);
        dateButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(inspector.isConnected).toBe(false);
        expect(document.activeElement.dataset.task).toBeTruthy();
        expect(save).toHaveBeenCalledTimes(1);
    });
    test('clicking outside a nested calendar closes both popups and allows another task to open', () => {
        mockPicker.mockImplementation(realDatePicker.openDatePicker);
        const other = { ...card, line: 2, text: 'Review', source: 'Review #todo' };
        session.update({ todo: [card, other] }, schedules, {});
        root.querySelector('.kanban-gantt-bar').click();
        root.querySelector('[data-date="end"]').click();
        const oldInspector = root.querySelector('[role="dialog"]');
        const otherTask = [...root.querySelectorAll('.kanban-gantt-name [data-task]')].at(-1);
        pointer(otherTask, 'pointerdown', 0);
        expect(oldInspector.isConnected).toBe(false);
        expect(document.querySelector('.ui-date-picker')).toBeNull();
        otherTask.click();
        expect(root.querySelector('[role="dialog"] strong').textContent).toBe('Review');
        expect(save).not.toHaveBeenCalled();
    });
    test.each(['success', 'failure'])('outside dismissal during a pending %s never reopens or steals focus', async outcome => {
        let finish, fail;
        save.mockReturnValue(new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
        root.querySelector('.kanban-gantt-bar').click();
        chooseDate(root, 'end', '2026-09-05');
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        pointer(outside, 'pointerdown', 0); outside.focus();
        expect(root.querySelector('[role="dialog"]')).toBeNull();
        if (outcome === 'success') finish();
        else fail(new Error('Read only'));
        await flush();
        expect(root.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(outside);
        expect(save).toHaveBeenCalledTimes(1);
        if (outcome === 'failure') expect(root.querySelector('[role="alert"]').textContent).toContain('Read only');
    });
    test.each(['outside', 'escape', 'deactivate', 'dispose'])('%s releases inspector document listeners and its calendar', action => {
        mockPicker.mockImplementation(realDatePicker.openDatePicker);
        const add = jest.spyOn(document, 'addEventListener');
        const remove = jest.spyOn(document, 'removeEventListener');
        root.querySelector('.kanban-gantt-bar').click();
        const pointerHandler = add.mock.calls.find(([type]) => type === 'pointerdown')[1];
        const keyHandler = add.mock.calls.find(([type]) => type === 'keydown')[1];
        root.querySelector('[data-date="end"]').click();
        if (action === 'outside') pointer(document.body, 'pointerdown', 0);
        else if (action === 'escape') root.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        else if (action === 'deactivate') session.setActive(false);
        else session.dispose();
        expect(root.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector('.ui-date-picker')).toBeNull();
        expect(remove).toHaveBeenCalledWith('pointerdown', pointerHandler, true);
        expect(remove).toHaveBeenCalledWith('keydown', keyHandler);
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.body.dispatchEvent(escape);
        expect(escape.defaultPrevented).toBe(false);
        add.mockRestore(); remove.mockRestore();
    });
    test('pointer moves preview dates; pointer release writes once, while Escape and pointer cancellation write nothing', async () => {
        let bar = root.querySelector('.kanban-gantt-bar');
        pointer(bar, 'pointerdown', 100); pointer(bar, 'pointermove', 145); pointer(bar, 'pointermove', 188);
        expect(save).not.toHaveBeenCalled();
        pointer(bar, 'pointerup', 188); await flush();
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '2026-09-02', end: '2026-09-04' }, 'one');
        bar = root.querySelector('.kanban-gantt-bar');
        pointer(bar, 'pointerdown', 100); pointer(bar, 'pointermove', 200);
        bar.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
        expect(save).toHaveBeenCalledTimes(1);
        bar = root.querySelector('.kanban-gantt-bar');
        pointer(bar, 'pointerdown', 100); pointer(bar, 'pointermove', 200); pointer(bar, 'pointercancel', 200);
        expect(save).toHaveBeenCalledTimes(1);
    });
    test('resize handles resize only their edge and failed persistence keeps a visible error', async () => {
        save.mockRejectedValueOnce(new Error('Disk is read only'));
        const handle = root.querySelector('[data-resize="end"]');
        pointer(handle, 'pointerdown', 100); pointer(handle, 'pointermove', 144); pointer(handle, 'pointerup', 144); await flush();
        expect(save).toHaveBeenCalledWith(expect.objectContaining(card), { start: '2026-08-31', end: '2026-09-03' }, 'one');
        expect(root.querySelector('[role="alert"]').textContent).toContain('Disk is read only');
        expect(root.querySelector('[aria-busy="true"]')).toBeNull();
    });
    test('one-day bars resize from either visual edge when the webview retargets the pointer to the bar', async () => {
        const oneDay = [{ ...schedules[0], start: '2026-08-31', end: '2026-08-31' }];
        session.update({ todo: [card] }, oneDay, { todo: '#d8574a' });
        const bar = root.querySelector('.kanban-gantt-bar');
        bar.getBoundingClientRect = () => ({ left: 100, right: 138, width: 38, top: 0, bottom: 34, height: 34, x: 100, y: 0 });

        pointer(bar, 'pointerdown', 104); pointer(bar, 'pointermove', 60); pointer(bar, 'pointerup', 60); await flush();
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '2026-08-30', end: '2026-08-31' }, 'one');

        pointer(bar, 'pointerdown', 134); pointer(bar, 'pointermove', 178); pointer(bar, 'pointerup', 178); await flush();
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '2026-08-31', end: '2026-09-01' }, 'one');

        pointer(bar, 'pointerdown', 119); pointer(bar, 'pointermove', 163); pointer(bar, 'pointerup', 163); await flush();
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining(card), { start: '2026-09-01', end: '2026-09-01' }, 'one');
    });
    test('uses one shared today line across the heading, rows, and empty timeline height', () => {
        expect(root.style.getPropertyValue('--gantt-today-color')).toBe('var(--accent-color)');
        expect(root.querySelector('.kanban-gantt-day.is-today')).not.toBeNull();
        expect(root.querySelectorAll('.kanban-gantt-lane [data-resize]')).toHaveLength(2);
        expect([...root.querySelectorAll('.kanban-gantt-handle')].every(handle => (
            handle.classList.contains('ui-image-resize-handle')
        ))).toBe(true);
        session.update({}, [], {});
        expect(root.querySelector('.kanban-gantt-grid')).not.toBeNull();
        expect(root.querySelector('.kanban-gantt-rows').childElementCount).toBe(0);
    });
    test('shows unresolved metadata with a themed task choice and blocks writes when loading fails', () => {
        session.update({ todo: [card] }, [{ id: 'old', task: null, text: 'Old title', file: 'tasks.md', start: '', end: '2026-09-01' }], {});
        root.querySelector('[data-reconnect]').click();
        expect(root.querySelector('[role="combobox"]').getAttribute('aria-label')).toBe('Reconnect to task');
        root.querySelector('[data-edit="reconnect"]').click();
        expect(save).toHaveBeenCalledWith(expect.objectContaining(card), { start: '', end: '2026-09-01' }, 'old');
        session.update({ todo: [card] }, [], {}, 'Invalid metadata preserved');
        expect(root.querySelector('[role="alert"]').textContent).toBe('Invalid metadata preserved');
    });
    test('updates only the supplied application status port and releases its DOM on disposal', () => {
        expect(status).toHaveBeenLastCalledWith('1 scheduled · 0 unscheduled · 0 done');
        expect(root.querySelector('footer')).toBeNull();
        session.dispose(); expect(root.childElementCount).toBe(0);
        const count = status.mock.calls.length; session.update({}, [], {}); expect(status).toHaveBeenCalledTimes(count);
    });
    test('keeps an empty-board status centered outside the horizontally scrolled timeline track', () => {
        const scroll = root.querySelector('.kanban-gantt-scroll');
        scroll.scrollLeft = 900;
        session.update({}, [], {});

        const empty = root.querySelector('.kanban-gantt-empty');
        expect(empty.hidden).toBe(false);
        expect(empty.getAttribute('role')).toBe('status');
        expect(empty.textContent).toContain('No tasks yet');
        expect(empty.parentElement).toBe(root);
        expect(root.querySelector('.kanban-gantt-help').hidden).toBe(true);
        expect(root.querySelector('.kanban-gantt-rows').childElementCount).toBe(0);

        session.update({ todo: [card] }, schedules, {});
        expect(empty.hidden).toBe(true);
        expect(root.querySelector('.kanban-gantt-help').hidden).toBe(false);
    });
    test('keeps task bars and names mounted while paging and reprojection update their geometry', () => {
        const bar = root.querySelector('.kanban-gantt-bar');
        const name = root.querySelector('.kanban-gantt-name [data-task]');
        bar.focus();
        root.querySelector('[data-range="7"]').click();
        expect(root.querySelector('.kanban-gantt-bar')).toBe(bar);
        expect(root.querySelector('.kanban-gantt-name [data-task]')).toBe(name);
        expect(document.activeElement).toBe(bar);
        session.update({ todo: [card] }, [{ ...schedules[0], end: '2026-09-05' }], {});
        expect(root.querySelector('.kanban-gantt-bar')).toBe(bar);
        expect(bar.getAttribute('aria-label')).toContain('5');
    });
    test('navigates beyond the mounted Gantt window with End/Home and cancels panning', () => {
        session.update({ todo: Array.from({ length: 200 }, (_, i) => ({ ...card, line: i + 1, text: `Task ${i + 1}` })) }, [], {});
        const first = root.querySelector('.kanban-gantt-name [data-task]');
        first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement.textContent).toContain('Task 200');
        expect(root.querySelectorAll('.kanban-gantt-row').length).toBeLessThanOrEqual(80);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(document.activeElement.textContent).toContain('Task 1');
        const scroll = root.querySelector('.kanban-gantt-scroll');
        Object.defineProperty(scroll, 'scrollWidth', { value: 2000 });
        Object.defineProperty(scroll, 'clientWidth', { value: 500 });
        scroll.scrollLeft = 50;
        pointer(scroll, 'pointerdown', 150); pointer(scroll, 'pointermove', 100);
        expect(scroll.scrollLeft).toBe(100);
        pointer(scroll, 'pointercancel', 100);
        expect(scroll.scrollLeft).toBe(50); expect(save).not.toHaveBeenCalled();
    });
    test('coalesces rapid vertical scroll events into one row-window render frame', () => {
        const frames = [];
        const request = jest.spyOn(window, 'requestAnimationFrame')
            .mockImplementation(callback => { frames.push(callback); return frames.length; });
        const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
        const scroll = root.querySelector('.kanban-gantt-scroll');
        Object.defineProperty(scroll, 'scrollWidth', { value: 5000 });
        Object.defineProperty(scroll, 'clientWidth', { value: 500 });
        scroll.scrollLeft = 2000;
        session.update({ todo: Array.from({ length: 400 }, (_, i) => ({
            ...card, line: i + 1, text: `Task ${i + 1}`,
        })) }, [], {});

        scroll.scrollTop = 3200;
        scroll.dispatchEvent(new Event('scroll'));
        scroll.scrollTop = 6400;
        scroll.dispatchEvent(new Event('scroll'));
        scroll.scrollTop = 9600;
        scroll.dispatchEvent(new Event('scroll'));

        expect(frames).toHaveLength(1);
        frames[0]();
        expect(root.querySelector('.kanban-gantt-name [data-task]').textContent).toContain('Task 195');
        session.dispose();
        expect(cancelFrame).not.toHaveBeenCalled();
        request.mockRestore();
        cancelFrame.mockRestore();
    });
    test('Escape closes during immediate persistence without cancelling it or reviving the prompt', async () => {
        let finish;
        save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        root.querySelector('.kanban-gantt-bar').click();
        chooseDate(root, 'end', '2026-09-05');
        mockPicker.mock.calls.at(-1)[0].onSelect('2026-09-06');
        expect(save).toHaveBeenCalledTimes(1);
        expect(root.getAttribute('aria-busy')).toBe('true');
        // Browsers may blur the focused date control when persistence disables it.
        document.activeElement.blur();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(root.querySelector('[role="dialog"]')).toBeNull();
        finish(); await flush();
        expect(root.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement.dataset.task).toBeTruthy();
        expect(save).toHaveBeenCalledTimes(1);
    });
    test('failed immediate edits preserve the last saved date and allow choosing it again to retry', async () => {
        save.mockRejectedValueOnce(new Error('Read only'));
        root.querySelector('.kanban-gantt-bar').click();
        const previous = root.querySelector('[data-date="end"]').textContent;
        await chooseDate(root, 'end', '2026-09-05');
        expect(root.querySelector('[data-date="end"]').textContent).toBe(previous);
        expect(root.querySelector('[role="alert"]').textContent).toContain('Read only');
        await chooseDate(root, 'end', '2026-09-05');
        expect(root.querySelector('[data-date="end"]').textContent).toContain('5');
        expect(save).toHaveBeenCalledTimes(2);
    });
    test('ignores late date-picker callbacks and persistence after disposal', async () => {
        let finish;
        save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        root.querySelector('.kanban-gantt-bar').click();
        chooseDate(root, 'end', '2026-09-05');
        session.dispose(); finish(); await flush();
        mockPicker.mock.calls.at(-1)[0].onSelect('2026-09-06');
        expect(save).toHaveBeenCalledTimes(1);
        expect(root.childElementCount).toBe(0);
    });
});

test('Board/Gantt share the application status bar, refuse dirty scheduling, and restore buffer status on leaving', async () => {
    testUtils.createMockDOM();
    document.querySelector('.status-right').innerHTML += '<div id="gantt-status-content"></div>';
    const panel = document.createElement('div'); document.body.appendChild(panel);
    const openTab = jest.fn(); configureKanbanWorkspace({ openTab, openFile: jest.fn() });
    const app = window.go.desktop.App;
    app.GetKanbanBoard.mockResolvedValue({ todo: [card] }); app.GetTaskSchedules.mockResolvedValue(schedules);
    setState('openTabs', []);
    const session = mountKanbanWorkspace(panel); await flush();
    panel.querySelector('[data-kanban-view="gantt"]').click();
    expect(document.querySelector('.status-right').dataset.mode).toBe('gantt');
    expect(document.getElementById('gantt-status-content').textContent).toContain('1 scheduled');
    panel.querySelector('.kanban-gantt-bar').click(); panel.querySelector('[data-edit="open"]').click();
    expect(openTab).toHaveBeenCalledWith('tasks.md', 'tasks.md', 'file', { path: 'tasks.md', line: 1 });
    setState('openTabs', [{ type: 'file', path: 'tasks.md', dirty: true, _content: 'Edited #todo' }]);
    await chooseDate(panel, 'end', '2026-09-05'); await flush();
    expect(app.SetTaskSchedule).not.toHaveBeenCalled();
    expect(panel.querySelector('.kanban-gantt-notice').textContent).toContain('Save changes');
    panel.querySelector('[data-kanban-view="board"]').click();
    expect(document.querySelector('.status-right').dataset.mode).toBe('buffer');
    panel.querySelector('[data-kanban-view="gantt"]').click();
    document.dispatchEvent(new CustomEvent('active-tab-changed', { detail: { type: 'file' } }));
    expect(document.querySelector('.status-right').dataset.mode).toBe('buffer');
    session.dispose();
});

test('saving Gantt dates invalidates Calendar deadlines even if the subsequent board refresh fails', async () => {
    testUtils.createMockDOM();
    const panel = document.createElement('div'); document.body.appendChild(panel);
    configureKanbanWorkspace({ openTab: jest.fn(), openFile: jest.fn() });
    const app = window.go.desktop.App;
    app.GetKanbanBoard.mockResolvedValue({ todo: [card] });
    app.GetTaskSchedules.mockResolvedValue(schedules);
    app.SetTaskSchedule.mockResolvedValue(undefined);
    setState('openTabs', []);
    const changed = jest.fn();
    document.addEventListener('calendar-data-changed', changed);
    const session = mountKanbanWorkspace(panel); await flush();
    try {
        panel.querySelector('[data-kanban-view="gantt"]').click();
        panel.querySelector('.kanban-gantt-bar').click();
        app.GetTaskSchedules.mockRejectedValueOnce(new Error('Refresh unavailable'));
        await chooseDate(panel, 'end', '2026-09-05'); await flush();
        expect(changed).toHaveBeenCalledTimes(1);
        expect(panel.querySelector('.kanban-gantt-notice').textContent).toContain('Dates saved');
        await chooseDate(panel, 'end', '2026-09-05'); await flush();
        expect(changed).toHaveBeenCalledTimes(2);
        expect(panel.querySelector('.kanban-gantt-notice').hidden).toBe(true);
    } finally {
        document.removeEventListener('calendar-data-changed', changed);
        session.dispose();
    }
});

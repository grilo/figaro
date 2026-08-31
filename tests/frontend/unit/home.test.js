import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/tabManager.js', () => ({
    openTab: jest.fn(),
    switchTab: jest.fn(),
}));

import { openTab } from '../frontend/js/tabManager.js';
import { setState } from '../frontend/js/state.js';
import { configureHomeWorkspace, homeTaskLimit, renderHome } from '../frontend/js/home.js';

function deferred() {
    let resolve;
    const promise = new Promise(finish => { resolve = finish; });
    return { promise, resolve };
}

const fixedNow = () => new Date(2024, 0, 15, 10, 30, 0);

describe('Today workspace overview', () => {
    beforeEach(() => {
        configureHomeWorkspace({ openTab });
        testUtils.createMockDOM();
        jest.clearAllMocks();

        setState('fileTreeData', [
            {
                name: 'Inbox', path: 'Inbox', type: 'directory', children: [
                    { name: 'Capture.md', path: 'Inbox/Capture.md', type: 'file', mtime: 20 },
                ],
            },
            {
                name: 'Projects', path: 'Projects', type: 'directory', children: [
                    { name: 'Plan.md', path: 'Projects/Plan.md', type: 'file', mtime: 10 },
                ],
            },
            { name: 'Reference.md', path: 'Reference.md', type: 'file', mtime: 5 },
        ]);
        setState('recentFiles', [{ path: 'Projects/Plan.md', title: 'Project plan' }]);
        window.go.desktop.App.GetTodayLink.mockReturnValue('2024-01-15');
        window.go.desktop.App.GetFileTreeStyles.mockResolvedValue({
            version: 1,
            entries: { Projects: { pinned: true } },
            recent_icons: [],
        });
        window.go.desktop.App.GetHomeTasks.mockResolvedValue([
            { file: 'Projects/Plan.md', file_name: 'Plan.md', line: 12, text: 'Clarify the next milestone', tag: 'todo' },
        ]);
        window.go.desktop.App.GetDueTaskSummary.mockResolvedValue({ due_today: 0, overdue: 0 });
    });

    test('makes Today the primary action and balances Inbox, tasks, pins, recent notes, and rediscovery', async () => {
        const panel = document.getElementById('tab-panels');
        renderHome(panel, { now: fixedNow, locale: 'en-US' });
        await Promise.resolve();
        await Promise.resolve();

        expect(panel.querySelector('h1').textContent).toContain('Today');
        expect(panel.querySelector('.home-eyebrow').textContent).toContain('Monday, January 15');
        expect(panel.querySelector('[data-home-action="today"]').textContent).toContain('Create today’s note');
        expect(panel.querySelectorAll('.home-card')).toHaveLength(4);
        expect(panel.querySelector('.home-inbox-card').textContent).toContain('Capture.md');
        expect(panel.querySelector('.home-tasks-card').textContent).toContain('Clarify the next milestone');
        expect(panel.querySelector('.home-pinned-card').textContent).toContain('Inbox');
        expect(panel.querySelector('.home-pinned-card').textContent).toContain('Projects');
        expect(panel.querySelector('.home-pinned-card').textContent).toContain('Reference.md');
        expect(panel.querySelector('.home-recent-card').textContent).toContain('Project plan');
        expect(window.go.desktop.App.GetHomeTasks).toHaveBeenCalledWith(homeTaskLimit);
        expect(window.go.desktop.App.GetDueTaskSummary).toHaveBeenCalled();
        expect(window.go.desktop.App.GetKanbanBoard).not.toHaveBeenCalled();
    });

    test('opens an existing Today note without attempting to recreate it', async () => {
        setState('fileTreeData', [
            { name: '2024-01-15.md', path: '2024-01-15.md', type: 'file', mtime: 30 },
        ]);
        const panel = document.getElementById('tab-panels');
        renderHome(panel, { now: fixedNow, locale: 'en-US' });

        panel.querySelector('[data-home-action="today"]').click();
        await testUtils.waitFor(0);

        expect(window.go.desktop.App.CreateFile).not.toHaveBeenCalled();
        expect(window.go.desktop.App.CreateDirectory).not.toHaveBeenCalled();
        expect(openTab).toHaveBeenCalledWith('2024-01-15.md', '2024-01-15.md', 'file', {
            path: '2024-01-15.md',
            line: undefined,
            mtime: 30,
        });
    });

    test('creates a missing Today note without overwriting and requests a tree refresh', async () => {
        const refresh = jest.fn();
        document.addEventListener('vault-tree-refresh-requested', refresh, { once: true });
        window.go.desktop.App.CreateFile.mockResolvedValueOnce({
            success: true,
            path: 'Inbox/2024-01-15.md',
            mtime: 31,
        });
        const panel = document.getElementById('tab-panels');
        renderHome(panel, { now: fixedNow, locale: 'en-US' });

        panel.querySelector('[data-home-action="today"]').click();
        await testUtils.waitFor(0);

        expect(window.go.desktop.App.CreateDirectory).toHaveBeenCalledWith('Inbox');
        expect(window.go.desktop.App.CreateFile).toHaveBeenCalledWith('Inbox/2024-01-15.md', '# 2024-01-15\n\n');
        expect(refresh).toHaveBeenCalled();
        expect(openTab).toHaveBeenCalledWith('Inbox/2024-01-15.md', '2024-01-15.md', 'file', {
            path: 'Inbox/2024-01-15.md',
            line: undefined,
            mtime: 31,
        });
    });

    test('keeps Today visible with an inline error when creation fails', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        window.go.desktop.App.CreateFile.mockResolvedValueOnce({ success: false, error: 'Vault is read-only' });
        const panel = document.getElementById('tab-panels');
        renderHome(panel, { now: fixedNow, locale: 'en-US' });
        const button = panel.querySelector('[data-home-action="today"]');

        button.click();
        await testUtils.waitFor(0);

        expect(openTab).not.toHaveBeenCalled();
        expect(panel.querySelector('[data-home-notice]').textContent).toContain('Vault is read-only');
        expect(panel.querySelector('[data-home-notice]').classList.contains('error')).toBe(true);
        expect(button.disabled).toBe(false);
        expect(document.activeElement).toBe(button);
        consoleError.mockRestore();
    });

    test('routes Quick note and pinned folders to their existing interface actions', () => {
        const quickNote = jest.fn();
        const reveal = jest.fn();
        document.getElementById('create-inbox-note').addEventListener('click', quickNote);
        document.addEventListener('vault-directory-reveal-requested', reveal, { once: true });
        const panel = document.getElementById('tab-panels');
        renderHome(panel, { now: fixedNow, locale: 'en-US' });

        panel.querySelector('[data-home-action="quick-note"]').click();
        panel.querySelector('[data-home-action="inbox"]').click();

        expect(quickNote).toHaveBeenCalledTimes(1);
        expect(reveal).toHaveBeenCalledTimes(1);
        expect(reveal.mock.calls[0][0].detail).toEqual({ path: 'Inbox' });
    });

    test('opens a task at its source line', async () => {
        const panel = document.getElementById('tab-panels');
        renderHome(panel, { now: fixedNow, locale: 'en-US' });
        await Promise.resolve();
        await Promise.resolve();

        panel.querySelector('.home-task-row').click();
        await testUtils.waitFor(0);

        expect(openTab).toHaveBeenCalledWith('Projects/Plan.md', 'Plan.md', 'file', {
            path: 'Projects/Plan.md',
            line: 12,
            mtime: undefined,
        });
    });

    test('shows an in-app reminder and due-state chips with urgent tasks first', async () => {
        window.go.desktop.App.GetDueTaskSummary.mockResolvedValue({ due_today: 1, overdue: 1 });
        window.go.desktop.App.GetHomeTasks.mockResolvedValue([
            { file: 'None.md', file_name: 'None.md', line: 1, text: 'Undated', tag: 'todo' },
            { file: 'Today.md', file_name: 'Today.md', line: 1, text: 'Due task', tag: 'todo', due_date: '2024-01-15' },
            { file: 'Late.md', file_name: 'Late.md', line: 1, text: 'Late task', tag: 'todo', due_date: '2024-01-14' },
        ]);
        const panel = document.getElementById('tab-panels');
        renderHome(panel, { now: fixedNow, locale: 'en-US' });
        await Promise.resolve();
        await Promise.resolve();

        const reminder = panel.querySelector('[data-home-due-reminder]');
        expect(reminder.hidden).toBe(false);
        expect(reminder.textContent).toContain('1 due today · 1 overdue');
        expect(panel.querySelectorAll('.home-task-due')[0].textContent).toContain('Overdue');
        expect(panel.querySelectorAll('.home-task-due')[1].textContent).toBe('Due today');
        expect(panel.querySelector('.home-task-row').textContent).toContain('Late task');
    });

    test('does not let an earlier task request overwrite a newer Home render', async () => {
        const slow = deferred();
        const fast = deferred();
        window.go.desktop.App.GetHomeTasks
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);
        const panel = document.getElementById('tab-panels');

        renderHome(panel, { now: fixedNow, locale: 'en-US' });
        renderHome(panel, { now: fixedNow, locale: 'en-US' });

        fast.resolve([{ file: 'Current.md', file_name: 'Current.md', line: 1, text: 'Current task', tag: 'todo' }]);
        await Promise.resolve();
        await Promise.resolve();

        slow.resolve([{ file: 'Stale.md', file_name: 'Stale.md', line: 1, text: 'Stale task', tag: 'todo' }]);
        await Promise.resolve();
        await Promise.resolve();

        expect(panel.textContent).toContain('Current task');
        expect(panel.textContent).not.toContain('Stale task');
    });
});

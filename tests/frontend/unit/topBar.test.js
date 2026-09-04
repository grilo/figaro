/**
 * Regression coverage for the title-bar and sidebar navigation contract.
 */

import { readFileSync } from 'node:fs';
import { initTopBar } from '../../../frontend/js/app.js';
import { getState, setState } from '../../../frontend/js/state.js';
import { localISODate } from '../../../frontend/js/core/dueDateModel.js';
import { testUtils } from '../support/test_setup.js';

jest.mock('../../../frontend/js/graphView.js', () => ({
    createGraphView: jest.fn(() => ({
        activate: jest.fn(),
        refresh: jest.fn(),
        dispose: jest.fn(),
    })),
}));

describe('Workspace navigation', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        window.go.desktop.App.SaveSession.mockResolvedValue({ success: true });
        setState('openTabs', []);
        setState('activeTabId', null);
        setState('sidebarCollapsed', false);
        setState('sidebarWidth', 280);
        setState('currentCalDate', new Date(2001, 0, 1));
        setState('selectedCalDateStr', null);
        initTopBar();
    });

    test('places Calendar, Kanban, and Graph under the file tree and Settings beside the window controls', () => {
        const sidebarTools = document.querySelector('.sidebar-tools');
        const calendarButton = document.getElementById('sidebar-calendar');
        const kanbanButton = document.getElementById('sidebar-kanban');
        const graphButton = document.getElementById('sidebar-graph');
        const settingsButton = document.getElementById('topbar-settings');
        const calendarView = document.getElementById('calendar-workspace-view');

        expect(sidebarTools?.contains(calendarButton)).toBe(true);
        expect(sidebarTools?.contains(kanbanButton)).toBe(true);
        expect(sidebarTools?.contains(graphButton)).toBe(true);
        expect(document.getElementById('tab-panels')?.contains(calendarView)).toBe(true);
        expect(document.querySelector('.sidebar-content')?.contains(calendarView)).toBe(false);
        expect(settingsButton?.closest('.top-bar-right')).not.toBeNull();
        expect(document.querySelector('.top-bar-center')?.contains(document.getElementById('tab-bar'))).toBe(true);
        expect(document.getElementById('main-content')?.contains(document.getElementById('tab-bar'))).toBe(false);
        expect(document.getElementById('tab-bar')?.classList.contains('ui-document-tabs--titlebar')).toBe(true);
        for (const button of [calendarButton, kanbanButton, graphButton]) {
            expect(button.classList.contains('ui-document-tab--side-connected')).toBe(true);
            expect(button.getAttribute('aria-controls')).toBe('tab-panels');
        }
        expect(document.getElementById('kanban-badges')).not.toBeNull();
        expect(document.getElementById('sidebar-projects')).toBeNull();
    });

    test('opens the all-notes Graph and keeps the selected side tab open', async () => {
        setState('openTabs', [{
            id: 'notes/Roadmap.md',
            title: 'Roadmap.md',
            type: 'file',
            path: 'notes/Roadmap.md',
            dirty: false,
        }]);
        setState('activeTabId', 'notes/Roadmap.md');
        const button = document.getElementById('sidebar-graph');

        button.click();
        await Promise.resolve();

        expect(getState('openTabs')).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'graph',
                type: 'graph',
            }),
        ]));
        expect(getState('activeTabId')).toBe('graph');
        expect(button.classList.contains('ui-document-tab--active')).toBe(true);
        expect(button.getAttribute('aria-current')).toBe('page');
        expect(document.querySelector('#tab-strip [data-tab-id="graph"]')).toBeNull();

        button.click();
        await Promise.resolve();
        expect(getState('openTabs').filter(tab => tab.type === 'graph')).toHaveLength(1);
        expect(getState('activeTabId')).toBe('graph');
        expect(document.getElementById('graph-workspace-panel').classList.contains('figaro-panel-exit')).toBe(false);
    });

    test('gives every icon-only shell control an explicit accessible name', () => {
        const source = readFileSync('frontend/index.html', 'utf8');
        const content = new DOMParser().parseFromString(source, 'text/html');
        const expectedNames = {
            'toggle-sidebar': 'Toggle sidebar',
            'win-minimize': 'Minimize window',
            'win-maximize': 'Maximize or restore window',
            'win-close': 'Close window',
            'right-sidebar-close': 'Close details pane',
        };

        for (const [id, name] of Object.entries(expectedNames)) {
            const control = content.getElementById(id);
            expect(control?.getAttribute('aria-label')).toBe(name);
            control?.querySelectorAll('svg').forEach(icon => {
                expect(icon.getAttribute('aria-hidden')).toBe('true');
            });
        }
    });

    test('uses the ordinary outlined action for Calendar Timeline Today', () => {
        const source = readFileSync('frontend/index.html', 'utf8');
        const content = new DOMParser().parseFromString(source, 'text/html');
        const today = content.querySelector('.calendar-timeline-today');

        expect(today?.classList.contains('ui-button')).toBe(true);
        expect(today?.classList.contains('ui-button--quiet')).toBe(false);
    });

    test('selects Calendar as a central sidebar-owned workspace without a title-bar tab', () => {
        const button = document.getElementById('sidebar-calendar');
        const view = document.getElementById('calendar-workspace-view');
        const rightSidebar = document.getElementById('right-sidebar');

        button.click();

        expect(getState('activeTabId')).toBe('calendar-workspace');
        expect(view.closest('.tab-panel')?.dataset.tabId).toBe('calendar-workspace');
        expect(view.getAttribute('aria-hidden')).toBe('false');
        expect(button.getAttribute('aria-current')).toBe('page');
        expect(button.classList.contains('ui-document-tab--active')).toBe(true);
        expect(document.querySelector('#tab-strip [data-tab-id="calendar-workspace"]')).toBeNull();
        expect(rightSidebar.classList.contains('open')).toBe(false);
        expect(rightSidebar.dataset.mode).toBeUndefined();

        button.click();

        expect(getState('activeTabId')).toBe('calendar-workspace');
        expect(getState('openTabs').filter(tab => tab.type === 'calendar-workspace')).toHaveLength(1);
        expect(view.closest('.tab-panel')?.classList.contains('figaro-panel-exit')).toBe(false);
    });

    test('starts Calendar on Today and restores the in-session selection after another workspace', () => {
        const button = document.getElementById('sidebar-calendar');
        const kanbanButton = document.getElementById('sidebar-kanban');
        const todayStr = localISODate();

        button.click();

        expect(getState('selectedCalDateStr')).toBe(todayStr);
        expect(getState('currentCalDate').getFullYear()).toBe(new Date().getFullYear());
        expect(getState('currentCalDate').getMonth()).toBe(new Date().getMonth());

        kanbanButton.click();
        setState('selectedCalDateStr', '2024-06-15');
        setState('currentCalDate', new Date(2025, 0, 1));
        button.click();

        expect(getState('selectedCalDateStr')).toBe('2024-06-15');
        expect(getState('currentCalDate').getFullYear()).toBe(2024);
        expect(getState('currentCalDate').getMonth()).toBe(5);
    });

    test('keeps the selected Calendar workspace connected when the sidebar collapses', () => {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('toggle-sidebar');
        const calendarButton = document.getElementById('sidebar-calendar');

        calendarButton.click();
        toggle.click();

        expect(getState('sidebarCollapsed')).toBe(true);
        expect(sidebar.classList.contains('collapsed')).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.getElementById('sidebar-resizer').classList.contains('sidebar-resizer-hidden')).toBe(true);
        expect(document.getElementById('app').style.getPropertyValue('--shell-sidebar-width')).toBe('44px');
        expect(document.getElementById('app').classList.contains('sidebar-collapsed')).toBe(true);
        expect(document.querySelector('.sidebar-tools')?.closest('.sidebar-content')).toBeNull();
        expect(getState('activeTabId')).toBe('calendar-workspace');
        expect(calendarButton.classList.contains('ui-document-tab--active')).toBe(true);

        calendarButton.click();

        expect(getState('sidebarCollapsed')).toBe(true);
        expect(sidebar.classList.contains('collapsed')).toBe(true);
        expect(getState('activeTabId')).toBe('calendar-workspace');
    });

    test('keeps Kanban on the connected sidebar tab without creating a title-bar tab', () => {
        const kanbanButton = document.getElementById('sidebar-kanban');
        const settingsButton = document.getElementById('topbar-settings');

        kanbanButton.click();
        kanbanButton.click();

        expect(getState('openTabs').filter(tab => tab.id === 'kanban')).toHaveLength(1);
        expect(getState('activeTabId')).toBe('kanban');
        expect(kanbanButton.classList.contains('ui-document-tab--active')).toBe(true);
        expect(kanbanButton.getAttribute('aria-current')).toBe('page');
        expect(document.querySelector('#tab-strip [data-tab-id="kanban"]')).toBeNull();
        expect(document.getElementById('kanban-workspace-panel')).not.toBeNull();
        expect(document.getElementById('kanban-workspace-panel').classList.contains('figaro-panel-exit')).toBe(false);

        settingsButton.click();

        expect(getState('openTabs').filter(tab => tab.id === 'settings')).toHaveLength(1);
        expect(kanbanButton.classList.contains('ui-document-tab--active')).toBe(false);
        expect(kanbanButton.hasAttribute('aria-current')).toBe(false);
        expect(settingsButton.classList.contains('active')).toBe(true);

        kanbanButton.click();

        expect(getState('openTabs').filter(tab => tab.id === 'kanban')).toHaveLength(1);
        expect(getState('openTabs').filter(tab => tab.id === 'settings')).toHaveLength(1);
        expect(getState('activeTabId')).toBe('kanban');
        expect(settingsButton.classList.contains('active')).toBe(false);
        expect(kanbanButton.classList.contains('ui-document-tab--active')).toBe(true);
    });

    test('animates Settings closed when its title-bar button is clicked while active', async () => {
        const settingsButton = document.getElementById('topbar-settings');

        settingsButton.click();
        settingsButton.click();
        const closingPanel = document.querySelector('.tab-panel[data-tab-id="settings"]');

        expect(closingPanel.classList.contains('figaro-panel-exit')).toBe(true);
        expect(getState('openTabs').filter(tab => tab.id === 'settings')).toHaveLength(1);
        closingPanel.dispatchEvent(new Event('animationend'));
        await Promise.resolve();

        expect(getState('openTabs').filter(tab => tab.id === 'settings')).toHaveLength(0);
        expect(getState('activeTabId')).not.toBe('settings');
        expect(settingsButton.classList.contains('active')).toBe(false);
    });
});

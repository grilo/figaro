/**
 * Regression coverage for the title-bar and sidebar navigation contract.
 */

import { readFileSync } from 'node:fs';
import { initTopBar } from '../../../frontend/js/app.js';
import { getState, setState } from '../../../frontend/js/state.js';
import { localISODate } from '../../../frontend/js/core/dueDateModel.js';
import { testUtils } from '../support/test_setup.js';

describe('Workspace navigation', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        setState('openTabs', []);
        setState('activeTabId', null);
        setState('sidebarCollapsed', false);
        setState('sidebarWidth', 280);
        setState('currentCalDate', new Date(2001, 0, 1));
        setState('selectedCalDateStr', null);
        initTopBar();
    });

    test('places Calendar and Kanban under the file tree and Settings beside the window controls', () => {
        const sidebarTools = document.querySelector('.sidebar-tools');
        const calendarButton = document.getElementById('sidebar-calendar');
        const kanbanButton = document.getElementById('sidebar-kanban');
        const settingsButton = document.getElementById('topbar-settings');
        const calendarPanel = document.getElementById('sidebar-calendar-panel');

        expect(sidebarTools?.contains(calendarButton)).toBe(true);
        expect(sidebarTools?.contains(kanbanButton)).toBe(true);
        expect(document.querySelector('.sidebar-content')?.contains(calendarPanel)).toBe(true);
        expect(document.getElementById('right-sidebar')?.contains(calendarPanel)).toBe(false);
        expect(settingsButton?.closest('.top-bar-right')).not.toBeNull();
        expect(document.querySelector('.top-bar-center')?.contains(document.getElementById('tab-bar'))).toBe(true);
        expect(document.getElementById('main-content')?.contains(document.getElementById('tab-bar'))).toBe(false);
        expect(document.getElementById('tab-bar')?.classList.contains('ui-document-tabs--titlebar')).toBe(true);
        expect(document.getElementById('kanban-badges')).not.toBeNull();
        expect(document.getElementById('sidebar-projects')).toBeNull();
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

    test('toggles the Calendar inline without taking ownership of the right pane', () => {
        const button = document.getElementById('sidebar-calendar');
        const panel = document.getElementById('sidebar-calendar-panel');
        const rightSidebar = document.getElementById('right-sidebar');

        button.click();

        expect(panel.classList.contains('open')).toBe(true);
        expect(panel.getAttribute('aria-hidden')).toBe('false');
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(button.classList.contains('active')).toBe(true);
        expect(rightSidebar.classList.contains('open')).toBe(false);
        expect(rightSidebar.dataset.mode).toBeUndefined();

        button.click();

        expect(panel.classList.contains('open')).toBe(false);
        expect(panel.getAttribute('aria-hidden')).toBe('true');
        expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    test('starts Calendar on Today and restores the in-session selection when reopened', () => {
        const button = document.getElementById('sidebar-calendar');
        const todayStr = localISODate();

        button.click();

        expect(getState('selectedCalDateStr')).toBe(todayStr);
        expect(getState('currentCalDate').getFullYear()).toBe(new Date().getFullYear());
        expect(getState('currentCalDate').getMonth()).toBe(new Date().getMonth());

        button.click();
        setState('selectedCalDateStr', '2024-06-15');
        setState('currentCalDate', new Date(2025, 0, 1));
        button.click();

        expect(getState('selectedCalDateStr')).toBe('2024-06-15');
        expect(getState('currentCalDate').getFullYear()).toBe(2024);
        expect(getState('currentCalDate').getMonth()).toBe(5);
    });

    test('collapses to a tool rail and expands it when Calendar is selected', () => {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('toggle-sidebar');
        const panel = document.getElementById('sidebar-calendar-panel');
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
        expect(panel.classList.contains('open')).toBe(false);

        calendarButton.click();

        expect(getState('sidebarCollapsed')).toBe(false);
        expect(sidebar.classList.contains('collapsed')).toBe(false);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById('app').style.getPropertyValue('--shell-sidebar-width')).toBe('280px');
        expect(document.getElementById('app').classList.contains('sidebar-collapsed')).toBe(false);
        expect(panel.classList.contains('open')).toBe(true);
    });

    test('reuses an inactive Kanban tab and animates it closed when clicked while active', async () => {
        const kanbanButton = document.getElementById('sidebar-kanban');
        const settingsButton = document.getElementById('topbar-settings');

        kanbanButton.click();
        settingsButton.click();
        kanbanButton.click();

        expect(getState('openTabs').filter(tab => tab.id === 'kanban')).toHaveLength(1);
        expect(getState('openTabs').filter(tab => tab.id === 'settings')).toHaveLength(1);
        expect(getState('activeTabId')).toBe('kanban');
        expect(kanbanButton.classList.contains('active')).toBe(true);
        expect(settingsButton.classList.contains('active')).toBe(false);

        kanbanButton.click();
        const closingPanel = document.querySelector('.tab-panel[data-tab-id="kanban"]');

        expect(closingPanel.classList.contains('figaro-panel-exit')).toBe(true);
        expect(getState('openTabs').filter(tab => tab.id === 'kanban')).toHaveLength(1);
        document.getElementById('topbar-home').click();
        closingPanel.dispatchEvent(new Event('animationend'));
        await Promise.resolve();

        expect(getState('openTabs').filter(tab => tab.id === 'kanban')).toHaveLength(0);
        expect(getState('openTabs').filter(tab => tab.id === 'settings')).toHaveLength(1);
        expect(getState('openTabs').filter(tab => tab.id === 'home')).toHaveLength(0);
        expect(getState('activeTabId')).toBeNull();
        expect(document.querySelector('.workspace-home-panel.active')).not.toBeNull();
        expect(kanbanButton.classList.contains('active')).toBe(false);
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

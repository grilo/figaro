/**
 * UI tests for Top Bar buttons and Calendar popup behavior
 */

import { testUtils } from './test_setup.js';

describe('Top Bar Buttons', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
    });

    describe('Calendar in right pane', () => {
        test('right sidebar exists with calendar elements', () => {
            const rs = document.getElementById('right-sidebar');
            expect(rs).not.toBeNull();
            expect(document.getElementById('cal-month-year')).not.toBeNull();
            expect(document.getElementById('calendar-grid')).not.toBeNull();
            expect(document.getElementById('cal-linked-notes')).not.toBeNull();
            expect(document.getElementById('right-sidebar-close')).not.toBeNull();
            expect(document.getElementById('right-sidebar-title')).not.toBeNull();
        });

        test('right sidebar has history-content div', () => {
            const hc = document.getElementById('history-content');
            expect(hc).not.toBeNull();
        });

        test('right sidebar starts collapsed', () => {
            const rs = document.getElementById('right-sidebar');
            expect(rs.className).toContain('collapsed');
        });
    });

    describe('Kanban button toggle', () => {
        test('kanban button exists in top bar', () => {
            const btn = document.getElementById('topbar-kanban');
            expect(btn).not.toBeNull();
        });

        test('kanban button has badges span', () => {
            const badges = document.getElementById('kanban-badges');
            expect(badges).not.toBeNull();
        });
    });

    describe('Settings button', () => {
        test('settings button exists in top bar', () => {
            const btn = document.getElementById('topbar-settings');
            expect(btn).not.toBeNull();
        });

    });

    describe('Sidebar structure', () => {
        test('sidebar has search input', () => {
            const input = document.getElementById('global-search-input');
            expect(input).not.toBeNull();
            // Should be inside sidebar-search
            const searchContainer = input.closest('.sidebar-search');
            expect(searchContainer).not.toBeNull();
        });

        test('sidebar has file tree', () => {
            const ft = document.getElementById('file-tree');
            expect(ft).not.toBeNull();
        });

    });

    describe('Top bar structure', () => {
        test('top bar has calendar, kanban, settings buttons', () => {
            expect(document.getElementById('topbar-calendar')).not.toBeNull();
            expect(document.getElementById('topbar-kanban')).not.toBeNull();
            expect(document.getElementById('topbar-settings')).not.toBeNull();
        });

        test('top bar has sidebar toggle', () => {
            expect(document.getElementById('toggle-sidebar')).not.toBeNull();
        });

        test('top bar does NOT have global-search in center', () => {
            // Search is now in sidebar, not top bar
            const topBar = document.querySelector('.top-bar');
            const searchInTop = topBar?.querySelector('#global-search-input');
            expect(searchInTop).toBeNull();
        });
    });
});

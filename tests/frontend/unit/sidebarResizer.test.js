import { initSidebarResizer } from '../../../frontend/js/sidebarResizer.js';
import { getState, setState } from '../../../frontend/js/state.js';
import { testUtils } from '../support/test_setup.js';

describe('sidebar resize alignment', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        setState('sidebarCollapsed', false);
        setState('sidebarWidth', 280);
        initSidebarResizer();
    });

    test('moves the sidebar and title-bar tab boundary together', () => {
        const sidebar = document.getElementById('sidebar');
        const resizer = document.getElementById('sidebar-resizer');

        resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 280 }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 362 }));

        expect(getState('sidebarWidth')).toBe(362);
        expect(sidebar.style.width).toBe('362px');
        expect(sidebar.style.minWidth).toBe('225px');
        expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('362px');
        expect(document.getElementById('app').style.getPropertyValue('--shell-sidebar-width')).toBe('362px');

        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        expect(resizer.classList.contains('is-dragging')).toBe(false);
    });

    test('ignores resize gestures while the sidebar is collapsed', () => {
        setState('sidebarCollapsed', true);
        const resizer = document.getElementById('sidebar-resizer');
        resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 280 }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 390 }));

        expect(getState('sidebarWidth')).toBe(280);
        expect(resizer.classList.contains('is-dragging')).toBe(false);
    });

    test('exposes a quiet separator and supports arrow, accelerated, and bound keys', () => {
        const sidebar = document.getElementById('sidebar');
        const resizer = document.getElementById('sidebar-resizer');

        expect(resizer.getAttribute('role')).toBe('separator');
        expect(resizer.getAttribute('aria-controls')).toBe('sidebar');
        resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(sidebar.style.width).toBe('288px');
        expect(resizer.getAttribute('aria-valuenow')).toBe('288');

        resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
        expect(sidebar.style.width).toBe('320px');

        resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(sidebar.style.width).toBe('225px');
        resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(sidebar.style.width).toBe('500px');
    });
});

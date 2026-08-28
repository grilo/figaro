import { setRightSidebarOpen, setRightSidebarSuppressed } from '../frontend/js/rightSidebarState.js';

describe('right sidebar accessibility state', () => {
    test('removes a zero-width closed pane and its Close button from sequential focus', () => {
        document.body.innerHTML = '<aside id="right-sidebar"><button id="right-sidebar-close">Close</button></aside>';
        const sidebar = document.getElementById('right-sidebar');

        expect(setRightSidebarOpen(sidebar, true)).toBe(true);
        expect(sidebar.classList.contains('open')).toBe(true);
        expect(sidebar.getAttribute('aria-hidden')).toBe('false');
        expect(sidebar.hasAttribute('inert')).toBe(false);

        expect(setRightSidebarOpen(sidebar, false)).toBe(false);
        expect(sidebar.classList.contains('open')).toBe(false);
        expect(sidebar.getAttribute('aria-hidden')).toBe('true');
        expect(sidebar.hasAttribute('inert')).toBe(true);
        expect(sidebar.inert).toBe(true);
    });

    test('suppresses an open pane for Pure mode and restores the same pane in place', () => {
        document.body.innerHTML = '<aside id="right-sidebar"><button>Close</button></aside>';
        const sidebar = document.getElementById('right-sidebar');
        setRightSidebarOpen(sidebar, true);

        expect(setRightSidebarSuppressed(sidebar, true)).toBe(true);
        expect(sidebar.classList.contains('open')).toBe(true);
        expect(sidebar.dataset.pureSuppressed).toBe('true');
        expect(sidebar.getAttribute('aria-hidden')).toBe('true');
        expect(sidebar.hasAttribute('inert')).toBe(true);

        expect(setRightSidebarSuppressed(sidebar, false)).toBe(false);
        expect(sidebar.classList.contains('open')).toBe(true);
        expect(sidebar.getAttribute('aria-hidden')).toBe('false');
        expect(sidebar.hasAttribute('inert')).toBe(false);
    });

    test('keeps a pane opened during Pure mode suppressed until Pure exits', () => {
        document.body.innerHTML = '<aside id="right-sidebar"></aside>';
        const sidebar = document.getElementById('right-sidebar');
        setRightSidebarSuppressed(sidebar, true);

        expect(setRightSidebarOpen(sidebar, true)).toBe(true);
        expect(sidebar.classList.contains('open')).toBe(true);
        expect(sidebar.getAttribute('aria-hidden')).toBe('true');
        expect(sidebar.hasAttribute('inert')).toBe(true);
    });
});

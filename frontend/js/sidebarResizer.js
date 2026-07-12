/**
 * Sidebar Resizer — horizontal drag handle on the right edge of the left sidebar.
 * Nested inside #sidebar as last child, anchored to right: -3px (6px wide).
 * Uses clientX directly since sidebar is flush-left.
 */

import { state } from './state.js';

export function initSidebarResizer() {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    if (!sidebar || !resizer) return;

    const MIN_WIDTH = 225;
    const MAX_WIDTH = 500;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (state.sidebarCollapsed) return;

        resizer.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMouseMove(moveEvent) {
            let w = moveEvent.clientX;
            if (w < MIN_WIDTH) w = MIN_WIDTH;
            if (w > MAX_WIDTH) w = MAX_WIDTH;

            state.sidebarWidth = w;
            sidebar.style.width = `${w}px`;
            sidebar.style.minWidth = `${w}px`;
            document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
        }

        function onMouseUp() {
            resizer.classList.remove('is-dragging');
            document.body.style.removeProperty('cursor');
            document.body.style.removeProperty('user-select');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

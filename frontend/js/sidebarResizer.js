/**
 * Sidebar Resizer — horizontal drag handle on the right edge of the left sidebar.
 * Nested inside #sidebar as last child, anchored to right: -3px (6px wide).
 * Uses clientX directly since sidebar is flush-left.
 */

import { getState, setState } from './state.js';
import { SIDEBAR_MAXIMUM, SIDEBAR_MINIMUM, sidebarLayoutPlan } from './core/sidebarLayoutModel.js';
import { paneSeparatorKeyboardPlan } from './core/paneSeparatorModel.js';

function updateSeparatorValue(resizer, width) {
    resizer?.setAttribute('aria-valuenow', String(Math.round(width)));
    resizer?.setAttribute('aria-valuetext', `${Math.round(width)} pixels wide`);
}

/**
 * Apply an already-decided sidebar layout to the native shell boundary.
 */
export function applySidebarLayout(sidebar, plan) {
    if (!sidebar || !plan) return;

    sidebar.style.width = `${plan.visibleWidth}px`;
    sidebar.style.minWidth = `${plan.minimumVisibleWidth}px`;
    document.documentElement.style.setProperty('--sidebar-width', `${plan.expandedWidth}px`);
    const app = document.getElementById('app');
    app?.style.setProperty('--shell-sidebar-width', `${plan.visibleWidth}px`);
    app?.classList.toggle('sidebar-collapsed', plan.collapsed);
    const resizer = sidebar.querySelector('#sidebar-resizer');
    updateSeparatorValue(resizer, plan.expandedWidth);
}

export function initSidebarResizer() {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    if (!sidebar || !resizer) return;

    updateSeparatorValue(resizer, getState('sidebarWidth') || sidebar.offsetWidth || 280);

    resizer.addEventListener('keydown', event => {
        if (getState('sidebarCollapsed')) return;
        const plan = paneSeparatorKeyboardPlan({
            key: event.key,
            width: getState('sidebarWidth') || sidebar.offsetWidth || 280,
            minimum: SIDEBAR_MINIMUM,
            maximum: SIDEBAR_MAXIMUM,
            shiftKey: event.shiftKey,
        });
        if (!plan.handled) return;
        event.preventDefault();
        event.stopPropagation();
        const layout = sidebarLayoutPlan({ expandedWidth: plan.width });
        setState('sidebarWidth', layout.expandedWidth);
        applySidebarLayout(sidebar, layout);
    });

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (getState('sidebarCollapsed')) return;

        resizer.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMouseMove(moveEvent) {
            const plan = sidebarLayoutPlan({ expandedWidth: moveEvent.clientX });
            setState('sidebarWidth', plan.expandedWidth);
            applySidebarLayout(sidebar, plan);
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

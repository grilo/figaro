/**
 * Keep right-pane geometry, pointer behavior, focusability, and accessibility
 * exposure in one state transition. A zero-width pane is still mounted, so
 * CSS alone cannot prevent its controls from receiving keyboard focus.
 */
export function setRightSidebarOpen(sidebar, open) {
    if (!sidebar) return false;
    const visible = Boolean(open);
    sidebar.classList.toggle('open', visible);
    const exposed = visible && sidebar.dataset.pureSuppressed !== 'true';
    sidebar.setAttribute('aria-hidden', String(!exposed));
    sidebar.inert = !exposed;
    if (exposed) sidebar.removeAttribute('inert');
    else sidebar.setAttribute('inert', '');
    return visible;
}

/**
 * Pure mode temporarily yields the complete canvas without destroying the
 * right pane's mode or contents. Removing suppression restores exactly the
 * pane that was open before the sidebar collapsed.
 */
export function setRightSidebarSuppressed(sidebar, suppressed) {
    if (!sidebar) return false;
    const hidden = Boolean(suppressed);
    sidebar.dataset.pureSuppressed = String(hidden);
    const exposed = sidebar.classList.contains('open') && !hidden;
    sidebar.setAttribute('aria-hidden', String(!exposed));
    sidebar.inert = !exposed;
    if (exposed) sidebar.removeAttribute('inert');
    else sidebar.setAttribute('inert', '');
    return hidden;
}

/**
 * Keep right-pane geometry, pointer behavior, focusability, and accessibility
 * exposure in one state transition. A zero-width pane is still mounted, so
 * CSS alone cannot prevent its controls from receiving keyboard focus.
 */
export function setRightSidebarOpen(sidebar, open) {
    if (!sidebar) return false;
    const visible = Boolean(open);
    sidebar.classList.toggle('open', visible);
    sidebar.setAttribute('aria-hidden', String(!visible));
    sidebar.inert = !visible;
    if (visible) sidebar.removeAttribute('inert');
    else sidebar.setAttribute('inert', '');
    return visible;
}

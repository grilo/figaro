/**
 * Bind vault notifications emitted by the native backend.
 *
 * Wails exposes EventsOn consistently in its Windows, macOS, and Linux
 * webviews. Keeping this small adapter free of DOM or platform APIs makes the
 * event path easy to exercise and avoids falling back to timed polling.
 */
export function registerVaultChangeEvents(runtime, { onVaultChanged, onKanbanIndexed } = {}) {
    if (typeof runtime?.EventsOn !== 'function') return false;

    runtime.EventsOn('vault:changed', () => {
        onVaultChanged?.();
    });
    runtime.EventsOn('vault:kanban-indexed', () => {
        onKanbanIndexed?.();
    });
    return true;
}

export default { registerVaultChangeEvents };

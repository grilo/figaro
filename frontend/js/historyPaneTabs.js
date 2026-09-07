// Shared view selection; composition registers the two owners without a cycle.
const handlers = {};
export function configureHistoryPaneTabs(next) { Object.assign(handlers, next); }
export function prependHistoryPaneTabs(container, selected) {
    const nav = document.createElement('div');
    nav.className = 'ui-segmented-control history-pane-tabs'; nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'History view');
    for (const [key, label] of [['activity', 'Activity'], ['versions', 'Versions']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ui-button';
        button.textContent = label; button.setAttribute('aria-pressed', String(selected === key));
        button.disabled = !handlers[key] || (key === 'activity' && handlers.activityAvailable?.() === false);
        if (key === 'activity' && button.disabled) button.title = 'Passage activity is available for Markdown notes.';
        button.addEventListener('click', async () => {
            if (key === 'activity') await handlers.beforeActivity?.();
            await handlers[key]?.();
        });
        nav.append(button);
    }
    container.prepend(nav);
}

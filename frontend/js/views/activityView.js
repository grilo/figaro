import { activityEventsForPassages } from '../core/activityModel.js';
import { prependHistoryPaneTabs } from '../historyPaneTabs.js';
import { backlinksIcon } from '../icons.js';

function node(tag, className, text) { const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element; }
function action(label, callback) { const button = node('button', 'ui-button', label); button.type = 'button'; button.addEventListener('click', callback); return button; }

/** Render source excerpts as text; activity never replaces the live document. */
export function renderActivityView(container, { status, error, passages = [], events = [], partial, scope, expanded = new Set(), onJump, onToggle, onRetry }) {
    const focused = container.contains(document.activeElement) ? document.activeElement?.dataset.activityAction : null;
    const scroller = container.closest('#right-sidebar-content') || container;
    const scrollTop = scroller.scrollTop;
    container.replaceChildren();
    prependHistoryPaneTabs(container, 'activity');
    if (status === 'loading' || status === 'idle') {
        const loading = node('p', 'history-empty', 'Loading passage activity…'); loading.setAttribute('role', 'status'); container.append(loading); return;
    }
    if (status === 'error') {
        const message = node('p', 'ui-notice ui-notice--warning', 'Activity could not be loaded.'); message.setAttribute('role', 'status');
        container.append(message, node('p', 'activity-detail', error), action('Retry', onRetry)); return;
    }
    const selected = scope ? passages.filter(p => p.from < scope.to && p.to > scope.from) : passages;
    container.append(node('p', 'activity-context', scope ? `${selected.length} ${selected.length === 1 ? 'passage' : 'consecutive passages'}` : 'Current passages · Recorded changes'));
    if (selected.some(p => p.status === 'unrecorded')) container.append(node('p', 'ui-notice ui-notice--info', 'Some changes have not been recorded in Git history yet. Use Save to history in the status bar, or enable Auto-Commit in Settings.'));
    if (partial || selected.some(p => p.status === 'unknown')) container.append(node('p', 'ui-notice ui-notice--info', 'Earlier attribution is unavailable for part of this note. No date has been assumed for that text.'));
    const changes = activityEventsForPassages(selected, events);
    if (!changes.length) container.append(node('p', 'history-empty', 'No recorded changes for these passages yet.'));
    let previousDay = '';
    for (const change of changes.slice(0, 100)) {
        const date = new Date(change.timestamp * 1000);
        const day = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        if (day !== previousDay) { container.append(node('h3', 'activity-day', day)); previousDay = day; }
        const card = node('section', 'ui-suggestion activity-change');
        card.append(node('p', 'activity-detail', `${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${change.kind === 'added' ? 'Added' : 'Edited'}`));
        const heading = node('div', 'activity-change-heading');
        const excerpt = change.after.split('\n').find(line => line.trim()) || change.before.split('\n').find(line => line.trim()) || 'Passage';
        heading.append(node('p', 'activity-change-title', excerpt.replace(/^#{1,6}\s+/, '').slice(0, 150)));
        const jump = action('', () => onJump(change.id)); jump.className = 'ui-icon-button ui-icon-button--small'; jump.innerHTML = backlinksIcon(14);
        jump.setAttribute('aria-label', 'Go to this passage in the current note'); jump.title = 'Go to passage'; jump.dataset.activityAction = `jump-${change.id}`;
        heading.append(jump); card.append(heading);
        const details = action(expanded.has(change.id) ? 'Hide changes' : 'View changes', () => onToggle(change.id));
        details.setAttribute('aria-expanded', String(expanded.has(change.id))); details.dataset.activityAction = `details-${change.id}`; card.append(details);
        if (expanded.has(change.id)) {
            const diff = node('div', 'history-diff'); diff.setAttribute('aria-label', 'Recorded passage changes');
            for (const [type, marker, text] of [['removed', '−', change.before], ['added', '+', change.after]]) {
                if (!text) continue;
                const row = node('div', `history-diff-line is-${type}`);
                const sign = node('span', '', marker); sign.setAttribute('aria-hidden', 'true');
                row.append(sign, node('code', '', text)); diff.append(row);
            }
            if (change.excerpt) diff.append(node('p', 'activity-detail', 'Excerpt of a larger change. Open Versions to inspect the complete saved note.'));
            card.append(diff);
        }
        container.append(card);
    }
    if (changes.length > 100) container.append(node('p', 'activity-detail', 'Showing the 100 most recent passage changes. Older saved notes remain available in Versions.'));
    scroller.scrollTop = scrollTop;
    if (focused) [...container.querySelectorAll('[data-activity-action]')].find(button => button.dataset.activityAction === focused)?.focus({ preventScroll: true });
}

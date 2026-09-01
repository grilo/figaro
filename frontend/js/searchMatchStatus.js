import { getSearchQuery, searchPanelOpen } from '@codemirror/search';
import { ViewPlugin } from '@codemirror/view';
import { searchMatchAnnouncement } from './core/searchMatchModel.js';

function matchSummary(state) {
    const query = getSearchQuery(state);
    if (!query.search || !query.valid) {
        return searchMatchAnnouncement({ query: query.search, valid: query.valid });
    }
    const selection = state.selection.main;
    let total = 0;
    let activeIndex = -1;
    for (const match of query.getCursor(state)) {
        if (match.from === selection.from && match.to === selection.to) activeIndex = total;
        total += 1;
    }
    return searchMatchAnnouncement({
        query: query.search,
        valid: query.valid,
        total,
        activeIndex,
    });
}

function ensureStatus(panel) {
    let status = panel.querySelector('.cm-search-match-status');
    if (status) return status;
    status = panel.ownerDocument.createElement('span');
    status.className = 'cm-search-match-status sr-only';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    panel.appendChild(status);
    return status;
}

/**
 * CodeMirror owns the search UI and matching algorithm. This adapter mirrors
 * its query through the same SearchQuery cursor and adds only an aria-live
 * result summary; it does not replace or fork native Find behavior.
 */
export const searchMatchStatusExtension = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
        this.frame = null;
        this.schedule();
    }

    update() {
        this.schedule();
    }

    schedule() {
        if (this.frame !== null) return;
        const host = this.view.win || globalThis;
        const schedule = typeof host.requestAnimationFrame === 'function'
            ? callback => host.requestAnimationFrame(callback)
            : callback => host.setTimeout(callback, 0);
        this.frame = schedule(() => {
            this.frame = null;
            this.refresh();
        });
    }

    refresh() {
        if (this.view.isDestroyed || !searchPanelOpen(this.view.state)) return;
        const panel = this.view.dom.querySelector('.cm-panel.cm-search');
        if (!panel) return;
        const status = ensureStatus(panel);
        const announcement = matchSummary(this.view.state);
        if (status.textContent !== announcement) status.textContent = announcement;
    }

    destroy() {
        if (this.frame !== null) {
            const host = this.view.win || globalThis;
            if (typeof host.cancelAnimationFrame === 'function') host.cancelAnimationFrame(this.frame);
            else host.clearTimeout(this.frame);
        }
        this.frame = null;
    }
});

export { matchSummary as editorSearchMatchSummary };

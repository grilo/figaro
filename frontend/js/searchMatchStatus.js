import { getSearchQuery, searchPanelOpen } from '@codemirror/search';
import { ViewPlugin } from '@codemirror/view';
import { activeSearchMatchIndex, searchMatchAnnouncement } from './core/searchMatchModel.js';

// Keep only the latest query per immutable document. Old documents can be collected.
const documentMatches = new WeakMap();

export function editorSearchMatchSummary(state) {
    const query = getSearchQuery(state);
    if (!query.search || !query.valid) {
        return searchMatchAnnouncement({ query: query.search, valid: query.valid });
    }
    const wordChars = query.wholeWord ? state.languageDataAt('wordChars', state.selection.main.head)[0] || '' : '';
    let cached = documentMatches.get(state.doc);
    if (!cached || !query.eq(cached.query) || query.unquoted !== cached.query.unquoted
        || wordChars !== cached.wordChars || (query.test && cached.state !== state)) {
        const matches = [];
        for (const { from, to } of query.getCursor(state)) matches.push({ from, to });
        cached = { query, matches, wordChars, state: query.test ? state : null };
        documentMatches.set(state.doc, cached);
    }
    return searchMatchAnnouncement({
        query: query.search,
        valid: query.valid,
        total: cached.matches.length,
        activeIndex: activeSearchMatchIndex(cached.matches, state.selection.main),
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

    update(update) {
        if (update.docChanged || update.selectionSet
            || !getSearchQuery(update.startState).eq(getSearchQuery(update.state))
            || update.transactions.some(transaction => transaction.reconfigured)
            || (getSearchQuery(update.state).wholeWord && update.startState !== update.state)
            || (getSearchQuery(update.state).test && update.startState !== update.state)
            || searchPanelOpen(update.startState) !== searchPanelOpen(update.state)) this.schedule();
    }

    schedule() {
        if (!searchPanelOpen(this.view.state)) return;
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
        const announcement = editorSearchMatchSummary(this.view.state);
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

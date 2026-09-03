/**
 * Title-bar Markdown, Figaro-macro, shortcut, and Settings help.
 * Static topic content stays available at startup; search only indexes and
 * navigates existing UI rather than becoming an action command palette.
 */

import { helpSearchResults } from './core/helpSearchModel.js';
import { requestSettingsTarget } from './settingsNavigation.js';

export const helpSettingsEntries = [
    ['Theme', '#theme-picker-btn', 'Appearance', ['color', 'dark', 'light', 'crt']],
    ['Font', '#font-picker-btn', 'Appearance', ['typeface', 'writing']],
    ['Code font', '#code-font-picker-btn', 'Appearance', ['programming', 'monospace']],
    ['Typewriter scrolling', '#pure-typewriter-toggle', 'Appearance · Pure mode', ['scroll', 'cursor']],
    ['Focus scope', '#pure-focus-scope', 'Appearance · Pure mode', ['phrase', 'paragraph', 'dim']],
    ['Adaptive typography', '#pure-adaptive-typography-toggle', 'Appearance · Pure mode', ['window', 'width', 'scale']],
    ['Default text size', '#font-size-down', 'Editor', ['zoom', 'font size']],
    ['Tab size', '#tab-size-value', 'Editor', ['indent', 'spaces']],
    ['Text width', '#text-width-down', 'Editor', ['line length', 'narrow', 'wide']],
    ['Breadcrumbs', '#editor-breadcrumbs-toggle', 'Editor · Navigation', ['document path']],
    ['Sticky headings', '#sticky-headings-toggle', 'Editor · Navigation', ['hierarchy']],
    ['Block guides and folding', '#markdown-block-guides-toggle', 'Editor · Navigation', ['collapse', 'expand']],
    ['Document outline', '#document-outline-toggle', 'Editor · Navigation', ['headings']],
    ['Vim mode', '#vim-toggle', 'Editor', ['vi', 'keybindings', 'motions']],
    ['Move by visual rows', '#vim-visual-rows-toggle', 'Editor · Vim mode', ['wrapped lines', 'j', 'k']],
    ['Enter rendered blocks', '#vim-reveal-blocks-toggle', 'Editor · Vim mode', ['live preview', 'j', 'k']],
    ['Line numbers', '#line-numbers-toggle', 'Editor', ['gutter']],
    ['Markdown diagnostics', '#markdown-lint-toggle', 'Editor', ['lint', 'F8', 'problems']],
    ['Spellcheck', '#spellcheck-language', 'Editor', ['language', 'dictionary']],
    ['Links style', '#link-style-select', 'Editor', ['wikilinks', 'markdown links']],
    ['Kanban card density', '[data-kanban-density="comfortable"]', 'Kanban', ['compact', 'comfortable']],
    ['Kanban column flow', '[data-kanban-layout="side-by-side"]', 'Kanban', ['stacked', 'layout']],
    ['Auto-save', '#auto-save-interval', 'Automation', ['interval', 'save frequency']],
    ['Auto-commit', '#auto-commit-toggle', 'Automation', ['git', 'history']],
    ['PDF browser engine', '#pdf-browser-choose', 'PDF Export', ['chromium', 'edge', 'executable']],
    ['Vault health', '#open-vault-health', 'Vault care', ['broken links', 'orphans', 'duplicates']],
    ['Recently deleted', '#recently-deleted-list', 'Vault care', ['restore', 'trash']],
    ['Application version', '#application-version', 'About', ['figaro version']],
].map(([title, selector, category, keywords]) => ({
    type: 'setting', title, selector, category: `Settings · ${category}`, keywords,
}));

function helpEntries(popup) {
    return [...popup.querySelectorAll('[role="tabpanel"]')].flatMap(panel => {
        const tab = popup.querySelector(`#${panel.getAttribute('aria-labelledby')}`);
        const category = tab?.textContent.trim() || 'Help';
        return [...panel.querySelectorAll('tr')].map((row, index) => {
            if (!row.id) row.id = `md-help-search-row-${category.toLocaleLowerCase()}-${index}`;
            const syntax = row.cells[0]?.textContent.replace(/\s+/g, ' ').trim() || '';
            const title = row.cells[1]?.textContent.replace(/\s+/g, ' ').trim() || syntax;
            return {
                type: 'help',
                title,
                detail: syntax,
                category: `Help · ${category}`,
                panel,
                row,
                tab,
                keywords: [syntax],
                priority: category === 'Markdown' ? -50 : 0,
            };
        });
    });
}

export function initHelpPopup(root = document) {
    const trigger = root.getElementById('md-cheatsheet-trigger');
    const popup = root.getElementById('md-cheatsheet-popup');
    const close = root.getElementById('md-cheatsheet-close');
    const search = root.getElementById('md-help-search');
    const resultsSurface = root.getElementById('md-help-search-results');
    const empty = root.getElementById('md-help-search-empty');
    const wrapper = trigger?.closest('.md-cheatsheet-wrapper');
    if (!trigger || !popup || !wrapper || !search || !resultsSurface || !empty || trigger.dataset.initialized === 'true') return;

    trigger.dataset.initialized = 'true';
    const tabs = [...popup.querySelectorAll('[role="tab"]')];
    const panels = [...popup.querySelectorAll('[role="tabpanel"]')];
    const searchableEntries = [...helpEntries(popup), ...helpSettingsEntries];
    let returnFocusTarget = trigger;
    let currentResults = [];
    let activeResultIndex = -1;
    let activatingResult = false;

    const activateTab = (target, { focus = false } = {}) => {
        if (!target || !tabs.includes(target)) return;
        for (const tab of tabs) {
            const selected = tab === target;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            tab.classList.toggle('ui-button--accent', selected);
        }
        for (const panel of panels) panel.hidden = panel.id !== target.getAttribute('aria-controls');
        if (focus) target.focus();
    };

    activateTab(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);

    const setActiveResult = index => {
        if (!currentResults.length) {
            activeResultIndex = -1;
            search.removeAttribute('aria-activedescendant');
            return;
        }
        activeResultIndex = (index + currentResults.length) % currentResults.length;
        const options = [...resultsSurface.querySelectorAll('[role="option"]')];
        options.forEach((option, optionIndex) => {
            const active = optionIndex === activeResultIndex;
            option.classList.toggle('active', active);
            option.setAttribute('aria-selected', String(active));
        });
        const active = options[activeResultIndex];
        search.setAttribute('aria-activedescendant', active.id);
        active.scrollIntoView?.({ block: 'nearest' });
    };

    const renderSearch = () => {
        const query = search.value.trim();
        currentResults = helpSearchResults(query, searchableEntries);
        activeResultIndex = -1;
        const searching = Boolean(query);
        popup.classList.toggle('is-searching', searching);
        resultsSurface.hidden = !searching || !currentResults.length;
        empty.hidden = !searching || Boolean(currentResults.length);
        empty.textContent = searching && !currentResults.length ? `No help found for “${query}”` : '';
        search.setAttribute('aria-expanded', String(searching && currentResults.length > 0));
        search.removeAttribute('aria-activedescendant');
        resultsSurface.innerHTML = currentResults.map((entry, index) => `
            <button type="button" id="md-help-result-${index}" class="ui-menu-item md-help-search-result"
                    role="option" aria-selected="false" tabindex="-1" data-result-index="${index}">
                <span class="md-help-search-result-copy">
                    <strong>${escapeText(entry.title)}</strong>
                    <small>${escapeText(entry.category)}${entry.detail ? ` · ${escapeText(entry.detail)}` : ''}</small>
                </span>
                <span aria-hidden="true">›</span>
            </button>`).join('');
        if (currentResults.length) setActiveResult(0);
    };

    const clearSearch = () => {
        search.value = '';
        renderSearch();
    };

    let setOpen = () => {};
    const activateResult = index => {
        const entry = currentResults[index];
        if (!entry) return;
        activatingResult = true;
        try {
            if (entry.type === 'setting') {
                setOpen(false, { restoreFocus: false });
                requestSettingsTarget(root, entry.selector);
                return;
            }
            clearSearch();
            activateTab(entry.tab);
            entry.row.scrollIntoView?.({ block: 'center' });
            entry.row.classList.add('md-help-search-target');
            (root.defaultView || window).setTimeout(() => entry.row.classList.remove('md-help-search-target'), 1800);
            entry.panel.focus({ preventScroll: true });
        } finally {
            activatingResult = false;
        }
    };

    search.addEventListener('input', renderSearch);
    search.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' && currentResults.length) {
            event.preventDefault();
            setActiveResult(activeResultIndex + 1);
        } else if (event.key === 'ArrowUp' && currentResults.length) {
            event.preventDefault();
            setActiveResult(activeResultIndex - 1);
        } else if (event.key === 'Enter' && activeResultIndex >= 0) {
            event.preventDefault();
            activateResult(activeResultIndex);
        } else if (event.key === 'Escape' && search.value) {
            event.preventDefault();
            event.stopPropagation();
            clearSearch();
        }
    });
    resultsSurface.addEventListener('click', event => {
        const option = event.target.closest('[data-result-index]');
        if (!option) return;
        event.stopPropagation();
        activateResult(Number(option.dataset.resultIndex));
    });
    resultsSurface.addEventListener('pointerdown', event => {
        if (event.target.closest('[data-result-index]')) event.preventDefault();
    });

    for (const tab of tabs) {
        tab.addEventListener('click', event => {
            event.stopPropagation();
            clearSearch();
            activateTab(tab);
        });
    }

    popup.querySelector('[role="tablist"]')?.addEventListener('keydown', event => {
        const current = event.target.closest?.('[role="tab"]');
        const index = tabs.indexOf(current);
        if (index < 0) return;
        let nextIndex = null;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (nextIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        activateTab(tabs[nextIndex], { focus: true });
    });

    const focusSearch = () => (root.defaultView || window).setTimeout(() => search.focus(), 0);

    setOpen = (open, { restoreFocus = false, openedFrom = null } = {}) => {
        const changed = popup.classList.contains('open') !== open;
        if (open && changed) returnFocusTarget = openedFrom?.isConnected ? openedFrom : trigger;
        popup.classList.toggle('open', open);
        popup.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        if (!open) clearSearch();
        if (!open && restoreFocus && changed) {
            const target = returnFocusTarget?.isConnected ? returnFocusTarget : trigger;
            target.focus();
        }
    };

    trigger.addEventListener('click', event => {
        event.stopPropagation();
        const open = !popup.classList.contains('open');
        setOpen(open, { openedFrom: trigger });
        if (open) focusSearch();
    });
    wrapper.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !popup.classList.contains('open')) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false, { restoreFocus: true });
    });
    wrapper.addEventListener('focusout', event => {
        if (!popup.classList.contains('open') || activatingResult || wrapper.contains(event.relatedTarget)) return;
        setOpen(false);
    });
    close?.addEventListener('click', event => {
        event.stopPropagation();
        setOpen(false, { restoreFocus: true });
    });
    root.addEventListener('click', event => {
        if (!event.target.closest('.md-cheatsheet-wrapper')) setOpen(false);
    });
    root.addEventListener('keydown', event => {
        if (event.key !== 'F1' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        const open = !popup.classList.contains('open');
        if (open) {
            setOpen(true, { openedFrom: root.activeElement });
            focusSearch();
        } else {
            setOpen(false, { restoreFocus: true });
        }
    }, true);

    setOpen(false);
}

function escapeText(value) {
    const element = document.createElement('span');
    element.textContent = String(value || '');
    return element.innerHTML;
}

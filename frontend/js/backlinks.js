import { backend } from './backend.js';
/**
 * Backlinks Module - Backlinks status bar link for current file
 */

import { log } from './log.js';
import { setState, getState, subscribe } from './state.js';
import { openTab } from './tabManager.js';
import { errorDialog } from './dialogs.js';
import { statusBar } from './statusBar.js';

let backlinksRequestId = 0;
const backlinksResultsRequestIds = new Map();

/**
 * Keep compatibility with older backends that encoded an empty Go slice as
 * null, while surfacing genuinely malformed responses as errors.
 */
export function normalizeBacklinks(response) {
    if (response == null) return [];
    if (!Array.isArray(response)) throw new TypeError('Backlinks response was not a list');
    return response;
}

function backlinkErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Initialize backlinks module
 */
export function initBacklinks() {
    // Update backlinks count in status bar when active tab changes
    subscribe('activeTabId', updateBacklinksForActiveTab);
}

/**
 * Update backlinks count in status bar for active file tab
 */
export async function updateBacklinksForActiveTab() {
    const activeTab = getState('openTabs').find(t => t.id === getState('activeTabId'));
    const statusEl = document.getElementById('backlinks-status');
    const requestId = ++backlinksRequestId;
    
    if (activeTab && activeTab.type === 'file' && activeTab.path) {
        try {
            const backlinks = normalizeBacklinks(
                await backend().SearchBacklinks(activeTab.path)
            );
            if (requestId !== backlinksRequestId || getState('activeTabId') !== activeTab.id) return;
            setState('backlinksData', backlinks);
            setState('backlinksTargetPath', activeTab.path);
            
            if (statusEl) {
                const count = backlinks.length;
                statusEl.textContent = count === 1 ? '1 backlink' : `${count} backlinks`;
                if (count > 0) {
                    statusEl.classList.add('has-backlinks');
                    statusEl.style.cursor = 'pointer';
                    statusEl.title = `Click to see ${count} backlink${count !== 1 ? 's' : ''}`;
                } else {
                    statusEl.classList.remove('has-backlinks');
                    statusEl.style.cursor = 'default';
                    statusEl.title = 'No backlinks found';
                }
            }
        } catch (err) {
            if (requestId !== backlinksRequestId || getState('activeTabId') !== activeTab.id) return;
            log.error(`Failed to load backlinks: ${backlinkErrorMessage(err)}`);
            if (statusEl) statusEl.textContent = '0 backlinks';
        }
    } else {
        setState('backlinksData', []);
        setState('backlinksTargetPath', null);
        if (statusEl) {
            statusEl.textContent = '0 backlinks';
            statusEl.title = 'Open a file to see backlinks';
            statusEl.style.cursor = 'default';
        }
    }
}

/**
 * Load backlinks results for a tab panel
 * @param {string} targetPath - Target file path
 * @param {string} containerId - Container element ID
 */
export async function loadBacklinksResults(targetPath, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const requestId = (backlinksResultsRequestIds.get(containerId) || 0) + 1;
    backlinksResultsRequestIds.set(containerId, requestId);
    
    container.innerHTML = '<div class="results-loading">Loading relationships...</div>';
    
    try {
        const [backlinks, unlinked] = await Promise.all([
            backend().SearchBacklinks(targetPath).then(normalizeBacklinks),
            backend().SearchUnlinkedMentions(targetPath).then(normalizeBacklinks),
        ]);
        if (backlinksResultsRequestIds.get(containerId) !== requestId || !container.isConnected) return;
        container.innerHTML = renderRelationshipSections(backlinks, unlinked, targetPath);
        
        // Click delegation on container for left/middle-click behavior
        container.onclick = (e) => {
            const linkAction = e.target.closest('.relationship-link-action');
            if (linkAction) {
                e.preventDefault();
                void linkUnlinkedMention(linkAction, targetPath, containerId);
                return;
            }
            const card = e.target.closest('.result-card');
            if (!card || !e.target.closest('.relationship-open')) return;
            e.preventDefault();

            const path = card.dataset.path;
            const tabs = getState('openTabs');
            const existing = tabs.find(t => t.id === path);

            if (existing) {
                openTab(path, path.split('/').pop(), 'file', { path });
            } else {
                // Left-click: replace current file tab
                const activeId = getState('activeTabId');
                const activeTab = tabs.find(t => t.id === activeId);
                if (activeTab && activeTab.type === 'file') {
                    const newTabs = tabs.filter(t => t.id !== activeId);
                    const panel = document.querySelector(`.tab-panel[data-tab-id="${activeId}"]`);
                    if (panel) panel.remove();
                    setState('openTabs', newTabs);
                }
                openTab(path, path.split('/').pop(), 'file', { path });
            }
        };

        container.onauxclick = (e) => {
            if (e.button !== 1) return;
            const card = e.target.closest('.result-card');
            if (!card || !e.target.closest('.relationship-open')) return;
            e.preventDefault();

            const path = card.dataset.path;
            openTab(path, path.split('/').pop(), 'file', { path });
        };

        // Clean up backlinks content when switching away
        if (container._backlinksUnsubscribe) container._backlinksUnsubscribe();
        const cleanupOnSwitch = () => {
            if (!container.isConnected) {
                container._backlinksUnsubscribe?.();
                container._backlinksUnsubscribe = null;
                return;
            }
            const activeTab = getState('openTabs').find(t => t.id === getState('activeTabId'));
            if (!activeTab || activeTab.type !== 'backlinks') {
                container.innerHTML = '';
            }
        };
        container._backlinksUnsubscribe = subscribe('activeTabId', cleanupOnSwitch);
    } catch (err) {
        if (backlinksResultsRequestIds.get(containerId) !== requestId || !container.isConnected) return;
        log.error(`Backlinks load failed: ${backlinkErrorMessage(err)}`);
        container.innerHTML = '<div class="results-error">Failed to load backlinks</div>';
    }
}

function renderRelationshipSections(backlinks, unlinked, targetPath) {
    return `
        ${renderRelationshipSection('Backlinks', 'Notes that already link here.', backlinks, 'No backlinks found', false, targetPath)}
        ${renderRelationshipSection('Unlinked mentions', 'Plain-text mentions that you may want to link.', unlinked, 'No unlinked mentions found', true, targetPath)}
    `;
}

function renderRelationshipSection(title, description, results, emptyMessage, unlinked, targetPath) {
    const cards = results.map(link => renderRelationshipCard(link, unlinked, targetPath)).join('');
    return `
        <section class="relationship-section">
            <div class="relationship-section-heading">
                <div>
                    <h3>${title}</h3>
                    <p>${description}</p>
                </div>
                <span class="relationship-count">${results.length}</span>
            </div>
            <div class="results-list relationship-results">
                ${cards || `<div class="results-empty relationship-empty">${emptyMessage}</div>`}
            </div>
        </section>
    `;
}

function renderRelationshipCard(link, unlinked, targetPath) {
    const context = String(link.context || link.snippet || '');
    const match = String(link.match_text || '');
    return `
        <article class="result-card relationship-card" data-path="${escapeAttr(link.path)}">
            <button type="button" class="relationship-open" aria-label="Open ${escapeAttr(link.path)} at line ${Number(link.line_num) || 1}">
                <div class="result-card-title">${escapeHtml(link.name.replace(/\.md$/i, ''))}</div>
                <div class="result-card-meta">
                    <span class="result-card-path">${escapeHtml(link.path)}</span>
                    <span class="result-card-line">Line ${Number(link.line_num) || 1}</span>
                </div>
                <div class="result-card-snippet relationship-context">${highlightMatch(context, match)}</div>
            </button>
            ${unlinked ? `<button type="button" class="relationship-link-action" data-path="${escapeAttr(link.path)}" data-line="${Number(link.line_num) || 1}" data-target="${escapeAttr(targetPath)}">Link this mention</button>` : ''}
        </article>
    `;
}

async function linkUnlinkedMention(button, targetPath, containerId) {
    if (button.disabled) return;
    const sourcePath = button.dataset.path;
    const lineNumber = Number(button.dataset.line);
    if (!sourcePath || !Number.isInteger(lineNumber) || lineNumber < 1) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Linking…';
    try {
        const { prepareTabsForVaultLinkRewrite, refreshTabsForUpdatedLinks } = await import('./tabManager.js');
        const prepared = await prepareTabsForVaultLinkRewrite();
        if (!prepared?.success) throw new Error(prepared?.error || 'Open notes could not be saved safely.');
        const { getLinkStylePreference } = await import('./linkStyle.js');
        const result = await backend().LinkUnlinkedMention(sourcePath, lineNumber, targetPath, getLinkStylePreference());
        if (!result?.success) throw new Error(result?.error || 'The mention could not be linked.');
        await refreshTabsForUpdatedLinks([sourcePath]);
        await updateBacklinksForActiveTab();
        await loadBacklinksResults(targetPath, containerId);
        statusBar.set('Linked mention to note');
    } catch (error) {
        log.warn('Could not link unlinked mention:', error);
        await errorDialog('Couldn’t link this mention', error, 'The source note was left unchanged.');
        if (button.isConnected) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = 'Link this mention';
        }
    }
}

/**
 * Highlight match in snippet
 */
function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
    if (!query) return escaped;
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
}

/**
 * Escape regex special characters
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape HTML attribute value
 */
function escapeAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default {
    initBacklinks,
    loadBacklinksResults
};

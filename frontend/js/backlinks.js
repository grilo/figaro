/**
 * Backlinks Module - Backlinks status bar link for current file
 */

import { log } from './log.js';
import { setState, getState, subscribe } from './state.js';
import { openTab } from './tabManager.js';

let backlinksRequestId = 0;
const backlinksResultsRequestIds = new Map();

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
async function updateBacklinksForActiveTab() {
    const activeTab = getState('openTabs').find(t => t.id === getState('activeTabId'));
    const statusEl = document.getElementById('backlinks-status');
    const requestId = ++backlinksRequestId;
    
    if (activeTab && activeTab.type === 'file' && activeTab.path) {
        try {
            const backlinks = await window.pywebview.api.search_backlinks(activeTab.path);
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
            log.error('Failed to load backlinks:', err);
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
    
    container.innerHTML = '<div class="results-loading">Loading backlinks...</div>';
    
    try {
        const backlinks = await window.pywebview.api.search_backlinks(targetPath);
        if (backlinksResultsRequestIds.get(containerId) !== requestId || !container.isConnected) return;
        
        if (!backlinks || backlinks.length === 0) {
            container.innerHTML = '<div class="results-empty">No backlinks found</div>';
            return;
        }
        
        let html = '';
        for (const link of backlinks) {
            const snippet = highlightMatch(link.snippet, link.name.replace('.md', ''));
            html += `
                <div class="result-card" data-path="${escapeAttr(link.path)}">
                    <div class="result-card-title">${escapeHtml(link.name.replace('.md', ''))}</div>
                    <div class="result-card-meta">
                        <span class="result-card-path">${escapeHtml(link.path)}</span>
                        <span class="result-card-line">Line ${link.line_num}</span>
                    </div>
                    <div class="result-card-snippet">${snippet}</div>
                </div>
            `;
        }
        container.innerHTML = html;
        
        // Click delegation on container for left/middle-click behavior
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.result-card');
            if (!card) return;
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
        });

        container.addEventListener('auxclick', (e) => {
            if (e.button !== 1) return;
            const card = e.target.closest('.result-card');
            if (!card) return;
            e.preventDefault();

            const path = card.dataset.path;
            openTab(path, path.split('/').pop(), 'file', { path });
        });

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
        log.error('Backlinks load failed:', err);
        container.innerHTML = '<div class="results-error">Failed to load backlinks</div>';
    }
}

/**
 * Highlight match in snippet
 */
function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
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

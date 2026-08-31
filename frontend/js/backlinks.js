import { backend } from './backend.js';
/**
 * Backlinks Module - Backlinks status bar link for current file
 */

import { log } from './log.js';
import { setState, getState, subscribe } from './state.js';
import { getLinkStylePreference } from './linkStyle.js';
import { errorDialog } from './dialogs.js';
import { statusBar } from './statusBar.js';
import { relationshipWindow } from './core/relationshipModel.js';

let backlinksRequestId = 0;
const backlinksResultsRequestIds = new Map();
const relationshipRenderStates = new WeakMap();
let workspacePorts = null;

const RELATIONSHIP_VIRTUAL_THRESHOLD = 120;
const RELATIONSHIP_WINDOW_SIZE = 96;
const RELATIONSHIP_ROW_STRIDE = 126;

export function configureBacklinksWorkspace(ports) {
    if (
        typeof ports?.openTab !== 'function'
        || typeof ports?.prepareTabsForVaultLinkRewrite !== 'function'
        || typeof ports?.refreshTabsForUpdatedLinks !== 'function'
    ) throw new TypeError('Backlinks workspace ports are incomplete');
    workspacePorts = Object.freeze({ ...ports });
}

function workspace() {
    if (!workspacePorts) throw new Error('Backlinks workspace ports were not configured');
    return workspacePorts;
}

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
                    statusEl.disabled = false;
                    statusEl.title = `Open ${count} backlink${count !== 1 ? 's' : ''}`;
                } else {
                    statusEl.classList.remove('has-backlinks');
                    statusEl.disabled = true;
                    statusEl.title = 'No backlinks found';
                }
            }
        } catch (err) {
            if (requestId !== backlinksRequestId || getState('activeTabId') !== activeTab.id) return;
            log.error(`Failed to load backlinks: ${backlinkErrorMessage(err)}`);
            if (statusEl) {
                statusEl.textContent = '0 backlinks';
                statusEl.classList.remove('has-backlinks');
                statusEl.disabled = true;
                statusEl.title = 'Backlinks could not be loaded';
            }
        }
    } else {
        setState('backlinksData', []);
        setState('backlinksTargetPath', null);
        if (statusEl) {
            statusEl.textContent = '0 backlinks';
            statusEl.title = 'Open a file to see backlinks';
            statusEl.classList.remove('has-backlinks');
            statusEl.disabled = true;
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
        const backlinkRange = backlinks.length > RELATIONSHIP_VIRTUAL_THRESHOLD
            ? relationshipWindow(backlinks.length, { windowSize: RELATIONSHIP_WINDOW_SIZE })
            : { start: 0, end: backlinks.length };
        relationshipRenderStates.set(container, {
            backlinks,
            backlinkRange,
            focusProtection: null,
            rowStride: RELATIONSHIP_ROW_STRIDE,
            targetPath,
            unlinked,
        });
        container.innerHTML = renderRelationshipSections(
            backlinks,
            unlinked,
            targetPath,
            backlinkRange,
        );
        initRelationshipWindowing(container);
        
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
                workspace().openTab(path, path.split('/').pop(), 'file', { path });
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
                workspace().openTab(path, path.split('/').pop(), 'file', { path });
            }
        };

        container.onauxclick = (e) => {
            if (e.button !== 1) return;
            const card = e.target.closest('.result-card');
            if (!card || !e.target.closest('.relationship-open')) return;
            e.preventDefault();

            const path = card.dataset.path;
            workspace().openTab(path, path.split('/').pop(), 'file', { path });
        };

        container.onkeydown = event => {
            if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
            const button = event.target.closest('.relationship-open[data-relationship-index]');
            if (!button || !container.contains(button)) return;
            const state = relationshipRenderStates.get(container);
            const targetIndex = Number(button.dataset.relationshipIndex) + (event.shiftKey ? -1 : 1);
            if (!state || targetIndex < 0 || targetIndex >= state.backlinks.length) return;
            event.preventDefault();
            focusRelationshipIndex(container, targetIndex);
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
                relationshipRenderStates.delete(container);
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

function renderRelationshipSections(
    backlinks,
    unlinked,
    targetPath,
    backlinkRange = { start: 0, end: backlinks.length },
) {
    return `
        ${renderRelationshipSection('Backlinks', 'Notes that already link here.', backlinks, 'No backlinks found', false, targetPath, backlinkRange)}
        ${renderRelationshipSection('Unlinked mentions', 'Plain-text mentions that you may want to link.', unlinked, 'No unlinked mentions found', true, targetPath)}
    `;
}

function renderRelationshipSection(
    title,
    description,
    results,
    emptyMessage,
    unlinked,
    targetPath,
    range = { start: 0, end: results.length },
) {
    const cards = renderRelationshipCards(results, unlinked, targetPath, range);
    return `
        <section class="relationship-section">
            <div class="relationship-section-heading">
                <div>
                    <h3>${title}</h3>
                    <p>${description}</p>
                </div>
                <span class="ui-badge ui-badge--muted relationship-count">${results.length}</span>
            </div>
            <div class="results-list relationship-results" role="list"
                 data-relationship-section="${unlinked ? 'unlinked' : 'backlinks'}">
                ${cards || `<div class="results-empty relationship-empty">${emptyMessage}</div>`}
            </div>
        </section>
    `;
}

function renderRelationshipCards(results, unlinked, targetPath, range, rowStride = RELATIONSHIP_ROW_STRIDE) {
    if (!results.length) return '';
    const cards = [];
    if (!unlinked && range.start > 0) {
        cards.push(`<div class="relationship-spacer" aria-hidden="true"
            style="height:${range.start * rowStride}px"></div>`);
    }
    results.slice(range.start, range.end).forEach((link, offset) => {
        cards.push(renderRelationshipCard(
            link,
            unlinked,
            targetPath,
            unlinked ? -1 : range.start + offset,
            results.length,
        ));
    });
    if (!unlinked && range.end < results.length) {
        cards.push(`<div class="relationship-spacer" aria-hidden="true"
            style="height:${(results.length - range.end) * rowStride}px"></div>`);
    }
    return cards.join('');
}

function renderRelationshipCard(link, unlinked, targetPath, index = -1, resultCount = 0) {
    const context = String(link.context || link.snippet || '');
    const match = String(link.match_text || '');
    return `
        <article class="result-card relationship-card" role="listitem" data-path="${escapeAttr(link.path)}">
            <button type="button" class="relationship-open" aria-label="Open ${escapeAttr(link.path)} at line ${Number(link.line_num) || 1}"
                    ${index >= 0 ? `data-relationship-index="${index}" aria-posinset="${index + 1}" aria-setsize="${resultCount}"` : ''}>
                <div class="result-card-title">${escapeHtml(link.name.replace(/\.md$/i, ''))}</div>
                <div class="result-card-meta">
                    <span class="result-card-path">${escapeHtml(link.path)}</span>
                    <span class="result-card-line">Line ${Number(link.line_num) || 1}</span>
                </div>
                <div class="result-card-snippet relationship-context">${highlightMatch(context, match)}</div>
            </button>
            ${unlinked ? `<button type="button" class="ui-button ui-button--accent relationship-link-action" data-path="${escapeAttr(link.path)}" data-line="${Number(link.line_num) || 1}" data-target="${escapeAttr(targetPath)}">Link this mention</button>` : ''}
        </article>
    `;
}

function renderBacklinkWindow(container, { anchorIndex = 0, selectedIndex = -1 } = {}) {
    const state = relationshipRenderStates.get(container);
    const results = container.querySelector('[data-relationship-section="backlinks"]');
    if (!state || !results) return false;
    const protectedIndex = state.focusProtection?.index ?? -1;
    const range = state.backlinks.length > RELATIONSHIP_VIRTUAL_THRESHOLD
        ? relationshipWindow(state.backlinks.length, {
            anchorIndex,
            selectedIndex: protectedIndex >= 0 ? protectedIndex : selectedIndex,
            windowSize: RELATIONSHIP_WINDOW_SIZE,
        })
        : { start: 0, end: state.backlinks.length };
    state.backlinkRange = range;
    results.innerHTML = renderRelationshipCards(
        state.backlinks,
        false,
        state.targetPath,
        range,
        state.rowStride,
    );
    if (protectedIndex >= range.start && protectedIndex < range.end) {
        const protectedButton = results.querySelector(
            `[data-relationship-index="${protectedIndex}"]`,
        );
        if (document.activeElement === document.body) {
            protectedButton?.focus({ preventScroll: true });
        }
    }
    return true;
}

function focusRelationshipIndex(container, index) {
    const state = relationshipRenderStates.get(container);
    if (!state || index < 0 || index >= state.backlinks.length) return false;
    state.focusProtection = { index };
    let button = container.querySelector(`[data-relationship-index="${index}"]`);
    if (!button) {
        renderBacklinkWindow(container, { selectedIndex: index });
        button = container.querySelector(`[data-relationship-index="${index}"]`);
    }
    if (!button) return false;
    button.focus({ preventScroll: true });
    button.scrollIntoView?.({ block: 'nearest' });
    return true;
}

function initRelationshipWindowing(container) {
    const state = relationshipRenderStates.get(container);
    const scroller = container.closest('.backlinks-view-wrapper');
    if (!state || !scroller || state.backlinks.length <= RELATIONSHIP_VIRTUAL_THRESHOLD) return;
    let frame = 0;
    scroller.onscroll = () => {
        if (frame) return;
        frame = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => {
            frame = 0;
            const activeState = relationshipRenderStates.get(container);
            const results = container.querySelector('[data-relationship-section="backlinks"]');
            if (!activeState || !results || activeState.focusProtection) return;
            const relativeTop = Math.max(
                0,
                scroller.getBoundingClientRect().top - results.getBoundingClientRect().top,
            );
            const anchorIndex = Math.floor(relativeTop / activeState.rowStride);
            const range = relationshipWindow(activeState.backlinks.length, {
                anchorIndex,
                windowSize: RELATIONSHIP_WINDOW_SIZE,
            });
            if (
                range.start !== activeState.backlinkRange.start
                || range.end !== activeState.backlinkRange.end
            ) renderBacklinkWindow(container, { anchorIndex });
        });
    };
    const releaseFocusProtection = () => {
        const activeState = relationshipRenderStates.get(container);
        if (activeState) activeState.focusProtection = null;
    };
    scroller.onwheel = releaseFocusProtection;
    scroller.onpointerdown = releaseFocusProtection;
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
        const prepared = await workspace().prepareTabsForVaultLinkRewrite();
        if (!prepared?.success) throw new Error(prepared?.error || 'Open notes could not be saved safely.');
        const result = await backend().LinkUnlinkedMention(sourcePath, lineNumber, targetPath, getLinkStylePreference());
        if (!result?.success) throw new Error(result?.error || 'The mention could not be linked.');
        await workspace().refreshTabsForUpdatedLinks([sourcePath]);
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

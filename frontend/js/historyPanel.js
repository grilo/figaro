import { backend } from './backend.js';
/**
 * History Panel — right sidebar showing git file history
 */
import { log } from './log.js';
import { getState } from './state.js';
import { confirmDialog, errorDialog } from './dialogs.js';
import { statusBar } from './statusBar.js';

let liveContent = null;
let viewingHistory = false;
let currentFilePath = null;
let historyListRequestId = 0;
let historyVersionRequestId = 0;
let historyModeRequestId = 0;
let historyModeTabId = null;
let viewedVersionContent = null;
let viewedVersionHash = null;
let historyNotice = '';
let gitStatusPath = null;
let gitStatusRequestId = 0;
let gitCommitInProgress = false;

const pdfPreviewMinimumWidth = 340;
const pdfPreviewMinimumEditorWidth = 320;
const compactEditorThreshold = 560;

export function initHistoryPanel() {
    document.addEventListener('close-history-panel', closeHistoryPanel);

    // Status bar click
    const countEl = document.getElementById('history-count');
    if (countEl) {
        countEl.addEventListener('click', () => {
            if (countEl.classList.contains('has-history')) toggleHistoryPanel();
        });
    }

    const gitStatus = document.getElementById('git-status');
    if (gitStatus) {
        gitStatus.addEventListener('click', () => commitCurrentFileChanges());
    }

    // Right sidebar resizer
    initRightSidebarResizer();

    // Listen for active tab changes to update count
    document.addEventListener('tab-switched', (e) => {
        if (e.detail && e.detail.path) {
            updateHistoryCount(e.detail.path);
            updateGitStatus(e.detail.path);
        }
    });
    document.addEventListener('active-tab-changed', (event) => {
        const path = event.detail?.path || '';
        updateHistoryCount(path);
        updateGitStatus(path);
    });
    document.addEventListener('active-file-dirty', (event) => {
        if (event.detail?.path === gitStatusPath) setGitStatusState(true);
    });
    document.addEventListener('vault-file-saved', (event) => {
        if (event.detail?.path === gitStatusPath) updateGitStatus(gitStatusPath);
    });
    document.addEventListener('vault-filesystem-changed', () => updateGitStatus(gitStatusPath));
    document.addEventListener('vault-history-changed', () => {
        updateGitStatus(gitStatusPath);
        if (currentFilePath) updateHistoryCount(currentFilePath);
    });

    const activeTab = (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId'));
    const initialPath = activeTab?.type === 'file' ? activeTab.path : '';
    updateHistoryCount(initialPath);
    updateGitStatus(initialPath);
}

export function updateHistoryCount(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        currentFilePath = null;
        historyNotice = '';
        const countEl = document.getElementById('history-count');
        if (countEl) {
            countEl.textContent = '0 changes';
            countEl.classList.remove('has-history');
        }
        return;
    }
    if (filePath === currentFilePath && viewingHistory) return;
    if (filePath !== currentFilePath) historyNotice = '';
    currentFilePath = filePath;

    const countEl = document.getElementById('history-count');
    if (!countEl) return;

    try {
        return backend().GetCommitCount(filePath).then(count => {
            if (filePath !== currentFilePath) return; // stale
            if (count > 0) {
                countEl.textContent = count + ' change' + (count !== 1 ? 's' : '');
                countEl.classList.add('has-history');
            } else {
                countEl.textContent = '0 changes';
                countEl.classList.remove('has-history');
            }
        }).catch(() => {
            if (filePath !== currentFilePath) return;
            countEl.textContent = '0 changes';
            countEl.classList.remove('has-history');
        });
    } catch (_) {
        countEl.textContent = '0 changes';
        countEl.classList.remove('has-history');
        return Promise.resolve();
    }
}

function setGitStatusVisibility(visible) {
    const button = document.getElementById('git-status');
    const separator = document.getElementById('git-status-separator');
    if (button) button.hidden = !visible;
    if (separator) separator.hidden = !visible;
}

function setGitStatusState(uncommitted) {
    const button = document.getElementById('git-status');
    if (!button) return;
    // Git is an implementation detail of Figaro's local History. Keep the
    // status bar quiet while a file is already recorded, then surface a
    // single, plain-language action only when there is useful work to do.
    setGitStatusVisibility(Boolean(gitStatusPath && uncommitted));
    button.classList.toggle('is-uncommitted', Boolean(uncommitted));
    button.classList.remove('has-error');
    if (!gitCommitInProgress) {
        button.disabled = !uncommitted;
        button.textContent = 'Save to history';
        button.title = uncommitted
            ? 'Save this file to its local history'
            : 'This file is already saved to its local history';
    }
}

function setGitStatusError() {
    const button = document.getElementById('git-status');
    if (!button) return;
    setGitStatusVisibility(Boolean(gitStatusPath));
    button.textContent = 'History unavailable';
    button.title = 'Figaro could not read this file’s local-history status';
    button.disabled = true;
    button.classList.remove('is-uncommitted');
    button.classList.add('has-error');
}

/** Refresh the active file's Git state without including unrelated files. */
export async function updateGitStatus(filePath) {
    const requestId = ++gitStatusRequestId;
    gitStatusPath = typeof filePath === 'string' && filePath ? filePath : null;
    if (!gitStatusPath) {
        setGitStatusVisibility(false);
        return false;
    }

    const path = gitStatusPath;
    const activeTab = (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId'));
    if (activeTab?.type === 'file' && activeTab.path === path && activeTab.dirty) {
        setGitStatusState(true);
        return true;
    }

    try {
        const uncommitted = await backend().FileHasUncommittedChanges(path);
        if (requestId !== gitStatusRequestId || gitStatusPath !== path) return false;
        setGitStatusState(Boolean(uncommitted));
        return Boolean(uncommitted);
    } catch (error) {
        if (requestId !== gitStatusRequestId || gitStatusPath !== path) return false;
        log.warn('[history] Git status failed:', error);
        setGitStatusError();
        return false;
    }
}

/** Save pending editor text, then commit only the active file. */
export async function commitCurrentFileChanges() {
    if (gitCommitInProgress || !gitStatusPath) return false;
    const path = gitStatusPath;
    const tab = (getState('openTabs') || []).find(candidate => candidate.id === getState('activeTabId'));
    if (!tab || tab.type !== 'file' || tab.path !== path) return false;

    const button = document.getElementById('git-status');
    gitCommitInProgress = true;
    if (button) {
        button.disabled = true;
        button.classList.add('is-committing');
        button.setAttribute('aria-busy', 'true');
        button.textContent = tab.dirty ? 'Saving…' : 'Saving to history…';
    }

    try {
        if (tab.dirty) {
            const [{ getEditorContent }, { saveFileSnapshot }] = await Promise.all([
                import('./editor.js'),
                import('./tabManager.js'),
            ]);
            // A fast tab switch caches the old document on its tab before the
            // active ID changes. Never read the replacement tab's editor text
            // into the file whose commit was clicked.
            const pendingContent = getState('activeTabId') === tab.id
                ? getEditorContent()
                : tab._content;
            if (typeof pendingContent !== 'string') {
                throw new Error('The pending editor text is not available to save safely.');
            }
            const saved = await saveFileSnapshot(tab, pendingContent);
            if (!saved?.success) throw new Error(saved?.error || 'The file could not be saved before committing.');
            if (button && gitStatusPath === path) button.textContent = 'Saving to history…';
            if (saved.historyCommitSucceeded) {
                statusBar.set('Saved file to local history');
                await updateHistoryCount(path);
                await refreshHistoryIfOpen();
                return true;
            }
        }
        await backend().CommitCurrentFile(path);
        statusBar.set('Saved file to local history');
        await updateHistoryCount(path);
        await refreshHistoryIfOpen();
        return true;
    } catch (error) {
        log.error('[history] Commit failed:', error);
        await errorDialog(
            'Couldn’t commit this file',
            error,
            'The file was not removed or overwritten. Its uncommitted changes are still available.'
        );
        return false;
    } finally {
        gitCommitInProgress = false;
        if (button?.isConnected) {
            button.classList.remove('is-committing');
            button.removeAttribute('aria-busy');
        }
        if (gitStatusPath) await updateGitStatus(gitStatusPath);
    }
}


export async function refreshHistoryIfOpen() {
    const sidebar = document.getElementById('right-sidebar');
    if (!sidebar || !sidebar.classList.contains('open') || sidebar.dataset.mode !== 'history') return;
    if (!currentFilePath) return;

    const content = document.getElementById('history-content') || document.getElementById('right-sidebar-content');
    if (!content) return;
    const filePath = currentFilePath;
    const requestId = ++historyListRequestId;

    try {
        const entries = await backend().GetFileHistory(filePath);
        if (requestId !== historyListRequestId || currentFilePath !== filePath || !sidebar.classList.contains('open') || sidebar.dataset.mode !== 'history' || !content.isConnected) return;
        renderHistoryList(content, entries);
        updateHistoryCount(filePath);
    } catch (_) { /* noop */ }
}

async function toggleHistoryPanel() {
    const sidebar = document.getElementById('right-sidebar');
    if (!sidebar) return;

    if (sidebar.classList.contains('open') && sidebar.dataset.mode === 'history') {
        closeHistoryPanel();
    } else {
        await openHistoryPanel();
    }
}

async function openHistoryPanel() {
    const sidebar = document.getElementById('right-sidebar');
    if (!sidebar || !currentFilePath) return;

    // History owns the right pane while open. Ask the other pane modes to
    // release their content first so switching stays predictable.
    document.dispatchEvent(new CustomEvent('close-outline-panel', { detail: { keepSidebarOpen: true } }));
    document.dispatchEvent(new CustomEvent('close-pdf-preview', { detail: { keepSidebarOpen: true } }));
    document.dispatchEvent(new CustomEvent('close-markdown-preview', { detail: { keepSidebarOpen: true } }));

    const histContent = document.getElementById('history-content');
    const rightTitle = document.getElementById('right-sidebar-title');

    if (histContent) histContent.style.display = '';
    if (rightTitle) rightTitle.textContent = 'History';

    sidebar.dataset.mode = 'history';
    sidebar.classList.remove('pdf-preview-mode');
    sidebar.classList.add('open');
    const resizer2 = document.getElementById('right-sidebar-resizer');
    if (resizer2) resizer2.classList.add('visible');

    const content = document.getElementById('history-content');
    if (!content) return;
    const filePath = currentFilePath;
    historyNotice = '';
    const requestId = ++historyListRequestId;

    content.innerHTML = '<div class="history-empty">Loading history...</div>';

    try {
        const entries = await backend().GetFileHistory(filePath);
        if (requestId !== historyListRequestId || currentFilePath !== filePath || !sidebar.classList.contains('open') || sidebar.dataset.mode !== 'history' || !content.isConnected) return;
        renderHistoryList(content, entries);
    } catch (e) {
        if (requestId !== historyListRequestId || currentFilePath !== filePath || !sidebar.classList.contains('open') || sidebar.dataset.mode !== 'history' || !content.isConnected) return;
        content.innerHTML = '<div class="history-empty">Failed to load history</div>';
        log.error('[history] Failed to load:', e);
    }

    // Trigger resize event for CodeMirror
    window.dispatchEvent(new Event('resize'));
}

function renderHistoryList(container, entries) {
    if (!entries || entries.length === 0) {
        container.innerHTML = '<div class="history-empty">No committed history yet. Enable Auto-Commit in Settings to record versions.</div>';
        return;
    }

    const notice = historyNotice
        ? `<p class="history-current-notice" role="status">${historyNotice}</p>`
        : '';
    container.innerHTML = notice + `<div class="history-list">${entries.map((entry, i) => {
        const date = new Date(entry.timestamp * 1000);
        const timeStr = date.toLocaleString();

        return `<div class="history-item" data-index="${i}" data-hash="${entry.hash}">
            <div class="history-item-time">${timeStr}${i === 0 ? '<span class="history-item-latest">Latest committed</span>' : ''}</div>
        </div>`;
    }).join('')}</div>`;

    // Click handlers
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async () => {
            const hash = item.dataset.hash;
            await viewHistoryVersion(hash);
        });
    });
}

function clearHistoryRevertAction() {
    document.querySelector('.history-revert-action')?.remove();
}

function showHistoryRevertAction(hash) {
    const content = document.getElementById('history-content') || document.getElementById('right-sidebar-content');
    const selected = content?.querySelector(`[data-hash="${hash}"]`);
    if (!content || !selected) return;

    clearHistoryRevertAction();
    const action = document.createElement('div');
    action.className = 'history-revert-action';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-revert-button';
    button.textContent = 'Revert to this version';
    button.addEventListener('click', restoreViewedVersion);
    const compare = document.createElement('button');
    compare.type = 'button';
    compare.className = 'history-diff-toggle';
    compare.textContent = 'Compare to current';
    compare.setAttribute('aria-expanded', 'false');
    compare.addEventListener('click', () => toggleHistoryDiff(hash, compare));
    const actions = document.createElement('div');
    actions.className = 'history-revert-controls';
    actions.append(compare, button);
    action.append(actions);
    selected.insertAdjacentElement('afterend', action);
}

async function toggleHistoryDiff(hash, trigger) {
    const action = trigger.closest('.history-revert-action');
    if (!action || !viewingHistory || viewedVersionHash !== hash || viewedVersionContent === null) return;
    const existing = action.querySelector('.history-diff');
    if (existing) {
        existing.remove();
        trigger.textContent = 'Compare to current';
        trigger.setAttribute('aria-expanded', 'false');
        return;
    }

    const { renderMarkdownDiff } = await import('./historyDiff.js');
    if (!action.isConnected || !viewingHistory || viewedVersionHash !== hash || viewedVersionContent === null) return;
    const diff = document.createElement('section');
    diff.className = 'history-diff';
    diff.setAttribute('aria-label', 'Changes between the selected version and current content');
    diff.innerHTML = renderMarkdownDiff(liveContent ?? '', viewedVersionContent).html;
    action.append(diff);
    trigger.textContent = 'Hide comparison';
    trigger.setAttribute('aria-expanded', 'true');
}

async function viewHistoryVersion(hash) {
    if (!currentFilePath) return;

    const filePath = currentFilePath;
    const requestId = ++historyVersionRequestId;

    const content = document.getElementById('history-content') || document.getElementById('right-sidebar-content');
    
    // Highlight selected and keep version actions in the History pane.
    content.querySelectorAll('.history-item').forEach(el => el.classList.remove('is-selected'));
    const selected = content.querySelector(`[data-hash="${hash}"]`);
    selected?.classList.add('is-selected');
    clearHistoryRevertAction();

    // If clicking the latest version, exit history mode (no need for read-only)
    const firstItem = content.querySelector('.history-item');
    if (firstItem && firstItem.dataset.hash === hash) {
        if (viewingHistory) exitHistoryMode();
        return;
    }

    try {
        const versionContent = await backend().GetFileVersion(filePath, hash);
        const sidebar = document.getElementById('right-sidebar');
        if (requestId !== historyVersionRequestId || currentFilePath !== filePath || !sidebar?.classList.contains('open') || sidebar.dataset.mode !== 'history' || !content?.isConnected) return;
        await enterHistoryMode(versionContent, hash);
    } catch (e) {
        log.error('[history] Failed to load version: ' + (typeof e === 'string' ? e : (e.message || String(e))));
    }
}

async function enterHistoryMode(versionContent, hash) {
    const requestId = ++historyModeRequestId;
    const { getEditorView, getEditorContent, setEditorContent, setReadOnly } = await import('./editor.js');
    if (requestId !== historyModeRequestId) return;

    // Cache live content if not already cached
    if (!viewingHistory) {
        liveContent = getEditorContent();
        historyModeTabId = getState('activeTabId');
        viewingHistory = true;
    }

    // Set editor to read-only with history tint
    const view = getEditorView();
    if (view) {
        view.dom.classList.add('history-mode');
    }

    if (typeof setReadOnly === 'function') setReadOnly(true);
    if (requestId !== historyModeRequestId) return;

    // Load historical content
    setEditorContent(versionContent);
    viewedVersionContent = versionContent;
    viewedVersionHash = hash;

    // Keep the editor's banner informational; the destructive action belongs
    // beside the selected revision in the right-pane History list.
    showHistoryBanner();
    showHistoryRevertAction(hash);
}

function showHistoryBanner() {
    // Remove existing banner
    const existing = document.querySelector('.history-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'history-banner';
    banner.innerHTML = `
        <span class="history-banner-icon">&#128218;</span>
        <span class="history-banner-copy">Read-only historical version. Use History to revert it.</span>
    `;

    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
        editorContainer.insertBefore(banner, editorContainer.firstChild);
    }
}

async function restoreViewedVersion() {
    if (!viewingHistory || viewedVersionContent === null || !currentFilePath) return false;
    const tab = (getState('openTabs') || []).find(candidate => candidate.id === historyModeTabId);
    if (!tab || tab.type !== 'file' || tab.path !== currentFilePath) return false;

    const confirmed = await confirmDialog(
        'Revert to this version?',
        'Figaro will restore this file to the selected version. Your current version will be saved in Git history first, so you can return to it later.',
        false,
        false,
        {
            tone: 'warning',
            icon: 'history',
            confirmLabel: 'Revert file',
            cancelLabel: 'Keep current version',
        }
    );
    if (!confirmed) return false;

    const button = document.querySelector('.history-revert-button');
    if (button) {
        button.disabled = true;
        button.textContent = 'Reverting…';
    }
    const restoredContent = viewedVersionContent;
    try {
        const { saveFileSnapshot } = await import('./tabManager.js');
        const preserved = await saveFileSnapshot(tab, liveContent ?? '');
        if (!preserved?.success) throw new Error(preserved?.error || 'The current version could not be preserved.');
        if (!preserved.historyCommitSucceeded) await backend().CommitCurrentFile(tab.path);

        const restored = await saveFileSnapshot(tab, restoredContent);
        if (!restored?.success) throw new Error(restored?.error || 'The selected version could not be restored.');
        // The restored snapshot must become its own commit. Without this,
        // History still ends at the preserved pre-revert version and leaves
        // the restored contents as an ambiguous uncommitted worktree change.
        if (!restored.historyCommitSucceeded) await backend().CommitCurrentFile(tab.path);
        liveContent = restoredContent;
        historyNotice = 'Restored the selected version as the latest committed version.';
        await exitHistoryMode();
        statusBar.set('Reverted file; previous version kept in history');
        await updateHistoryCount(tab.path);
        await refreshHistoryIfOpen();
        await updateGitStatus(tab.path);
        return true;
    } catch (error) {
        log.error('[history] Revert failed:', error);
        await errorDialog('Couldn’t revert this file', error, 'The selected version was not applied. Your current file remains available.');
        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = 'Revert to this version';
        }
        return false;
    }
}

async function exitHistoryMode() {
    const requestId = ++historyModeRequestId;
    viewingHistory = false;

    const { getEditorView, setEditorContent, setReadOnly } = await import('./editor.js');
    if (requestId !== historyModeRequestId) return;
    const view = getEditorView();

    // Remove history tint + read-only
    if (view) {
        view.dom.classList.remove('history-mode');
        if (typeof setReadOnly === 'function') setReadOnly(false);
    }
    if (requestId !== historyModeRequestId) return;

    // Restore live content
    if (liveContent !== null && getState('activeTabId') === historyModeTabId) {
        setEditorContent(liveContent);
    }
    liveContent = null;
    historyModeTabId = null;
    viewedVersionContent = null;
    viewedVersionHash = null;

    // Remove banner
    const banner = document.querySelector('.history-banner');
    if (banner) banner.remove();
    clearHistoryRevertAction();

    // Remove selection highlight
    const content = document.getElementById('history-content') || document.getElementById('right-sidebar-content');
    if (content) {
        content.querySelectorAll('.history-item').forEach(el => el.classList.remove('is-selected'));
    }
}

export function closeHistoryPanel() {
    const sidebar = document.getElementById('right-sidebar');
    const ownsSidebar = sidebar?.dataset.mode === 'history';
    if (!ownsSidebar && !viewingHistory) return;

    // Invalidate any in-flight list or version request before changing the UI.
    historyListRequestId++;
    historyVersionRequestId++;
    historyModeRequestId++;
    const resizer = document.getElementById('right-sidebar-resizer');
    if (sidebar && ownsSidebar) {
        delete sidebar.dataset.mode;
        sidebar.classList.remove('open');
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
    }
    if (resizer && ownsSidebar) resizer.classList.remove('visible');

    if (viewingHistory) exitHistoryMode();

    window.dispatchEvent(new Event('resize'));
}

function elementWidth(element) {
    if (!element) return 0;
    const rectWidth = Number(element.getBoundingClientRect?.().width);
    if (Number.isFinite(rectWidth) && rectWidth > 0) return rectWidth;
    const offsetWidth = Number(element.offsetWidth);
    return Number.isFinite(offsetWidth) && offsetWidth > 0 ? offsetWidth : 0;
}

export function updateRightSidebarEditorLayout(remainingEditorWidth = null) {
    const sidebar = document.getElementById('right-sidebar');
    const main = document.getElementById('main-content');
    if (!main) return;
    const isPDFPreview = Boolean(sidebar?.classList.contains('open') && sidebar.classList.contains('pdf-preview-mode'));
    const measuredWidth = Number.isFinite(remainingEditorWidth) ? remainingEditorWidth : elementWidth(main);
    main.classList.toggle('pdf-preview-compact-editor', isPDFPreview && measuredWidth > 0 && measuredWidth < compactEditorThreshold);
}

function resizeEvent(type, sidebar, width) {
    document.dispatchEvent(new CustomEvent(type, {
        detail: {
            mode: sidebar.dataset.mode || '',
            width,
        },
    }));
}

export function initRightSidebarResizer() {
    const resizer = document.getElementById('right-sidebar-resizer');
    const sidebar = document.getElementById('right-sidebar');
    if (!resizer || !sidebar || resizer.dataset.bound === 'true') return;
    resizer.dataset.bound = 'true';

    let startX, startWidth, workspaceWidth, activePointerId = null;

    const beginDrag = (e) => {
        e.preventDefault();
        sidebar.classList.add('open');
        sidebar.classList.add('is-resizing');
        resizer.classList.add('is-dragging');
        startX = e.clientX;
        startWidth = sidebar.offsetWidth || 320;
        const main = document.getElementById('main-content');
        workspaceWidth = elementWidth(main) + startWidth;
        activePointerId = Number.isFinite(e.pointerId) ? e.pointerId : null;
        if (activePointerId !== null) {
            try { resizer.setPointerCapture?.(activePointerId); } catch (_) { /* WebKit may reject capture during teardown. */ }
        }
        const moveEvent = activePointerId === null ? 'mousemove' : 'pointermove';
        const upEvent = activePointerId === null ? 'mouseup' : 'pointerup';
        document.addEventListener(moveEvent, onMove);
        document.addEventListener(upEvent, endDrag);
        if (activePointerId !== null) document.addEventListener('pointercancel', endDrag);
        document.body.classList.add('right-sidebar-resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        resizeEvent('right-sidebar-resize-start', sidebar, startWidth);
    };

    function onMove(e) {
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        const diff = startX - e.clientX;
        let newWidth = startWidth + diff;
        const isPDFPreview = sidebar.classList.contains('pdf-preview-mode');
        const minimumWidth = isPDFPreview ? pdfPreviewMinimumWidth : 240;
        const maximumWidth = isPDFPreview
            ? Math.max(minimumWidth, workspaceWidth - pdfPreviewMinimumEditorWidth)
            : 480;
        newWidth = Math.min(maximumWidth, Math.max(minimumWidth, newWidth));
        sidebar.style.width = newWidth + 'px';
        sidebar.style.minWidth = newWidth + 'px';
        document.documentElement.style.setProperty('--right-sidebar-width', newWidth + 'px');
        updateRightSidebarEditorLayout(workspaceWidth - newWidth);
        resizeEvent('right-sidebar-resize', sidebar, newWidth);
    }

    function endDrag(e) {
        if (activePointerId !== null && Number.isFinite(e?.pointerId) && e.pointerId !== activePointerId) return;
        const pointerId = activePointerId;
        const moveEvent = pointerId === null ? 'mousemove' : 'pointermove';
        const upEvent = pointerId === null ? 'mouseup' : 'pointerup';
        document.removeEventListener(moveEvent, onMove);
        document.removeEventListener(upEvent, endDrag);
        document.removeEventListener('pointercancel', endDrag);
        if (pointerId !== null) {
            try { resizer.releasePointerCapture?.(pointerId); } catch (_) { /* Capture may already be gone. */ }
        }
        activePointerId = null;
        resizer.classList.remove('is-dragging');
        sidebar.classList.remove('is-resizing');
        document.body.classList.remove('right-sidebar-resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        updateRightSidebarEditorLayout();
        resizeEvent('right-sidebar-resize-end', sidebar, sidebar.offsetWidth || startWidth);
        window.dispatchEvent(new Event('resize'));
    }

    if (typeof window.PointerEvent === 'function') {
        resizer.addEventListener('pointerdown', beginDrag);
    } else {
        resizer.addEventListener('mousedown', beginDrag);
    }
}

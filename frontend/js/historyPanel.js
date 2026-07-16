/**
 * History Panel — right sidebar showing git file history
 */
import { log } from './log.js';
import { getState } from './state.js';

let liveContent = null;
let viewingHistory = false;
let currentFilePath = null;
let historyListRequestId = 0;
let historyVersionRequestId = 0;
let historyModeRequestId = 0;
let historyModeTabId = null;

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

    // Right sidebar resizer
    initRightSidebarResizer();

    // Listen for active tab changes to update count
    document.addEventListener('tab-switched', (e) => {
        if (e.detail && e.detail.path) {
            updateHistoryCount(e.detail.path);
        }
    });
}

export function updateHistoryCount(filePath) {
    if (!filePath || typeof filePath !== 'string') return;
    if (filePath === currentFilePath && viewingHistory) return;
    currentFilePath = filePath;

    const countEl = document.getElementById('history-count');
    if (!countEl) return;

    try {
        window.pywebview.api.get_commit_count(filePath).then(count => {
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
        const entries = await window.pywebview.api.get_file_history(filePath);
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

    // History owns the right pane while open. Ask the preview to release its
    // isolated frame first so editing a CSS file can switch here cleanly.
    document.dispatchEvent(new CustomEvent('close-pdf-preview', { detail: { keepSidebarOpen: true } }));
    document.getElementById('topbar-calendar')?.classList.remove('active');

    // Show history content, hide calendar content
    const calGrid = document.getElementById('calendar-grid');
    const calLinks = document.getElementById('cal-linked-notes');
    const calToolbar = sidebar.querySelector('.calendar-toolbar');
    const histContent = document.getElementById('history-content');
    const rightTitle = document.getElementById('right-sidebar-title');

    if (calGrid) calGrid.style.display = 'none';
    if (calLinks) calLinks.style.display = 'none';
    if (calToolbar) calToolbar.style.display = 'none';
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
    const requestId = ++historyListRequestId;

    content.innerHTML = '<div class="history-empty">Loading history...</div>';

    try {
        const entries = await window.pywebview.api.get_file_history(filePath);
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

    container.innerHTML = entries.map((entry, i) => {
        const date = new Date(entry.timestamp * 1000);
        const timeStr = date.toLocaleString();
        const shortHash = entry.hash.substring(0, 7);

        return `<div class="history-item" data-index="${i}" data-hash="${entry.hash}">
            <div class="history-item-time">${timeStr}</div>
            <div class="history-item-hash">${shortHash}</div>
        </div>`;
    }).join('');

    // Click handlers
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async () => {
            const hash = item.dataset.hash;
            await viewHistoryVersion(hash);
        });
    });
}

async function viewHistoryVersion(hash) {
    if (!currentFilePath) return;

    const filePath = currentFilePath;
    const requestId = ++historyVersionRequestId;

    const content = document.getElementById('history-content') || document.getElementById('right-sidebar-content');
    
    // Highlight selected
    content.querySelectorAll('.history-item').forEach(el => el.style.background = '');
    const selected = content.querySelector(`[data-hash="${hash}"]`);
    if (selected) selected.style.background = 'var(--active-bg)';

    // If clicking the latest version, exit history mode (no need for read-only)
    const firstItem = content.querySelector('.history-item');
    if (firstItem && firstItem.dataset.hash === hash) {
        if (viewingHistory) exitHistoryMode();
        return;
    }

    try {
        const versionContent = await window.pywebview.api.get_file_version(filePath, hash);
        const sidebar = document.getElementById('right-sidebar');
        if (requestId !== historyVersionRequestId || currentFilePath !== filePath || !sidebar?.classList.contains('open') || sidebar.dataset.mode !== 'history' || !content?.isConnected) return;
        await enterHistoryMode(versionContent);
    } catch (e) {
        log.error('[history] Failed to load version: ' + (typeof e === 'string' ? e : (e.message || String(e))));
    }
}

async function enterHistoryMode(versionContent) {
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

    // Show exit button
    showHistoryBanner();
}

function showHistoryBanner() {
    // Remove existing banner
    const existing = document.querySelector('.history-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'history-banner';
    banner.innerHTML = `
        <span class="history-banner-icon">&#128218;</span>
        <span>Read-only — close history view to make changes.</span>
    `;

    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
        editorContainer.insertBefore(banner, editorContainer.firstChild);
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

    // Remove banner
    const banner = document.querySelector('.history-banner');
    if (banner) banner.remove();

    // Remove selection highlight
    const content = document.getElementById('history-content') || document.getElementById('right-sidebar-content');
    if (content) {
        content.querySelectorAll('.history-item').forEach(el => el.style.background = '');
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

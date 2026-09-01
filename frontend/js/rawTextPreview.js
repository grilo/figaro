/** Exact Markdown source preview for the shared right sidebar. */

import { backend } from './backend.js';
import { copyTextToClipboard, getEditorContent, getEditorView } from './editor.js';
import { getState } from './state.js';
import { updateRightSidebarEditorLayout } from './historyPanel.js';
import { setRightSidebarOpen } from './rightSidebarState.js';
import {
    rawPreviewScrollTopForAnchor,
    rawPreviewScrollTopForProgress,
} from './core/rawTextPreviewModel.js';

const previewMode = 'raw-text-preview';
const markdownPath = /\.(?:md|markdown|mdown|mkdn)$/i;
const scrollSyncIntervalMs = 52;
const sourceMarkerRatio = 0.3;

let initialized = false;
let copyInFlight = false;
let copyRequestId = 0;
const preview = {
    path: '',
    title: '',
    content: '',
    sourceMtime: null,
};
const scrollSync = {
    editor: null,
    listener: null,
    timer: null,
};

function panelElements() {
    const panel = document.getElementById('raw-text-preview-panel');
    if (!panel) return {};
    return {
        panel,
        title: panel.querySelector('.raw-text-preview-document-title'),
        copy: panel.querySelector('[data-action="copy-raw-text"]'),
        stage: panel.querySelector('.raw-text-preview-stage'),
        source: panel.querySelector('.raw-text-preview-source'),
        status: panel.querySelector('.raw-text-preview-status'),
    };
}

function ensurePreviewPanel() {
    let panel = document.getElementById('raw-text-preview-panel');
    if (panel) return panel;
    const content = document.getElementById('right-sidebar-content');
    if (!content) return null;

    panel = document.createElement('section');
    panel.id = 'raw-text-preview-panel';
    panel.className = 'raw-text-preview-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Raw Markdown text');
    panel.innerHTML = `
        <div class="raw-text-preview-toolbar">
            <span class="raw-text-preview-document-title"></span>
            <div class="raw-text-preview-actions">
                <span class="raw-text-preview-format">Raw</span>
                <button type="button" class="ui-button ui-button--primary raw-text-preview-copy" data-action="copy-raw-text">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
                    <span>Copy to Clipboard</span>
                </button>
            </div>
        </div>
        <p class="ui-notice raw-text-preview-status" aria-live="polite">Loading raw text…</p>
        <div class="raw-text-preview-stage">
            <pre class="raw-text-preview-source" tabindex="0" aria-label="Exact Markdown source"></pre>
        </div>
    `;
    content.appendChild(panel);
    return panel;
}

function isPreviewOpen() {
    const sidebar = document.getElementById('right-sidebar');
    return Boolean(preview.path && sidebar?.classList.contains('open') && sidebar.dataset.mode === previewMode);
}

export function isRawTextPreviewOpen() {
    return isPreviewOpen();
}

function setPreviewStatus(message, kind = '') {
    const { status } = panelElements();
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
    status.classList.toggle('ui-notice--danger', kind === 'error');
}

function activePreviewSource() {
    return (getState('openTabs') || []).find(tab =>
        tab?.id === getState('activeTabId')
        && tab.type === 'file'
        && tab.path === preview.path
    ) || null;
}

function clearScrollSync() {
    if (scrollSync.editor && scrollSync.listener) {
        scrollSync.editor.removeEventListener('scroll', scrollSync.listener);
    }
    if (scrollSync.timer !== null) clearTimeout(scrollSync.timer);
    scrollSync.editor = null;
    scrollSync.listener = null;
    scrollSync.timer = null;
}

function editorPositionAtMarker(view) {
    const scroller = view?.scrollDOM;
    const doc = view?.state?.doc;
    if (!scroller || !doc) return null;
    const scrollerRect = scroller.getBoundingClientRect?.() || { left: 0, top: 0 };
    const contentRect = view.contentDOM?.getBoundingClientRect?.() || scrollerRect;
    const markerY = Number(scrollerRect.top || 0) + Number(scroller.clientHeight || 0) * sourceMarkerRatio;
    let position = typeof view.posAtCoords === 'function'
        ? view.posAtCoords({ x: Number(contentRect.left || 0) + 12, y: markerY })
        : null;
    if (!Number.isInteger(position) && typeof view.lineBlockAtHeight === 'function') {
        position = view.lineBlockAtHeight(
            Number(scroller.scrollTop || 0) + Number(scroller.clientHeight || 0) * sourceMarkerRatio,
        )?.from;
    }
    return Number.isInteger(position)
        ? Math.max(0, Math.min(position, Number(doc.length || 0)))
        : null;
}

function rawSourceAnchorTop(source, position) {
    const text = source?.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE || !text.nodeValue?.length || typeof document.createRange !== 'function') {
        return null;
    }
    const length = text.nodeValue.length;
    let start = Math.max(0, Math.min(Number(position) || 0, length - 1));
    while (start < length - 1 && /[\r\n]/.test(text.nodeValue[start])) start += 1;
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, Math.min(length, start + 1));
    const rect = range.getBoundingClientRect?.();
    return Number.isFinite(rect?.top) ? rect.top : null;
}

export function syncRawTextPreviewScroll() {
    if (!isPreviewOpen() || !activePreviewSource()) return false;
    const view = getEditorView();
    const { source, stage } = panelElements();
    if (!view || view.isDestroyed || !source || !stage || view.scrollDOM !== scrollSync.editor) return false;
    const position = editorPositionAtMarker(view);
    if (!Number.isInteger(position)) return false;

    const anchorTop = rawSourceAnchorTop(source, position);
    const stageRect = stage.getBoundingClientRect?.() || { top: 0 };
    const measuredTop = rawPreviewScrollTopForAnchor({
        anchorViewportTop: anchorTop,
        stageViewportTop: stageRect.top,
        currentScrollTop: stage.scrollTop,
        scrollHeight: stage.scrollHeight,
        clientHeight: stage.clientHeight,
        markerRatio: sourceMarkerRatio,
    });
    const nextTop = measuredTop ?? rawPreviewScrollTopForProgress(
        position,
        view.state.doc.length,
        stage.scrollHeight,
        stage.clientHeight,
    );
    if (Math.abs(Number(stage.scrollTop || 0) - nextTop) < 0.5) return false;
    stage.scrollTop = nextTop;
    return true;
}

function scheduleScrollSync() {
    if (!isPreviewOpen() || scrollSync.timer !== null) return;
    scrollSync.timer = setTimeout(() => {
        scrollSync.timer = null;
        syncRawTextPreviewScroll();
    }, scrollSyncIntervalMs);
}

function ensureEditorScrollSync() {
    const view = activePreviewSource() ? getEditorView() : null;
    const editor = view && !view.isDestroyed ? view.scrollDOM : null;
    if (editor === scrollSync.editor) {
        if (editor) scheduleScrollSync();
        return editor;
    }
    clearScrollSync();
    if (!editor) return null;
    scrollSync.editor = editor;
    scrollSync.listener = scheduleScrollSync;
    editor.addEventListener('scroll', scrollSync.listener, { passive: true });
    scheduleScrollSync();
    return editor;
}

function renderPreview() {
    if (!isPreviewOpen()) return false;
    const { copy, source } = panelElements();
    if (!source) return false;
    source.textContent = preview.content;
    if (copy) copy.disabled = copyInFlight || preview.content.length === 0;
    setPreviewStatus('Raw text is up to date.');
    scheduleScrollSync();
    return true;
}

export async function copyRawTextPreview() {
    if (!isPreviewOpen() || copyInFlight || preview.content.length === 0) return false;
    const requestId = ++copyRequestId;
    const source = preview.content;
    copyInFlight = true;
    const { copy } = panelElements();
    if (copy) copy.disabled = true;
    let copied;
    try {
        copied = await copyTextToClipboard(source);
    } catch (_) {
        copied = false;
    }
    if (requestId !== copyRequestId) return copied;
    copyInFlight = false;
    if (copy) copy.disabled = preview.content.length === 0;
    setPreviewStatus(
        copied ? 'Copied the complete Markdown source to the clipboard.' : 'Could not copy the Markdown source.',
        copied ? '' : 'error',
    );
    return copied;
}

async function activeOrSavedContent(path) {
    const tab = (getState('openTabs') || []).find(candidate => candidate?.type === 'file' && candidate.path === path);
    if (tab?.id === getState('activeTabId')) {
        return { content: getEditorContent(), mtime: tab.mtime ?? null };
    }
    if (typeof tab?._content === 'string' && tab.dirty) {
        return { content: tab._content, mtime: tab.mtime ?? null };
    }
    const result = await backend().ReadFile(path);
    return result && !result.binary && !result.issue ? result : null;
}

function handleContentChange(event) {
    const detail = event.detail || {};
    if (!isPreviewOpen() || detail.path !== preview.path || typeof detail.content !== 'string') return;
    preview.content = detail.content;
    renderPreview();
}

function handleSave(event) {
    const detail = event.detail || {};
    if (!isPreviewOpen() || detail.path !== preview.path || typeof detail.content !== 'string') return;
    preview.content = detail.content;
    preview.sourceMtime = detail.mtime ?? preview.sourceMtime;
    renderPreview();
}

function handleTabSwitch(event) {
    if (!isPreviewOpen()) return;
    ensureEditorScrollSync();
    if (event.detail?.path !== preview.path) return;
    activeOrSavedContent(preview.path).then(source => {
        if (!source || !isPreviewOpen()) return;
        preview.content = source.content;
        preview.sourceMtime = source.mtime ?? preview.sourceMtime;
        renderPreview();
        ensureEditorScrollSync();
    }).catch(() => {});
}

export async function openRawTextPreview({ path, title, content } = {}) {
    if (!path || !markdownPath.test(path)) throw new Error('Raw text preview is only available for Markdown files.');
    initRawTextPreview();
    const panel = ensurePreviewPanel();
    const sidebar = document.getElementById('right-sidebar');
    const rightTitle = document.getElementById('right-sidebar-title');
    const resizer = document.getElementById('right-sidebar-resizer');
    if (!panel || !sidebar) throw new Error('Raw text preview panel is unavailable.');

    document.dispatchEvent(new CustomEvent('close-history-panel'));
    document.dispatchEvent(new CustomEvent('close-outline-panel', { detail: { keepSidebarOpen: true } }));
    document.dispatchEvent(new CustomEvent('close-pdf-preview', { detail: { keepSidebarOpen: true } }));
    copyRequestId += 1;
    copyInFlight = false;
    preview.path = String(path).replaceAll('\\', '/');
    preview.title = String(title || preview.path.split('/').pop() || 'Markdown')
        .replace(/\.(?:md|markdown|mdown|mkdn)$/i, '');
    const suppliedContent = typeof content === 'string';
    preview.content = suppliedContent ? content : '';
    preview.sourceMtime = null;
    if (!suppliedContent) {
        const source = await activeOrSavedContent(preview.path);
        if (!source) throw new Error('Markdown file could not be read for raw text preview.');
        preview.content = source.content;
        preview.sourceMtime = source.mtime ?? null;
    }

    panel.hidden = false;
    sidebar.dataset.mode = previewMode;
    setRightSidebarOpen(sidebar, true);
    sidebar.classList.add('raw-text-preview-mode');
    sidebar.classList.remove('collapsed');
    if (rightTitle) rightTitle.textContent = 'Raw Text';
    resizer?.classList.add('visible');
    updateRightSidebarEditorLayout();
    const { title: titleElement, status } = panelElements();
    if (titleElement) titleElement.textContent = preview.title || 'Markdown';
    if (status) status.textContent = 'Loading raw text…';
    renderPreview();
    ensureEditorScrollSync();
    window.dispatchEvent(new Event('resize'));
}

export function closeRawTextPreview({ keepSidebarOpen = false } = {}) {
    clearScrollSync();
    copyRequestId += 1;
    const sidebar = document.getElementById('right-sidebar');
    const resizer = document.getElementById('right-sidebar-resizer');
    const { panel } = panelElements();
    if (panel) panel.hidden = true;
    if (sidebar?.dataset.mode === previewMode) {
        delete sidebar.dataset.mode;
        sidebar.classList.remove('raw-text-preview-mode');
        if (!keepSidebarOpen) {
            setRightSidebarOpen(sidebar, false);
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
            resizer?.classList.remove('visible');
        }
    }
    preview.path = '';
    preview.content = '';
    preview.sourceMtime = null;
    copyInFlight = false;
    updateRightSidebarEditorLayout();
    window.dispatchEvent(new Event('resize'));
}

export function initRawTextPreview() {
    const panel = ensurePreviewPanel();
    if (!panel) return;
    if (!initialized) {
        initialized = true;
        document.addEventListener('file-content-changed', handleContentChange);
        document.addEventListener('vault-file-saved', handleSave);
        document.addEventListener('close-raw-text-preview', event => closeRawTextPreview(event.detail || {}));
        document.addEventListener('tab-switched', handleTabSwitch);
        document.addEventListener('right-sidebar-resize-end', scheduleScrollSync);
        window.addEventListener('resize', scheduleScrollSync);
    }
    if (!panel.dataset.bound) {
        panel.dataset.bound = 'true';
        panel.addEventListener('click', event => {
            if (event.target.closest('[data-action="copy-raw-text"]')) void copyRawTextPreview();
        });
    }
}

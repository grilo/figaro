/** Exact Markdown source preview for the shared right sidebar. */

import { backend } from './backend.js';
import { getEditorContent } from './editor.js';
import { getState } from './state.js';
import { setRightSidebarOpen } from './rightSidebarState.js';

const previewMode = 'raw-text-preview';
const markdownPath = /\.(?:md|markdown|mdown|mkdn)$/i;

let initialized = false;
const preview = {
    path: '',
    title: '',
    content: '',
    sourceMtime: null,
};

function panelElements() {
    const panel = document.getElementById('raw-text-preview-panel');
    if (!panel) return {};
    return {
        panel,
        title: panel.querySelector('.raw-text-preview-document-title'),
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
            <span class="raw-text-preview-format">Raw</span>
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

function renderPreview() {
    if (!isPreviewOpen()) return false;
    const { source, status } = panelElements();
    if (!source) return false;
    source.textContent = preview.content;
    if (status) status.textContent = 'Raw text is up to date.';
    return true;
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
    return result && !result.binary ? result : null;
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
    if (!isPreviewOpen() || event.detail?.path !== preview.path) return;
    activeOrSavedContent(preview.path).then(source => {
        if (!source || !isPreviewOpen()) return;
        preview.content = source.content;
        preview.sourceMtime = source.mtime ?? preview.sourceMtime;
        renderPreview();
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
    const { title: titleElement, status } = panelElements();
    if (titleElement) titleElement.textContent = preview.title || 'Markdown';
    if (status) status.textContent = 'Loading raw text…';
    renderPreview();
    window.dispatchEvent(new Event('resize'));
}

export function closeRawTextPreview({ keepSidebarOpen = false } = {}) {
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
    window.dispatchEvent(new Event('resize'));
}

export function initRawTextPreview() {
    const panel = ensurePreviewPanel();
    if (!panel || initialized) return;
    initialized = true;
    document.addEventListener('file-content-changed', handleContentChange);
    document.addEventListener('vault-file-saved', handleSave);
    document.addEventListener('close-raw-text-preview', event => closeRawTextPreview(event.detail || {}));
    document.addEventListener('tab-switched', handleTabSwitch);
}

export default {
    closeRawTextPreview,
    initRawTextPreview,
    isRawTextPreviewOpen,
    openRawTextPreview,
};

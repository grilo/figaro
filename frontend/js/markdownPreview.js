/**
 * Live Markdown preview for the right sidebar.
 *
 * This is intentionally separate from the print pipeline: it renders the
 * current Markdown snapshot with Figaro's normal theme instead of applying a
 * PDF stylesheet, page geometry, or export-only cover and contents sections.
 */

import { backend } from './backend.js';
import { getState } from './state.js';
import { stripLeadingFrontmatter } from './frontmatter.js';
import { createPrintMarkdownRenderer } from '../vendored/markdown-it-plugins/index.js';

const previewMode = 'markdown-preview';

let initialized = false;
const preview = {
    path: '',
    title: '',
    content: '',
    sourceMtime: null,
};

function panelElements() {
    const panel = document.getElementById('markdown-preview-panel');
    if (!panel) return {};
    return {
        panel,
        title: panel.querySelector('.markdown-preview-document-title'),
        document: panel.querySelector('.markdown-preview-document'),
        status: panel.querySelector('.markdown-preview-status'),
    };
}

function ensurePreviewPanel() {
    let panel = document.getElementById('markdown-preview-panel');
    if (panel) return panel;

    const content = document.getElementById('right-sidebar-content');
    if (!content) return null;

    panel = document.createElement('section');
    panel.id = 'markdown-preview-panel';
    panel.className = 'markdown-preview-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Live Markdown preview');
    panel.innerHTML = `
        <div class="markdown-preview-toolbar">
            <span class="markdown-preview-document-title"></span>
            <span class="markdown-preview-format">Markdown</span>
        </div>
        <p class="markdown-preview-status" aria-live="polite">Preparing Markdown preview…</p>
        <div class="markdown-preview-stage">
            <article class="markdown-preview-document" aria-label="Rendered Markdown document"></article>
        </div>
    `;
    content.appendChild(panel);
    return panel;
}

function isPreviewOpen() {
    const sidebar = document.getElementById('right-sidebar');
    return Boolean(preview.path && sidebar?.classList.contains('open') && sidebar.dataset.mode === previewMode);
}

export function isMarkdownPreviewOpen() {
    return isPreviewOpen();
}

export function renderMarkdownPreview(markdown) {
    if (typeof window.markdownit !== 'function') {
        throw new Error('Markdown renderer is unavailable');
    }
    return createPrintMarkdownRenderer().render(stripLeadingFrontmatter(String(markdown || '')));
}

function setPreviewStatus(message, kind = '') {
    const { status } = panelElements();
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
}

function updatePreviewMeta() {
    const { title } = panelElements();
    if (title) title.textContent = preview.title || 'Markdown';
}

function renderPreview() {
    if (!isPreviewOpen()) return false;
    const { document: documentElement } = panelElements();
    if (!documentElement) return false;
    try {
        documentElement.innerHTML = renderMarkdownPreview(preview.content);
        setPreviewStatus('Markdown preview up to date.');
        return true;
    } catch (error) {
        documentElement.replaceChildren();
        setPreviewStatus(error?.message || 'Could not render the Markdown preview.', 'error');
        return false;
    }
}

async function activeOrSavedContent(path) {
    const tab = (getState('openTabs') || []).find(candidate => candidate?.type === 'file' && candidate.path === path);
    if (tab?.id === getState('activeTabId')) {
        const { getEditorContent } = await import('./editor.js');
        return { content: getEditorContent(), mtime: tab.mtime ?? null };
    }
    if (typeof tab?._content === 'string' && tab.dirty) {
        return { content: tab._content, mtime: tab.mtime ?? null };
    }
    const result = await backend().ReadFile(path);
    return result && !result.binary ? result : null;
}

function handlePreviewContentChange(event) {
    const detail = event.detail || {};
    if (!isPreviewOpen() || detail.path !== preview.path || typeof detail.content !== 'string') return;
    preview.content = detail.content;
    renderPreview();
}

function handlePreviewSave(event) {
    const detail = event.detail || {};
    if (!isPreviewOpen() || detail.path !== preview.path || typeof detail.content !== 'string') return;
    preview.content = detail.content;
    preview.sourceMtime = detail.mtime ?? preview.sourceMtime;
    renderPreview();
}

function handlePreviewTabSwitch(event) {
    if (!isPreviewOpen() || event.detail?.path !== preview.path) return;
    activeOrSavedContent(preview.path).then(source => {
        if (!source || !isPreviewOpen()) return;
        preview.content = source.content;
        preview.sourceMtime = source.mtime ?? preview.sourceMtime;
        renderPreview();
    }).catch(() => {});
}

export async function openMarkdownPreview({ path, title, content } = {}) {
    if (!path || !/\.md$/i.test(path)) throw new Error('Markdown preview is only available for Markdown files.');
    initMarkdownPreview();
    const panel = ensurePreviewPanel();
    const sidebar = document.getElementById('right-sidebar');
    const rightTitle = document.getElementById('right-sidebar-title');
    const resizer = document.getElementById('right-sidebar-resizer');
    if (!panel || !sidebar) throw new Error('Markdown preview panel is unavailable.');

    document.dispatchEvent(new CustomEvent('close-history-panel'));
    document.dispatchEvent(new CustomEvent('close-outline-panel', { detail: { keepSidebarOpen: true } }));
    document.dispatchEvent(new CustomEvent('close-pdf-preview', { detail: { keepSidebarOpen: true } }));

    preview.path = String(path).replaceAll('\\', '/');
    preview.title = String(title || preview.path.split('/').pop() || 'Markdown').replace(/\.md$/i, '');
    preview.content = typeof content === 'string' ? content : '';
    preview.sourceMtime = null;
    if (!preview.content) {
        const source = await activeOrSavedContent(preview.path);
        if (!source) throw new Error('Markdown file could not be read for preview.');
        preview.content = source.content;
        preview.sourceMtime = source.mtime ?? null;
    }

    panel.hidden = false;
    sidebar.dataset.mode = previewMode;
    sidebar.classList.add('open', 'markdown-preview-mode');
    sidebar.classList.remove('collapsed');
    if (rightTitle) rightTitle.textContent = 'Markdown Preview';
    resizer?.classList.add('visible');
    updatePreviewMeta();
    setPreviewStatus('Preparing Markdown preview…');
    renderPreview();
    window.dispatchEvent(new Event('resize'));
}

export function closeMarkdownPreview({ keepSidebarOpen = false } = {}) {
    const sidebar = document.getElementById('right-sidebar');
    const resizer = document.getElementById('right-sidebar-resizer');
    const { panel } = panelElements();
    if (panel) panel.hidden = true;

    if (sidebar?.dataset.mode === previewMode) {
        delete sidebar.dataset.mode;
        sidebar.classList.remove('markdown-preview-mode');
        if (!keepSidebarOpen) {
            sidebar.classList.remove('open');
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

export function initMarkdownPreview() {
    const panel = ensurePreviewPanel();
    if (!panel || initialized) return;
    initialized = true;
    document.addEventListener('file-content-changed', handlePreviewContentChange);
    document.addEventListener('vault-file-saved', handlePreviewSave);
    document.addEventListener('close-markdown-preview', event => closeMarkdownPreview(event.detail || {}));
    document.addEventListener('tab-switched', handlePreviewTabSwitch);
}

export default {
    closeMarkdownPreview,
    initMarkdownPreview,
    isMarkdownPreviewOpen,
    openMarkdownPreview,
    renderMarkdownPreview,
};

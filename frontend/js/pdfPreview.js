/**
 * Live PDF preview
 *
 * Renders the same print document used by interactive export into an isolated
 * iframe. The iframe keeps a vault stylesheet from affecting the application
 * chrome, while a short trailing debounce makes ordinary writing and CSS
 * editing feel immediate without rebuilding the preview for every keystroke.
 */

import { log } from './log.js';
import { getState } from './state.js';
import { getPrintStylesheet } from './frontmatter.js';
import { exportMarkdownToPDF, renderPrintableMarkdownWithDiagrams } from './pdfExport.js';
import { pdfExportErrorDialog } from './dialogs.js';

const previewDebounceMs = 320;
const previewMode = 'pdf-preview';

let previewTimer = null;
let previewRequestId = 0;
let previewInitialized = false;
let previewGenerating = false;

const preview = {
    path: '',
    title: '',
    content: '',
    sourceMtime: null,
    stylesheetPath: '',
    stylesheetReference: '',
    stylesheetOptional: false,
    stylesheetContent: '',
    stylesheetMtime: null,
    stylesheetError: '',
};

// The preview document is replaced after a debounced edit, so scroll state
// needs to outlive an iframe document. Keep one relative position for the
// Markdown source and its rendered counterpart rather than coupling their
// very different pixel heights.
const scrollSync = {
    editor: null,
    editorListener: null,
    previewWindow: null,
    previewDocument: null,
    previewScrollListener: null,
    previewLinkListener: null,
    pendingProgress: 0,
    lastProgress: 0,
    resetOnNextRender: true,
    suppressEditor: false,
    suppressPreview: false,
    editorFrame: null,
    previewFrame: null,
    restoreFrame: null,
};

function normalizeVaultPath(value, baseDirectory = '') {
    const source = String(value || '').trim().replaceAll('\\', '/');
    if (!source || source.startsWith('/') || source.startsWith('//') || /^[A-Za-z]:/.test(source) ||
        source.includes('://') || /^file:/i.test(source)) return '';

    const parts = String(baseDirectory || '').split('/').filter(Boolean);
    for (const segment of source.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (!parts.length) return '';
            parts.pop();
            continue;
        }
        parts.push(segment);
    }
    return parts.join('/');
}

function parentDirectory(path) {
    const normalized = String(path || '').replaceAll('\\', '/');
    const separator = normalized.lastIndexOf('/');
    return separator < 0 ? '' : normalized.slice(0, separator);
}

function vaultURL(path, directory = false) {
    const encoded = String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `/vault/${encoded}${directory && encoded ? '/' : ''}`;
}

/**
 * Mirror the backend's local stylesheet resolution without granting the
 * preview any filesystem access beyond the normal read_file API.
 */
export function resolvePDFPreviewStylesheetPath(notePath, stylesheetReference) {
    const note = normalizeVaultPath(notePath);
    if (!note || !/\.md$/i.test(note)) {
        return { path: '', optional: false, error: 'PDF preview is only available for Markdown files.' };
    }

    const reference = String(stylesheetReference || '').trim();
    const sourceDirectory = parentDirectory(note);
    if (!reference) {
        return {
            path: normalizeVaultPath('_print.css', sourceDirectory),
            reference: '_print.css',
            optional: true,
            error: '',
        };
    }
    if (!/\.css$/i.test(reference)) {
        return { path: '', optional: false, error: 'The print stylesheet must reference a .css file.' };
    }

    const path = normalizeVaultPath(reference, sourceDirectory);
    if (!path) {
        return { path: '', optional: false, error: 'The print stylesheet must be a vault-local relative CSS path.' };
    }
    return { path, reference, optional: false, error: '' };
}

function resolveCSSAssetPath(stylesheetPath, value) {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('data:') || raw.startsWith('//') ||
        /^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;

    const hashIndex = raw.search(/[?#]/);
    const relativePath = hashIndex < 0 ? raw : raw.slice(0, hashIndex);
    const suffix = hashIndex < 0 ? '' : raw.slice(hashIndex);
    const resolved = normalizeVaultPath(relativePath, parentDirectory(stylesheetPath));
    return resolved ? vaultURL(resolved) + suffix : raw;
}

/**
 * Inline CSS is necessary for an unsaved stylesheet preview. Rebase common
 * url(...) references first so fonts and images retain the same stylesheet
 * relative location they have in the generated PDF.
 */
export function rebasePDFPreviewStylesheetURLs(css, stylesheetPath) {
    return String(css || '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, source) => {
        const rebased = resolveCSSAssetPath(stylesheetPath, source);
        return rebased === source ? match : `url(${quote || ''}${rebased}${quote || ''})`;
    });
}

function safeStyleText(css) {
    // The iframe is sandboxed without scripts, and this prevents a literal
    // closing style tag from escaping the generated document altogether.
    return String(css || '').replace(/<\/style/gi, '<\\/style');
}

const previewSurfaceCSS = `
  /* Preview-only geometry comes before user CSS. Keep the body transparent so
     an ordinary html { background: ... } rule behaves exactly as it does in
     the exported document. */
  html { min-height: 100%; background: #fff; }
  body {
    box-sizing: border-box;
    min-height: calc(297mm - 36mm);
    max-width: 210mm;
    margin: 16px auto;
    padding: 18mm;
    background: transparent;
    box-shadow: 0 2px 12px rgba(15, 23, 42, .2);
  }
  @media screen and (max-width: 760px) {
    body { margin: 0; padding: 11mm; box-shadow: none; }
  }
`;

/**
 * Add vault-local resources and a screen surface to printable HTML. The
 * semantic content and default print styles originate in pdfExport.js, so
 * preview and final export keep the same document contract.
 */
export function buildPDFPreviewDocument(printableHTML, { notePath, stylesheetPath = '', stylesheetContent = '' } = {}) {
    if (typeof DOMParser === 'undefined' || typeof document === 'undefined') return String(printableHTML || '');

    const printable = new DOMParser().parseFromString(String(printableHTML || ''), 'text/html');
    const head = printable.head || printable.documentElement.appendChild(printable.createElement('head'));
    const body = printable.body || printable.documentElement.appendChild(printable.createElement('body'));
    body.classList.add('figaro-pdf-preview-body');

    const csp = printable.createElement('meta');
    csp.setAttribute('http-equiv', 'Content-Security-Policy');
    csp.setAttribute('content', 'default-src \'none\'; img-src data: \'self\'; style-src \'unsafe-inline\' \'self\'; font-src data: \'self\'');
    head.appendChild(csp);

    const base = printable.createElement('base');
    base.href = vaultURL(parentDirectory(notePath), true);
    head.appendChild(base);

    const katex = printable.createElement('link');
    katex.rel = 'stylesheet';
    katex.href = '/vendored/katex/dist/katex.min.css';
    head.appendChild(katex);

    const surface = printable.createElement('style');
    surface.id = 'figaro-preview-surface';
    surface.textContent = previewSurfaceCSS;
    head.appendChild(surface);

    // Keep the editable stylesheet last, just as the backend links it after
    // Figaro's built-in print CSS. This lets simple html/body rules override
    // the preview surface instead of requiring preview-specific selectors.
    if (stylesheetContent) {
        const stylesheet = printable.createElement('style');
        stylesheet.id = 'figaro-preview-user-stylesheet';
        stylesheet.textContent = safeStyleText(rebasePDFPreviewStylesheetURLs(stylesheetContent, stylesheetPath));
        head.appendChild(stylesheet);
    }

    return '<!doctype html>\n' + printable.documentElement.outerHTML;
}

function finiteMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function clampProgress(value) {
    return Math.max(0, Math.min(1, finiteMetric(value)));
}

/** Map a scroll position to a document-relative progress value. */
export function scrollProgressForMetrics(scrollTop, scrollHeight, clientHeight) {
    const maximum = Math.max(0, finiteMetric(scrollHeight) - finiteMetric(clientHeight));
    return maximum > 0 ? clampProgress(finiteMetric(scrollTop) / maximum) : 0;
}

/** Map a document-relative progress value onto a particular scroll container. */
export function scrollTopForProgress(progress, scrollHeight, clientHeight) {
    const maximum = Math.max(0, finiteMetric(scrollHeight) - finiteMetric(clientHeight));
    return maximum * clampProgress(progress);
}

/**
 * Map preview scroll to document-body progress after generated cover/TOC
 * material. The Markdown editor has no source lines for that prefix.
 */
export function scrollProgressForContentRegion(scrollTop, scrollHeight, clientHeight, contentStart = 0) {
    const maximum = Math.max(0, finiteMetric(scrollHeight) - finiteMetric(clientHeight));
    const start = Math.min(maximum, Math.max(0, finiteMetric(contentStart)));
    const available = maximum - start;
    return available > 0 ? clampProgress((finiteMetric(scrollTop) - start) / available) : 0;
}

/** Map Markdown-body progress onto a preview that has generated leading pages. */
export function scrollTopForContentProgress(progress, scrollHeight, clientHeight, contentStart = 0) {
    const maximum = Math.max(0, finiteMetric(scrollHeight) - finiteMetric(clientHeight));
    const start = Math.min(maximum, Math.max(0, finiteMetric(contentStart)));
    return start + (maximum - start) * clampProgress(progress);
}

/** Return a same-document fragment ID without allowing the iframe base URL to rewrite it. */
export function getPDFPreviewFragmentID(href) {
    const value = String(href || '').trim();
    if (!value.startsWith('#') || value.length < 2) return '';
    try {
        return decodeURIComponent(value.slice(1));
    } catch (_) {
        return value.slice(1);
    }
}

function scheduleAnimationFrame(callback) {
    if (typeof globalThis.requestAnimationFrame === 'function') {
        return globalThis.requestAnimationFrame(callback);
    }
    return setTimeout(callback, 0);
}

function cancelScheduledAnimationFrame(handle) {
    if (handle === null || handle === undefined) return;
    if (typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(handle);
    } else {
        clearTimeout(handle);
    }
}

function deferSuppression(key) {
    const token = {};
    scrollSync[key] = token;
    // Setting scrollTop may synchronously dispatch a scroll event in some
    // engines. Release the direction lock in the next task so a real user
    // scroll is never swallowed for an entire animation frame.
    setTimeout(() => {
        if (scrollSync[key] === token) scrollSync[key] = false;
    }, 0);
}

function activePreviewSource() {
    return (getState('openTabs') || []).find(tab =>
        tab?.id === getState('activeTabId') && tab.type === 'file' && tab.path === preview.path
    ) || null;
}

function activeEditorScroller() {
    if (!activePreviewSource()) return null;
    return document.querySelector('#editor-container .cm-scroller');
}

function scrollProgressForElement(element) {
    if (!element) return 0;
    return scrollProgressForMetrics(element.scrollTop, element.scrollHeight, element.clientHeight);
}

function setElementScrollProgress(element, progress, suppressKey) {
    if (!element) return false;
    const nextTop = scrollTopForProgress(progress, element.scrollHeight, element.clientHeight);
    if (Math.abs(finiteMetric(element.scrollTop) - nextTop) < 0.5) return false;
    deferSuppression(suppressKey);
    element.scrollTop = nextTop;
    return true;
}

function frameScrollMetrics(frame) {
    try {
        const doc = frame?.contentDocument;
        const win = frame?.contentWindow;
        const element = doc?.scrollingElement || doc?.documentElement || doc?.body;
        if (!element) return null;
        // The scrolling element's client height is the authoritative viewport
        // size. Fall back only when an engine reports it as zero.
        const clientHeight = finiteMetric(element.clientHeight) ||
            finiteMetric(doc.documentElement?.clientHeight) ||
            finiteMetric(doc.body?.clientHeight) ||
            finiteMetric(win?.innerHeight);
        const scrollHeight = Math.max(
            finiteMetric(element.scrollHeight),
            finiteMetric(doc.documentElement?.scrollHeight),
            finiteMetric(doc.body?.scrollHeight),
            clientHeight
        );
        return {
            element,
            clientHeight,
            scrollHeight,
            scrollTop: Math.max(finiteMetric(element.scrollTop), finiteMetric(win?.scrollY)),
        };
    } catch (_) {
        return null;
    }
}

function frameScrollProgress(frame) {
    const metrics = frameScrollMetrics(frame);
    return metrics
        ? scrollProgressForMetrics(metrics.scrollTop, metrics.scrollHeight, metrics.clientHeight)
        : scrollSync.lastProgress;
}

function printableDocumentStart(frame, metrics) {
    try {
        const doc = frame?.contentDocument;
        const main = doc?.querySelector('main.figaro-print-document');
        if (!main || !metrics) return 0;

        // main.offsetTop is the common case: cover and TOC are normal block
        // siblings before it. Retain a rectangle fallback for unusual print
        // styles that establish a different offset parent.
        let offset = finiteMetric(main.offsetTop);
        let parent = main.offsetParent;
        while (parent && parent !== doc.body) {
            offset += finiteMetric(parent.offsetTop);
            parent = parent.offsetParent;
        }
        if (offset <= 0 && typeof main.getBoundingClientRect === 'function' &&
            typeof metrics.element.getBoundingClientRect === 'function') {
            const mainRect = main.getBoundingClientRect();
            const scrollRect = metrics.element.getBoundingClientRect();
            offset = metrics.scrollTop + finiteMetric(mainRect.top) - finiteMetric(scrollRect.top);
        }
        const maximum = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
        return Math.min(maximum, Math.max(0, offset));
    } catch (_) {
        return 0;
    }
}

function frameContentProgress(frame) {
    const metrics = frameScrollMetrics(frame);
    if (!metrics) return scrollSync.lastProgress;
    return scrollProgressForContentRegion(
        metrics.scrollTop,
        metrics.scrollHeight,
        metrics.clientHeight,
        printableDocumentStart(frame, metrics)
    );
}

function setFrameScrollProgress(frame, progress) {
    const metrics = frameScrollMetrics(frame);
    if (!metrics) return false;
    const nextTop = scrollTopForProgress(progress, metrics.scrollHeight, metrics.clientHeight);
    if (Math.abs(metrics.scrollTop - nextTop) < 0.5) return false;
    deferSuppression('suppressPreview');
    metrics.element.scrollTop = nextTop;
    return true;
}

function setFrameContentProgress(frame, progress) {
    const metrics = frameScrollMetrics(frame);
    if (!metrics) return false;
    const nextTop = scrollTopForContentProgress(
        progress,
        metrics.scrollHeight,
        metrics.clientHeight,
        printableDocumentStart(frame, metrics)
    );
    if (Math.abs(metrics.scrollTop - nextTop) < 0.5) return false;
    deferSuppression('suppressPreview');
    metrics.element.scrollTop = nextTop;
    return true;
}

function clearEditorScrollSync() {
    if (scrollSync.editor && scrollSync.editorListener) {
        scrollSync.editor.removeEventListener('scroll', scrollSync.editorListener);
    }
    scrollSync.editor = null;
    scrollSync.editorListener = null;
}

function syncEditorScrollToPreview() {
    if (!isPreviewOpen() || !activePreviewSource() || scrollSync.suppressEditor) return;
    const editor = activeEditorScroller();
    const frame = panelElements().frame;
    if (!editor || !frame) return;
    const progress = scrollProgressForElement(editor);
    scrollSync.lastProgress = progress;
    setFrameContentProgress(frame, progress);
}

function ensureEditorScrollSync() {
    const editor = activeEditorScroller();
    if (editor === scrollSync.editor) return editor;

    clearEditorScrollSync();
    if (!editor) return null;

    scrollSync.editor = editor;
    scrollSync.editorListener = () => {
        if (scrollSync.suppressEditor || scrollSync.editorFrame !== null) return;
        scrollSync.editorFrame = scheduleAnimationFrame(() => {
            scrollSync.editorFrame = null;
            syncEditorScrollToPreview();
        });
    };
    editor.addEventListener('scroll', scrollSync.editorListener, { passive: true });
    return editor;
}

function syncPreviewScrollToEditor(frame) {
    if (!isPreviewOpen() || !activePreviewSource() || scrollSync.suppressPreview) return;
    const editor = ensureEditorScrollSync();
    if (!editor) return;
    const progress = frameContentProgress(frame);
    scrollSync.lastProgress = progress;
    setElementScrollProgress(editor, progress, 'suppressEditor');
}

function clearPreviewFrameInteractions() {
    if (scrollSync.previewWindow && scrollSync.previewScrollListener) {
        scrollSync.previewWindow.removeEventListener('scroll', scrollSync.previewScrollListener);
    }
    if (scrollSync.previewDocument && scrollSync.previewLinkListener) {
        scrollSync.previewDocument.removeEventListener('click', scrollSync.previewLinkListener);
    }
    scrollSync.previewWindow = null;
    scrollSync.previewDocument = null;
    scrollSync.previewScrollListener = null;
    scrollSync.previewLinkListener = null;
}

function scrollPreviewFragmentIntoView(frame, target) {
    if (!target) return;
    if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'start', inline: 'nearest' });
    } else {
        const metrics = frameScrollMetrics(frame);
        if (metrics) metrics.element.scrollTop = finiteMetric(target.offsetTop);
    }
    scheduleAnimationFrame(() => syncPreviewScrollToEditor(frame));
}

function installPreviewFrameInteractions(frame) {
    let doc;
    let win;
    try {
        doc = frame?.contentDocument;
        win = frame?.contentWindow;
    } catch (_) {
        return;
    }
    if (!doc || !win) return;
    if (scrollSync.previewWindow === win && scrollSync.previewDocument === doc) return;

    clearPreviewFrameInteractions();
    scrollSync.previewWindow = win;
    scrollSync.previewDocument = doc;
    scrollSync.previewScrollListener = () => {
        if (scrollSync.suppressPreview || scrollSync.previewFrame !== null) return;
        scrollSync.previewFrame = scheduleAnimationFrame(() => {
            scrollSync.previewFrame = null;
            syncPreviewScrollToEditor(frame);
        });
    };
    scrollSync.previewLinkListener = event => {
        const link = event.target?.closest?.('a[href]');
        const href = link?.getAttribute('href');
        if (!link || !String(href || '').trim().startsWith('#')) return;
        // The iframe has a vault-local <base>, which would otherwise resolve
        // even a missing #fragment as a filesystem URL. Keep every fragment
        // navigation inside this rendered document.
        event.preventDefault();
        const fragmentID = getPDFPreviewFragmentID(href);
        if (!fragmentID) return;
        const target = doc.getElementById(fragmentID);
        if (!target) return;
        scrollPreviewFragmentIntoView(frame, target);
    };
    win.addEventListener('scroll', scrollSync.previewScrollListener, { passive: true });
    doc.addEventListener('click', scrollSync.previewLinkListener);
}

function capturePreviewScrollProgress(frame) {
    if (scrollSync.resetOnNextRender) {
        scrollSync.resetOnNextRender = false;
        return 0;
    }
    // Preserve the actual rendered position across srcdoc replacement. It
    // avoids jumping away from a cover that the reader deliberately opened,
    // while scroll events still use the body-only mapping above.
    const progress = frameScrollProgress(frame);
    scrollSync.lastProgress = progress;
    return progress;
}

function restorePreviewScrollAfterLoad(frame) {
    cancelScheduledAnimationFrame(scrollSync.restoreFrame);
    scrollSync.restoreFrame = scheduleAnimationFrame(() => {
        scrollSync.restoreFrame = null;
        if (!isPreviewOpen() || panelElements().frame !== frame) return;
        setFrameScrollProgress(frame, scrollSync.pendingProgress);
        scrollSync.lastProgress = scrollSync.pendingProgress;
        ensureEditorScrollSync();
    });
}

function resetScrollSync() {
    clearEditorScrollSync();
    clearPreviewFrameInteractions();
    cancelScheduledAnimationFrame(scrollSync.editorFrame);
    cancelScheduledAnimationFrame(scrollSync.previewFrame);
    cancelScheduledAnimationFrame(scrollSync.restoreFrame);
    scrollSync.editorFrame = null;
    scrollSync.previewFrame = null;
    scrollSync.restoreFrame = null;
    scrollSync.pendingProgress = 0;
    scrollSync.lastProgress = 0;
    scrollSync.resetOnNextRender = true;
    scrollSync.suppressEditor = false;
    scrollSync.suppressPreview = false;
}

function handlePreviewTabSwitch(event) {
    if (!isPreviewOpen()) return;
    if (event.detail?.path !== preview.path) {
        clearEditorScrollSync();
        return;
    }
    scheduleAnimationFrame(() => {
        const editor = ensureEditorScrollSync();
        if (editor) setElementScrollProgress(editor, frameContentProgress(panelElements().frame), 'suppressEditor');
    });
}

function panelElements() {
    const panel = document.getElementById('pdf-preview-panel');
    if (!panel) return {};
    return {
        panel,
        title: panel.querySelector('.pdf-preview-document-title'),
        stylesheet: panel.querySelector('.pdf-preview-stylesheet'),
        status: panel.querySelector('.pdf-preview-status'),
        loading: panel.querySelector('.pdf-preview-loading'),
        frame: panel.querySelector('.pdf-preview-frame'),
        generate: panel.querySelector('[data-action="generate-pdf"]'),
        openStylesheet: panel.querySelector('[data-action="open-stylesheet"]'),
    };
}

function ensurePreviewPanel() {
    let panel = document.getElementById('pdf-preview-panel');
    if (panel) return panel;

    const content = document.getElementById('right-sidebar-content');
    if (!content) return null;

    panel = document.createElement('section');
    panel.id = 'pdf-preview-panel';
    panel.className = 'pdf-preview-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Live PDF preview');
    panel.innerHTML = `
        <div class="pdf-preview-toolbar">
            <div class="pdf-preview-document-meta">
                <span class="pdf-preview-document-title"></span>
                <button type="button" class="pdf-preview-stylesheet" data-action="open-stylesheet" title="Open the active print stylesheet" disabled></button>
            </div>
            <button type="button" class="pdf-preview-generate" data-action="generate-pdf">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M8 15h8M8 18h6"/></svg>
                <span>Generate PDF</span>
            </button>
        </div>
        <p class="pdf-preview-status" aria-live="polite">Preparing live preview…</p>
        <div class="pdf-preview-stage">
            <div class="pdf-preview-loading" hidden>Updating preview…</div>
            <iframe class="pdf-preview-frame" title="Live PDF preview" sandbox="allow-same-origin"></iframe>
        </div>
    `;
    content.appendChild(panel);
    return panel;
}

function hideCalendarContent() {
    const sidebar = document.getElementById('right-sidebar');
    const calGrid = document.getElementById('calendar-grid');
    const calLinks = document.getElementById('cal-linked-notes');
    const toolbar = sidebar?.querySelector('.calendar-toolbar');
    if (calGrid) calGrid.style.display = 'none';
    if (calLinks) calLinks.style.display = 'none';
    if (toolbar) toolbar.style.display = 'none';
}

function setPreviewStatus(message, kind = '') {
    const { status } = panelElements();
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
}

function isPreviewOpen() {
    const sidebar = document.getElementById('right-sidebar');
    return Boolean(preview.path && sidebar?.classList.contains('open') && sidebar.dataset.mode === previewMode);
}

export function isPDFPreviewOpen() {
    return isPreviewOpen();
}

function stylesheetStatusText() {
    if (preview.stylesheetError) return preview.stylesheetError;
    if (!preview.stylesheetContent && preview.stylesheetMtime === null) return 'Built-in PDF style';
    return `Stylesheet: ${preview.stylesheetReference || preview.stylesheetPath}`;
}

function updatePreviewMeta() {
    const { title, stylesheet, openStylesheet } = panelElements();
    if (title) title.textContent = preview.title || preview.path.split('/').pop() || 'Document';
    const stylesheetText = stylesheetStatusText();
    const stylesheetAvailable = Boolean(preview.stylesheetPath && (preview.stylesheetContent || preview.stylesheetMtime !== null));
    if (stylesheet) {
        stylesheet.textContent = stylesheetText;
        stylesheet.title = preview.stylesheetError || (preview.stylesheetPath ? `Open ${preview.stylesheetPath}` : stylesheetText);
        stylesheet.dataset.error = preview.stylesheetError ? 'true' : 'false';
        stylesheet.disabled = !stylesheetAvailable || Boolean(preview.stylesheetError);
    }
    if (openStylesheet) openStylesheet.disabled = !stylesheetAvailable || Boolean(preview.stylesheetError);
}

async function getDirtyTabContent(path) {
    const tab = (getState('openTabs') || []).find(candidate => candidate?.type === 'file' && candidate.path === path && candidate.dirty);
    if (!tab) return null;
    if (tab.id === getState('activeTabId')) {
        const { getEditorContent } = await import('./editor.js');
        return getEditorContent();
    }
    return typeof tab._content === 'string' ? tab._content : null;
}

async function readVaultText(path) {
    const result = await window.pywebview?.api?.read_file?.(path);
    if (!result || result.binary) return null;
    return result;
}

async function loadPreviewSource(path) {
    const dirtyContent = await getDirtyTabContent(path);
    if (typeof dirtyContent === 'string') {
        preview.content = dirtyContent;
        return true;
    }

    const result = await readVaultText(path);
    if (!result) return false;
    preview.content = result.content;
    preview.sourceMtime = result.mtime;
    return true;
}

async function loadStylesheet(path, optional, requestId) {
    const dirtyContent = await getDirtyTabContent(path);
    if (typeof dirtyContent === 'string') {
        preview.stylesheetContent = dirtyContent;
        preview.stylesheetError = '';
        return;
    }

    const result = await readVaultText(path);
    if (requestId !== previewRequestId || !isPreviewOpen()) return;
    if (!result) {
        preview.stylesheetContent = '';
        preview.stylesheetMtime = null;
        preview.stylesheetError = optional ? '' : `Stylesheet not found: ${preview.stylesheetReference}`;
        return;
    }
    preview.stylesheetContent = result.content;
    preview.stylesheetMtime = result.mtime;
    preview.stylesheetError = '';
}

async function ensurePreviewStylesheet(requestId) {
    const resolved = resolvePDFPreviewStylesheetPath(preview.path, getPrintStylesheet(preview.content));
    if (resolved.error) {
        preview.stylesheetPath = '';
        preview.stylesheetReference = '';
        preview.stylesheetContent = '';
        preview.stylesheetMtime = null;
        preview.stylesheetError = resolved.error;
        return;
    }

    if (resolved.path !== preview.stylesheetPath) {
        preview.stylesheetPath = resolved.path;
        preview.stylesheetReference = resolved.reference;
        preview.stylesheetOptional = resolved.optional;
        preview.stylesheetContent = '';
        preview.stylesheetMtime = null;
        preview.stylesheetError = '';
        await loadStylesheet(resolved.path, resolved.optional, requestId);
    }
}

function setPreviewLoading(isLoading) {
    const { loading: loadingElement } = panelElements();
    if (loadingElement) loadingElement.hidden = !isLoading;
}

async function renderPreview() {
    const requestId = ++previewRequestId;
    // An empty Markdown note is still a valid printable document. Opening the
    // pane only schedules rendering after its source has been loaded, so the
    // path/mode check is sufficient here.
    if (!isPreviewOpen()) return;

    setPreviewLoading(true);
    setPreviewStatus('Updating live preview…');
    try {
        await ensurePreviewStylesheet(requestId);
        if (requestId !== previewRequestId || !isPreviewOpen()) return;

        const printable = await renderPrintableMarkdownWithDiagrams(preview.content, preview.title);
        if (requestId !== previewRequestId || !isPreviewOpen()) return;

        const { frame } = panelElements();
        if (!frame) return;
        // Replacing srcdoc normally resets the iframe to its top. Capture the
        // Markdown editor's relative position when it is the source note, or
        // the preview's own position while styling from a CSS tab.
        scrollSync.pendingProgress = capturePreviewScrollProgress(frame);
        frame.srcdoc = buildPDFPreviewDocument(printable, {
            notePath: preview.path,
            stylesheetPath: preview.stylesheetPath,
            stylesheetContent: preview.stylesheetContent,
        });
        updatePreviewMeta();
        setPreviewStatus(preview.stylesheetError ? 'Live preview updated — using the built-in style.' : 'Live preview up to date.');
    } catch (error) {
        if (requestId !== previewRequestId || !isPreviewOpen()) return;
        log.error('PDF preview failed:', error);
        setPreviewStatus(error?.message || 'Could not render the PDF preview.', 'error');
    } finally {
        if (requestId === previewRequestId) setPreviewLoading(false);
    }
}

export function schedulePDFPreviewRefresh(delay = previewDebounceMs) {
    if (!isPreviewOpen()) return;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
        previewTimer = null;
        renderPreview();
    }, Math.max(0, delay));
}

function findTreeFile(items, path) {
    for (const item of items || []) {
        if (item?.type === 'file' && item.path === path) return item;
        if (item?.type === 'directory') {
            const nested = findTreeFile(item.children, path);
            if (nested) return nested;
        }
    }
    return null;
}

async function reloadPreviewFile(path, kind) {
    const result = await readVaultText(path);
    if (!isPreviewOpen() || path !== (kind === 'source' ? preview.path : preview.stylesheetPath)) return;
    if (kind === 'source') {
        if (!result) return;
        preview.content = result.content;
        preview.sourceMtime = result.mtime;
    } else if (!result) {
        preview.stylesheetContent = '';
        preview.stylesheetMtime = null;
        preview.stylesheetError = preview.stylesheetOptional ? '' : `Stylesheet not found: ${preview.stylesheetReference}`;
    } else {
        preview.stylesheetContent = result.content;
        preview.stylesheetMtime = result.mtime;
        preview.stylesheetError = '';
    }
    schedulePDFPreviewRefresh();
}

function hasDirtyTab(path) {
    return Boolean((getState('openTabs') || []).some(candidate =>
        candidate?.type === 'file' && candidate.path === path && candidate.dirty
    ));
}

function handleEditorContentChange(event) {
    const detail = event.detail || {};
    if (!isPreviewOpen() || typeof detail.path !== 'string' || typeof detail.content !== 'string') return;
    if (detail.path === preview.path) {
        preview.content = detail.content;
        schedulePDFPreviewRefresh();
    } else if (detail.path === preview.stylesheetPath) {
        preview.stylesheetContent = detail.content;
        preview.stylesheetError = '';
        schedulePDFPreviewRefresh();
    }
}

function handleVaultFileSaved(event) {
    const detail = event.detail || {};
    if (!isPreviewOpen() || typeof detail.path !== 'string') return;
    if (detail.path === preview.path && typeof detail.content === 'string') {
        preview.content = detail.content;
        preview.sourceMtime = detail.mtime;
        schedulePDFPreviewRefresh();
    } else if (detail.path === preview.stylesheetPath && typeof detail.content === 'string') {
        preview.stylesheetContent = detail.content;
        preview.stylesheetMtime = detail.mtime;
        preview.stylesheetError = '';
        schedulePDFPreviewRefresh();
    }
}

function handleFileTreeRefresh(event) {
    if (!isPreviewOpen()) return;
    const tree = event.detail?.tree || [];
    const source = findTreeFile(tree, preview.path);
    const stylesheet = preview.stylesheetPath ? findTreeFile(tree, preview.stylesheetPath) : null;
    const stylesheetChanged = stylesheet
        ? stylesheet.mtime !== preview.stylesheetMtime
        : preview.stylesheetMtime !== null;

    if (source && source.mtime !== preview.sourceMtime && !hasDirtyTab(preview.path)) {
        reloadPreviewFile(preview.path, 'source');
    }
    if (preview.stylesheetPath && stylesheetChanged && !hasDirtyTab(preview.stylesheetPath)) {
        reloadPreviewFile(preview.stylesheetPath, 'stylesheet');
    }
}

async function savePreviewBuffer(path, content) {
    if (!path || typeof content !== 'string') return;
    const tab = (getState('openTabs') || []).find(candidate => candidate?.type === 'file' && candidate.path === path);
    if (!tab) return;

    // `file-content-changed` is deliberately dispatched as soon as CodeMirror
    // has a new snapshot, while its tab-dirty bookkeeping is asynchronous.
    // Comparing the preview's snapshot to disk closes that small race: a user
    // can click Generate PDF immediately after seeing a live style change and
    // still get exactly that version in the exported document.
    const onDisk = await readVaultText(path);
    if (!tab.dirty && onDisk?.content === content) return;

    const { saveFileSnapshot } = await import('./tabManager.js');
    const result = await saveFileSnapshot(tab, content);
    if (!result?.success) throw new Error(result?.error || `Could not save ${path} before generating the PDF.`);
}

async function savePreviewBuffers(stylesheetPath = preview.stylesheetPath) {
    await savePreviewBuffer(preview.path, preview.content);
    if (stylesheetPath && stylesheetPath !== preview.path) {
        await savePreviewBuffer(stylesheetPath, preview.stylesheetContent);
    }
}

async function generatePDF() {
    if (previewGenerating || !preview.path) return;
    previewGenerating = true;
    const { generate } = panelElements();
    if (generate) {
        generate.disabled = true;
        generate.setAttribute('aria-busy', 'true');
    }

    try {
        const latest = await getDirtyTabContent(preview.path);
        if (typeof latest === 'string') preview.content = latest;
        const resolved = resolvePDFPreviewStylesheetPath(preview.path, getPrintStylesheet(preview.content));
        await savePreviewBuffers(resolved.path);
        const result = await exportMarkdownToPDF({
            path: preview.path,
            title: preview.title,
            content: preview.content,
        });
        setPreviewStatus('PDF generated from the current preview.');
        return result;
    } catch (error) {
        log.error('PDF generation from preview failed:', error);
        setPreviewStatus(error?.message || 'PDF generation failed.', 'error');
        await pdfExportErrorDialog(error);
        return null;
    } finally {
        previewGenerating = false;
        if (generate) {
            generate.disabled = false;
            generate.removeAttribute('aria-busy');
        }
    }
}

async function openPreviewStylesheet() {
    if (!preview.stylesheetPath || preview.stylesheetError) return;
    const { handleFileOpen } = await import('./app.js');
    await handleFileOpen(preview.stylesheetPath);
}

export async function openPDFPreview({ path, title, content } = {}) {
    if (!path || !/\.md$/i.test(path)) throw new Error('PDF preview is only available for Markdown files.');
    initPDFPreview();
    const panel = ensurePreviewPanel();
    const sidebar = document.getElementById('right-sidebar');
    const rightTitle = document.getElementById('right-sidebar-title');
    const resizer = document.getElementById('right-sidebar-resizer');
    if (!panel || !sidebar) throw new Error('PDF preview panel is unavailable.');

    document.dispatchEvent(new CustomEvent('close-history-panel'));
    hideCalendarContent();
    document.getElementById('topbar-calendar')?.classList.remove('active');

    previewRequestId++;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
    resetScrollSync();
    preview.path = String(path).replaceAll('\\', '/');
    preview.title = String(title || preview.path.split('/').pop() || 'Document').replace(/\.md$/i, '');
    preview.content = typeof content === 'string' ? content : '';
    preview.sourceMtime = null;
    preview.stylesheetPath = '';
    preview.stylesheetReference = '';
    preview.stylesheetOptional = false;
    preview.stylesheetContent = '';
    preview.stylesheetMtime = null;
    preview.stylesheetError = '';

    if (!preview.content && !await loadPreviewSource(preview.path)) {
        throw new Error('Markdown file could not be read for preview.');
    }

    panel.hidden = false;
    sidebar.dataset.mode = previewMode;
    sidebar.classList.add('open', 'pdf-preview-mode');
    sidebar.classList.remove('collapsed');
    if (rightTitle) rightTitle.textContent = 'PDF Preview';
    if (resizer) resizer.classList.add('visible');
    updatePreviewMeta();
    setPreviewStatus('Preparing live preview…');
    ensureEditorScrollSync();
    window.dispatchEvent(new Event('resize'));
    schedulePDFPreviewRefresh(0);
}

export function closePDFPreview({ keepSidebarOpen = false } = {}) {
    const sidebar = document.getElementById('right-sidebar');
    const resizer = document.getElementById('right-sidebar-resizer');
    const { panel } = panelElements();
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
    previewRequestId++;
    resetScrollSync();
    if (panel) panel.hidden = true;

    if (sidebar?.dataset.mode === previewMode) {
        delete sidebar.dataset.mode;
        sidebar.classList.remove('pdf-preview-mode');
        if (!keepSidebarOpen) {
            sidebar.classList.remove('open');
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
        }
    }
    if (!keepSidebarOpen) resizer?.classList.remove('visible');
    preview.path = '';
    preview.content = '';
    window.dispatchEvent(new Event('resize'));
}

export function initPDFPreview() {
    const panel = ensurePreviewPanel();
    if (!panel) return;

    if (!previewInitialized) {
        previewInitialized = true;
        document.addEventListener('file-content-changed', handleEditorContentChange);
        document.addEventListener('vault-file-saved', handleVaultFileSaved);
        document.addEventListener('vault-file-tree-refreshed', handleFileTreeRefresh);
        document.addEventListener('close-pdf-preview', event => closePDFPreview(event.detail || {}));
        document.addEventListener('tab-switched', handlePreviewTabSwitch);
    }

    if (!panel.dataset.bound) {
        panel.dataset.bound = 'true';
        panel.addEventListener('click', event => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (action === 'generate-pdf') generatePDF();
            if (action === 'open-stylesheet') openPreviewStylesheet();
        });
        panel.querySelector('.pdf-preview-frame')?.addEventListener('load', event => {
            const frame = event.currentTarget;
            installPreviewFrameInteractions(frame);
            restorePreviewScrollAfterLoad(frame);
            setPreviewLoading(false);
        });
    }
}

export default {
    initPDFPreview,
    openPDFPreview,
    closePDFPreview,
    isPDFPreviewOpen,
    schedulePDFPreviewRefresh,
};

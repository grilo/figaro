import { backend } from './backend.js';
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
import {
    exportMarkdownToPDF,
    renderPrintableDiagrams,
    renderPrintableMarkdownFromRendered,
    renderPrintableMarkdownWithDiagrams,
} from './pdfExport.js';
import { pdfExportErrorDialog, pdfStyleReferenceDialog } from './dialogs.js';
import { updateRightSidebarEditorLayout } from './historyPanel.js';

const previewDebounceMs = 320;
const previewMode = 'pdf-preview';
const previewFramePath = '/pdf/preview-frame.html';
const previewBridgeChannel = 'figaro-pdf-preview-v1';
const previewBridgeRecoveryMs = 700;
// Native scrolling must remain free to run at display refresh rate. The
// companion pane is only a visual reference, so update it at a modest bounded
// rate and always send the final coalesced position.
const previewScrollSyncIntervalMs = 34;
const previewResizeSettleMs = 80;

let previewTimer = null;
let previewRequestId = 0;
let previewRenderInFlight = false;
let previewRenderQueued = false;
let previewRenderPromise = null;
let previewInitialized = false;
let previewGenerating = false;

const previewMarkdownWorker = {
    worker: null,
    disabled: false,
    nextRequestID: 0,
    pending: new Map(),
};

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
    documentHTML: '',
};

// The preview frame is deliberately cross-origin/sandboxed. Keep the scroll
// state in the application and exchange it through the bridge rather than
// reading frame.contentDocument or frame.contentWindow's DOM directly.
const scrollSync = {
    editor: null,
    editorListener: null,
    pendingDocumentProgress: 0,
    documentProgress: 0,
    lastProgress: 0,
    resetOnNextRender: true,
    suppressEditor: false,
    editorFrame: null,
    editorSyncTimer: null,
    pendingEditorProgress: null,
    lastEditorSyncAt: Number.NEGATIVE_INFINITY,
    expectedEditorScroll: null,
    resizing: false,
    resizeResumeTimer: null,
};

const previewBridge = {
    frame: null,
    window: null,
    ready: false,
    bootstrapToken: '',
    token: '',
    render: null,
    recoveryTimer: null,
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
    // The fixed preview bridge copies this stylesheet as text. Prevent a
    // literal closing tag from escaping the generated print document first.
    return String(css || '').replace(/<\/style/gi, '<\\/style');
}

const previewPageSizes = Object.freeze({
    a3: ['297mm', '420mm'],
    a4: ['210mm', '297mm'],
    a5: ['148mm', '210mm'],
    b5: ['176mm', '250mm'],
    letter: ['8.5in', '11in'],
    legal: ['8.5in', '14in'],
    ledger: ['11in', '17in'],
    tabloid: ['11in', '17in'],
    executive: ['7.25in', '10.5in'],
});

const previewPageLengthPattern = /^(?:\d+(?:\.\d+)?|\.\d+)(?:mm|cm|in|pt|pc|px|q)$/i;

/** Resolve the last supported @page size declaration, defaulting to A4. */
export function resolvePDFPreviewPageSize(css = '') {
    const source = String(css).replace(/\/\*[\s\S]*?\*\//g, ' ');
    let declaration = '';
    const pageRule = /@page(?:\s+[\w-]+)?(?:\s*:[\w-]+)?\s*\{([^{}]*)\}/gi;
    let ruleMatch;
    while ((ruleMatch = pageRule.exec(source))) {
        const sizeDeclaration = /(?:^|;)\s*size\s*:\s*([^;}]+)/gi;
        let sizeMatch;
        while ((sizeMatch = sizeDeclaration.exec(ruleMatch[1]))) declaration = sizeMatch[1].trim();
    }

    const tokens = declaration.toLowerCase().split(/\s+/).filter(Boolean);
    const orientation = tokens.includes('landscape') ? 'landscape' : 'portrait';
    const namedSize = tokens.find(token => previewPageSizes[token]);
    const lengths = tokens.filter(token => previewPageLengthPattern.test(token));
    let [width, height] = previewPageSizes[namedSize || 'a4'];
    let name = namedSize ? namedSize.toUpperCase() : 'A4';

    if (!namedSize && lengths.length) {
        width = lengths[0];
        height = lengths[1] || lengths[0];
        name = lengths.length > 1 ? `${width} × ${height}` : width;
    }
    if (orientation === 'landscape') [width, height] = [height, width];

    return { width, height, orientation, name };
}

const previewSurfaceCSS = `
  /* Preview-only geometry comes before user CSS. Keep the body transparent so
     an ordinary html { background: ... } rule behaves exactly as it does in
     the exported document. */
  html { min-height: 100%; background: #fff; }
  body {
    padding: 18mm;
    background: transparent;
    box-shadow: 0 2px 12px rgba(15, 23, 42, .2);
  }
  @media screen and (max-width: 760px) {
    body { padding: 11mm; box-shadow: none; }
  }
`;

function previewPageGeometryCSS({ width, height }) {
    return `
  /* This final preview-only rule represents the physical page box. It follows
     user CSS so body width overrides cannot make the paper grow with the pane. */
  body.figaro-pdf-preview-body {
    box-sizing: border-box !important;
    width: calc(100% - 32px) !important;
    max-width: ${width} !important;
    min-height: ${height} !important;
    margin: 16px auto !important;
  }
  @media screen and (max-width: 760px) {
    body.figaro-pdf-preview-body {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 auto !important;
    }
  }
`;
}

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
    const printableStyles = Array.from(head.querySelectorAll('style')).map(style => style.textContent || '').join('\n');
    const pageSize = resolvePDFPreviewPageSize(`${printableStyles}\n${stylesheetContent}`);

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

    // Apply the editable stylesheet after the visual surface, just as the
    // backend links it after Figaro's built-in print CSS. A final geometry-only
    // rule below preserves the physical page box without taking over colors or
    // typography.
    if (stylesheetContent) {
        const stylesheet = printable.createElement('style');
        stylesheet.id = 'figaro-preview-user-stylesheet';
        stylesheet.textContent = safeStyleText(rebasePDFPreviewStylesheetURLs(stylesheetContent, stylesheetPath));
        head.appendChild(stylesheet);
    }

    const geometry = printable.createElement('style');
    geometry.id = 'figaro-preview-page-geometry';
    geometry.textContent = previewPageGeometryCSS(pageSize);
    head.appendChild(geometry);

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

function decodePreviewPath(value) {
    try {
        return decodeURI(value);
    } catch (_) {
        return value;
    }
}

function splitPreviewLinkReference(href) {
    const value = String(href || '').trim();
    const fragmentIndex = value.indexOf('#');
    const pathAndQuery = fragmentIndex < 0 ? value : value.slice(0, fragmentIndex);
    const queryIndex = pathAndQuery.indexOf('?');
    return {
        path: queryIndex < 0 ? pathAndQuery : pathAndQuery.slice(0, queryIndex),
        fragmentID: fragmentIndex < 0 ? '' : getPDFPreviewFragmentID(value.slice(fragmentIndex)),
    };
}

function externalPreviewURL(href) {
    const value = String(href || '').trim();
    const protocolMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
    const protocolRelative = value.startsWith('//');
    if (!protocolMatch && !protocolRelative) return '';

    try {
        const url = new URL(protocolRelative ? `https:${value}` : value);
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
        return '';
    }
}

function isExplicitPreviewURL(href) {
    const value = String(href || '').trim();
    return value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function resolvePreviewVaultLink(href) {
    const { path, fragmentID } = splitPreviewLinkReference(href);
    if (!path) return { path: '', fragmentID };

    const normalizedPath = decodePreviewPath(path);
    const vaultPath = normalizedPath.startsWith('/vault/')
        ? normalizeVaultPath(normalizedPath.slice('/vault/'.length))
        : normalizeVaultPath(normalizedPath, parentDirectory(preview.path));
    return { path: vaultPath, fragmentID };
}

function openExternalPreviewURL(url) {
    try {
        if (typeof window.runtime?.BrowserOpenURL === 'function') {
            window.runtime.BrowserOpenURL(url);
            return true;
        }
        if (typeof window.open === 'function') {
            window.open(url, '_blank', 'noopener,noreferrer');
            return true;
        }
    } catch (error) {
        log.warn('Could not open PDF preview link:', error);
    }
    return false;
}

async function openPreviewVaultLink(path) {
    if (!path) {
        setPreviewStatus('This preview link does not point to a vault file.', 'error');
        return;
    }
    try {
        const { handleFileOpen } = await import('./app.js');
        await handleFileOpen(path);
    } catch (error) {
        log.warn('Could not open linked vault file from PDF preview:', error);
        setPreviewStatus(`Could not open ${path}.`, 'error');
    }
}

function createPreviewBridgeToken() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `figaro-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function previewBridgeFrameURL() {
    if (!previewBridge.bootstrapToken) previewBridge.bootstrapToken = createPreviewBridgeToken();
    return `${previewFramePath}#${encodeURIComponent(previewBridge.bootstrapToken)}`;
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

function disablePreviewMarkdownWorker(error) {
    previewMarkdownWorker.disabled = true;
    previewMarkdownWorker.worker?.terminate?.();
    previewMarkdownWorker.worker = null;
    for (const { reject } of previewMarkdownWorker.pending.values()) reject(error);
    previewMarkdownWorker.pending.clear();
}

function ensurePreviewMarkdownWorker() {
    if (previewMarkdownWorker.disabled || typeof Worker !== 'function') return null;
    if (previewMarkdownWorker.worker) return previewMarkdownWorker.worker;

    try {
        const worker = new Worker('/js/pdfRenderWorker.js', { type: 'module' });
        worker.onmessage = event => {
            const { id, body, error } = event.data || {};
            const pending = previewMarkdownWorker.pending.get(id);
            if (!pending) return;
            previewMarkdownWorker.pending.delete(id);
            if (error) pending.reject(new Error(String(error)));
            else pending.resolve(String(body || ''));
        };
        worker.onerror = event => {
            const error = event?.error instanceof Error
                ? event.error
                : new Error(event?.message || 'Printable Markdown worker failed');
            disablePreviewMarkdownWorker(error);
        };
        previewMarkdownWorker.worker = worker;
        return worker;
    } catch (error) {
        disablePreviewMarkdownWorker(error instanceof Error ? error : new Error(String(error)));
        return null;
    }
}

function renderPrintableMarkdownBodyOffMainThread(markdown) {
    const worker = ensurePreviewMarkdownWorker();
    if (!worker) return Promise.resolve(null);

    const id = ++previewMarkdownWorker.nextRequestID;
    return new Promise((resolve, reject) => {
        previewMarkdownWorker.pending.set(id, { resolve, reject });
        try {
            worker.postMessage({ id, markdown: String(markdown || '') });
        } catch (error) {
            previewMarkdownWorker.pending.delete(id);
            reject(error);
        }
    });
}

async function renderPreviewPrintableMarkdown(markdown, title) {
    try {
        const rendered = await renderPrintableMarkdownBodyOffMainThread(markdown);
        if (rendered === null) return renderPrintableMarkdownWithDiagrams(markdown, title);
        return renderPrintableDiagrams(renderPrintableMarkdownFromRendered(markdown, title, rendered));
    } catch (error) {
        // A Web Worker is an optimisation, not a preview dependency. WebKit
        // builds without module-worker support retain the proven main-thread
        // path rather than losing a printable preview.
        log.warn('Printable Markdown worker unavailable; using fallback:', error);
        return renderPrintableMarkdownWithDiagrams(markdown, title);
    }
}

function monotonicNow() {
    const now = globalThis.performance?.now?.();
    return Number.isFinite(now) ? now : Date.now();
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
    if (suppressKey === 'suppressEditor') {
        // Browser engines are allowed to dispatch a scroll event later than
        // the synchronous assignment below. Retaining the expected position
        // prevents that event from being mistaken for a second user gesture.
        scrollSync.expectedEditorScroll = { element, top: nextTop };
    }
    deferSuppression(suppressKey);
    element.scrollTop = nextTop;
    return true;
}

function consumesExpectedEditorScroll(editor) {
    const expected = scrollSync.expectedEditorScroll;
    if (!expected) return false;
    if (expected.element !== editor || Math.abs(finiteMetric(editor.scrollTop) - expected.top) >= 0.75) {
        scrollSync.expectedEditorScroll = null;
        return false;
    }
    scrollSync.expectedEditorScroll = null;
    return true;
}

function clearPreviewBridgeRecovery() {
    if (previewBridge.recoveryTimer) clearTimeout(previewBridge.recoveryTimer);
    previewBridge.recoveryTimer = null;
}

function postPreviewBridgeMessage(message) {
    const { frame } = panelElements();
    if (!frame || frame !== previewBridge.frame || !previewBridge.ready || !previewBridge.window) return false;
    try {
        previewBridge.window.postMessage({
            channel: previewBridgeChannel,
            ...message,
            token: message.token || previewBridge.token,
            bootstrapToken: previewBridge.bootstrapToken,
        }, '*');
        return true;
    } catch (error) {
        // A sandboxed or externally navigated frame must never be inspected.
        // Reloading the fixed bridge document is the safe recovery path.
        log.warn('Could not send a PDF preview bridge message:', error);
        previewBridge.ready = false;
        return false;
    }
}

function flushPreviewBridgeRender() {
    if (!isPreviewOpen() || !previewBridge.render) return false;
    return postPreviewBridgeMessage(previewBridge.render);
}

function queuePreviewBridgeRender(frame, html, documentProgress) {
    previewBridge.frame = frame;
    previewBridge.token = createPreviewBridgeToken();
    previewBridge.render = {
        type: 'render',
        token: previewBridge.token,
        html,
        documentProgress: clampProgress(documentProgress),
    };
    return flushPreviewBridgeRender();
}

function schedulePreviewBridgeRecovery(frame) {
    clearPreviewBridgeRecovery();
    if (!isPreviewOpen() || !frame) return;
    previewBridge.recoveryTimer = setTimeout(() => {
        previewBridge.recoveryTimer = null;
        if (!isPreviewOpen() || panelElements().frame !== frame || previewBridge.ready) return;
        // If an unexpected navigation ever happens, replace it with the
        // application-owned bridge instead of leaving a blank cross-origin
        // document in the right pane.
        previewBridge.bootstrapToken = createPreviewBridgeToken();
        previewBridge.token = '';
        previewBridge.window = null;
        frame.src = previewBridgeFrameURL();
    }, previewBridgeRecoveryMs);
}

function handlePreviewFrameLoad(frame) {
    clearPreviewBridgeRecovery();
    previewBridge.frame = frame;
    previewBridge.ready = false;
    try {
        // A WindowProxy is safe to retain and use only for postMessage. Do not
        // dereference its document or DOM: this frame is intentionally opaque.
        previewBridge.window = frame?.contentWindow || null;
    } catch (_) {
        previewBridge.window = null;
    }
    try {
        previewBridge.window?.postMessage({ channel: previewBridgeChannel, type: 'ping' }, '*');
    } catch (_) {
        // The recovery timer below will restore the application-owned frame.
    }
    schedulePreviewBridgeRecovery(frame);
}

function handlePreviewBridgeLink(href) {
    const value = String(href || '').trim();
    if (!value) return;

    const fragmentID = getPDFPreviewFragmentID(value);
    if (fragmentID) {
        postPreviewBridgeMessage({ type: 'scroll-fragment', fragment: fragmentID });
        return;
    }

    const externalURL = externalPreviewURL(value);
    if (externalURL) {
        if (openExternalPreviewURL(externalURL)) {
            setPreviewStatus('Opened external link in your browser.');
        } else {
            setPreviewStatus('Could not open the external link.', 'error');
        }
        return;
    }

    if (isExplicitPreviewURL(value)) {
        setPreviewStatus('This link type cannot be opened from the PDF preview.', 'error');
        return;
    }

    const vaultLink = resolvePreviewVaultLink(value);
    if (vaultLink.path === preview.path && vaultLink.fragmentID) {
        postPreviewBridgeMessage({ type: 'scroll-fragment', fragment: vaultLink.fragmentID });
        return;
    }
    void openPreviewVaultLink(vaultLink.path);
}

function handlePreviewBridgeMessage(event) {
    const message = event.data;
    if (!message || message.channel !== previewBridgeChannel) return;
    const { frame } = panelElements();
    if (!frame) return;
    if (!previewBridge.window) {
        try {
            previewBridge.frame = frame;
            previewBridge.window = frame.contentWindow || null;
        } catch (_) {
            return;
        }
    }
    if (event.source !== previewBridge.window) return;
    if (String(message.bootstrapToken || '') !== previewBridge.bootstrapToken) return;

    if (message.type === 'ready') {
        previewBridge.ready = true;
        clearPreviewBridgeRecovery();
        flushPreviewBridgeRender();
        if (scrollSync.resizing) postPreviewBridgeMessage({ type: 'set-scroll-sync-paused', paused: true });
        return;
    }

    if (!previewBridge.ready || message.token !== previewBridge.token) return;
    if (message.type === 'rendered') {
        setPreviewLoading(false);
        ensureEditorScrollSync();
        return;
    }
    if (message.type === 'render-error') {
        setPreviewLoading(false);
        setPreviewStatus(message.message || 'Could not render the PDF preview.', 'error');
        return;
    }
    if (message.type === 'reference-missing') {
        setPreviewStatus(`Reference not found: #${String(message.fragment || '')}`, 'error');
        return;
    }
    if (message.type === 'link') {
        handlePreviewBridgeLink(message.href);
        return;
    }
    if (message.type === 'scroll') {
        if (scrollSync.resizing) return;
        scrollSync.documentProgress = clampProgress(message.documentProgress);
        if (!message.programmatic) syncPreviewScrollToEditor(clampProgress(message.contentProgress));
    }
}

function clearEditorScrollSync() {
    if (scrollSync.editor && scrollSync.editorListener) {
        scrollSync.editor.removeEventListener('scroll', scrollSync.editorListener);
    }
    if (scrollSync.editorSyncTimer !== null) clearTimeout(scrollSync.editorSyncTimer);
    scrollSync.editor = null;
    scrollSync.editorListener = null;
    scrollSync.editorSyncTimer = null;
    scrollSync.pendingEditorProgress = null;
    scrollSync.lastEditorSyncAt = Number.NEGATIVE_INFINITY;
    scrollSync.expectedEditorScroll = null;
}

function flushEditorScrollToPreview() {
    const progress = scrollSync.pendingEditorProgress;
    scrollSync.pendingEditorProgress = null;
    if (!Number.isFinite(progress) || !isPreviewOpen() || !activePreviewSource() || scrollSync.suppressEditor || scrollSync.resizing) return false;
    if (!postPreviewBridgeMessage({ type: 'set-content-progress', progress })) {
        // The bridge can briefly be unavailable while its fixed document
        // starts. Keep the latest position for the next editor movement.
        scrollSync.pendingEditorProgress = progress;
        return false;
    }
    scrollSync.lastEditorSyncAt = monotonicNow();
    return true;
}

function queueEditorScrollToPreview(progress) {
    if (scrollSync.resizing) return false;
    scrollSync.pendingEditorProgress = clampProgress(progress);
    const elapsed = monotonicNow() - scrollSync.lastEditorSyncAt;
    if (elapsed >= previewScrollSyncIntervalMs) {
        if (scrollSync.editorSyncTimer !== null) {
            clearTimeout(scrollSync.editorSyncTimer);
            scrollSync.editorSyncTimer = null;
        }
        return flushEditorScrollToPreview();
    }
    if (scrollSync.editorSyncTimer !== null) return true;
    scrollSync.editorSyncTimer = setTimeout(() => {
        scrollSync.editorSyncTimer = null;
        flushEditorScrollToPreview();
    }, Math.max(0, previewScrollSyncIntervalMs - elapsed));
    return true;
}

function syncEditorScrollToPreview() {
    if (!isPreviewOpen() || !activePreviewSource() || scrollSync.suppressEditor || scrollSync.resizing) return;
    const editor = activeEditorScroller();
    if (!editor) return;
    const progress = scrollProgressForElement(editor);
    scrollSync.lastProgress = progress;
    queueEditorScrollToPreview(progress);
}

function ensureEditorScrollSync() {
    const editor = activeEditorScroller();
    if (editor === scrollSync.editor) return editor;

    clearEditorScrollSync();
    if (!editor) return null;

    scrollSync.editor = editor;
    scrollSync.editorListener = () => {
        if (scrollSync.resizing || scrollSync.suppressEditor || consumesExpectedEditorScroll(editor) || scrollSync.editorFrame !== null) return;
        scrollSync.editorFrame = scheduleAnimationFrame(() => {
            scrollSync.editorFrame = null;
            syncEditorScrollToPreview();
        });
    };
    editor.addEventListener('scroll', scrollSync.editorListener, { passive: true });
    return editor;
}

function syncPreviewScrollToEditor(progress) {
    // The frame explicitly marks host-initiated reports as programmatic before
    // this function is called. Do not use a parent-side timeout as a second
    // filter: a real preview scroll can arrive before that timer fires on a
    // busy runner or webview and must take effect immediately.
    if (!isPreviewOpen() || !activePreviewSource() || scrollSync.resizing) return;
    const editor = ensureEditorScrollSync();
    if (!editor) return;
    scrollSync.lastProgress = progress;
    setElementScrollProgress(editor, progress, 'suppressEditor');
}

function capturePreviewScrollProgress() {
    if (scrollSync.resetOnNextRender) {
        scrollSync.resetOnNextRender = false;
        return 0;
    }
    return scrollSync.documentProgress;
}

function resetScrollSync() {
    const frameWasPausedForResize = scrollSync.resizing || scrollSync.resizeResumeTimer !== null;
    if (scrollSync.resizeResumeTimer !== null) clearTimeout(scrollSync.resizeResumeTimer);
    clearEditorScrollSync();
    cancelScheduledAnimationFrame(scrollSync.editorFrame);
    scrollSync.editorFrame = null;
    scrollSync.pendingDocumentProgress = 0;
    scrollSync.documentProgress = 0;
    scrollSync.lastProgress = 0;
    scrollSync.resetOnNextRender = true;
    scrollSync.suppressEditor = false;
    scrollSync.resizing = false;
    scrollSync.resizeResumeTimer = null;
    // Closing or replacing a preview during the short post-resize settle
    // window must not leave the reusable frame permanently paused.
    if (frameWasPausedForResize) postPreviewBridgeMessage({ type: 'set-scroll-sync-paused', paused: false });
}

function suspendScrollSyncForResize(event) {
    if (event.detail?.mode !== previewMode || !isPreviewOpen()) return;
    if (scrollSync.resizeResumeTimer !== null) clearTimeout(scrollSync.resizeResumeTimer);
    scrollSync.resizeResumeTimer = null;
    scrollSync.resizing = true;
    cancelScheduledAnimationFrame(scrollSync.editorFrame);
    scrollSync.editorFrame = null;
    if (scrollSync.editorSyncTimer !== null) clearTimeout(scrollSync.editorSyncTimer);
    scrollSync.editorSyncTimer = null;
    scrollSync.pendingEditorProgress = null;
    scrollSync.expectedEditorScroll = null;
    postPreviewBridgeMessage({ type: 'set-scroll-sync-paused', paused: true });
}

function resumeScrollSyncAfterResize(event) {
    if (event.detail?.mode !== previewMode || !scrollSync.resizing) return;
    if (scrollSync.resizeResumeTimer !== null) clearTimeout(scrollSync.resizeResumeTimer);
    // Width changes can enqueue a final iframe scroll after pointer release.
    // Keep both directions quiet until that resize-originated event is stale.
    scrollSync.resizeResumeTimer = setTimeout(() => {
        scrollSync.resizeResumeTimer = null;
        if (!isPreviewOpen()) {
            scrollSync.resizing = false;
            return;
        }
        scrollSync.resizing = false;
        postPreviewBridgeMessage({ type: 'set-scroll-sync-paused', paused: false });
        scrollSync.lastEditorSyncAt = Number.NEGATIVE_INFINITY;
        syncEditorScrollToPreview();
    }, previewResizeSettleMs);
}

function handlePreviewTabSwitch(event) {
    if (!isPreviewOpen()) return;
    if (event.detail?.path !== preview.path) {
        clearEditorScrollSync();
        return;
    }
    scheduleAnimationFrame(() => {
        const editor = ensureEditorScrollSync();
        if (editor) setElementScrollProgress(editor, scrollSync.lastProgress, 'suppressEditor');
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
        styleReference: panel.querySelector('[data-action="style-reference"]'),
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
            <div class="pdf-preview-actions">
                <button type="button" class="pdf-preview-style-reference" data-action="style-reference" title="Show Figaro’s generated HTML, classes, and IDs" aria-label="Open PDF style reference">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14"/></svg>
                </button>
                <button type="button" class="pdf-preview-generate" data-action="generate-pdf">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M8 15h8M8 18h6"/></svg>
                    <span>Generate PDF</span>
                </button>
            </div>
        </div>
        <p class="pdf-preview-status" aria-live="polite">Preparing live preview…</p>
        <div class="pdf-preview-stage">
            <div class="pdf-preview-loading" hidden>Updating preview…</div>
            <iframe class="pdf-preview-frame" title="Live PDF preview" src="${previewBridgeFrameURL()}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
        </div>
    `;
    content.appendChild(panel);
    return panel;
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
    const result = await backend().ReadFile(path);
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

function renderPreview() {
    if (previewRenderInFlight) {
        // Diagram rendering can be asynchronous and expensive. Let the
        // current work settle, discard it if its input changed, then render
        // only the latest queued snapshot instead of starting parallel work.
        previewRenderQueued = true;
        return previewRenderPromise || Promise.resolve();
    }
    if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
    }
    if (!isPreviewOpen()) return Promise.resolve();

    previewRenderInFlight = true;
    const requestId = ++previewRequestId;
    previewRenderPromise = (async () => {
        let awaitingBridgeRender = false;
        setPreviewLoading(true);
        setPreviewStatus('Updating live preview…');
        try {
            await ensurePreviewStylesheet(requestId);
            if (requestId !== previewRequestId || !isPreviewOpen()) return;

            const printable = await renderPreviewPrintableMarkdown(preview.content, preview.title);
            if (requestId !== previewRequestId || !isPreviewOpen()) return;

            const { frame } = panelElements();
            if (!frame) return;
            // The fixed sandboxed frame receives a document snapshot through
            // its message bridge. It keeps arbitrary print CSS out of the app
            // chrome without requiring the parent to access a frame DOM.
            scrollSync.pendingDocumentProgress = capturePreviewScrollProgress();
            preview.documentHTML = buildPDFPreviewDocument(printable, {
                notePath: preview.path,
                stylesheetPath: preview.stylesheetPath,
                stylesheetContent: preview.stylesheetContent,
            });
            queuePreviewBridgeRender(frame, preview.documentHTML, scrollSync.pendingDocumentProgress);
            awaitingBridgeRender = true;
            updatePreviewMeta();
            setPreviewStatus(preview.stylesheetError ? 'Live preview updated — using the built-in style.' : 'Live preview up to date.');
        } catch (error) {
            if (requestId !== previewRequestId || !isPreviewOpen()) return;
            log.error('PDF preview failed:', error);
            setPreviewStatus(error?.message || 'Could not render the PDF preview.', 'error');
        } finally {
            if (requestId === previewRequestId && !awaitingBridgeRender) setPreviewLoading(false);
            previewRenderInFlight = false;
            previewRenderPromise = null;
            if (previewRenderQueued && isPreviewOpen()) {
                previewRenderQueued = false;
                // A newer edit may still be inside its debounce window. Let
                // that timer retain the normal typing cadence; otherwise the
                // queued render is ready to start immediately.
                if (!previewTimer) void renderPreview();
            } else {
                previewRenderQueued = false;
            }
        }
    })();
    return previewRenderPromise;
}

export function schedulePDFPreviewRefresh(delay = previewDebounceMs) {
    if (!isPreviewOpen()) return;
    // Invalidate active diagram/print work as soon as the editor has a newer
    // snapshot, rather than waiting for this trailing debounce to expire.
    previewRequestId++;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
        previewTimer = null;
        void renderPreview();
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

async function openPDFStyleReference() {
    if (!preview.documentHTML) await renderPreview();
    if (!preview.documentHTML) return;
    await pdfStyleReferenceDialog(preview.documentHTML);
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
    document.dispatchEvent(new CustomEvent('close-outline-panel', { detail: { keepSidebarOpen: true } }));
    document.dispatchEvent(new CustomEvent('close-markdown-preview', { detail: { keepSidebarOpen: true } }));

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
    preview.documentHTML = '';

    if (!preview.content && !await loadPreviewSource(preview.path)) {
        throw new Error('Markdown file could not be read for preview.');
    }

    panel.hidden = false;
    sidebar.dataset.mode = previewMode;
    sidebar.classList.add('open', 'pdf-preview-mode');
    sidebar.classList.remove('collapsed');
    if (rightTitle) rightTitle.textContent = 'PDF Preview';
    if (resizer) resizer.classList.add('visible');
    scheduleAnimationFrame(() => updateRightSidebarEditorLayout());
    updatePreviewMeta();
    setPreviewStatus('Preparing live preview…');
    const frame = panel.querySelector('.pdf-preview-frame');
    if (frame && (previewBridge.frame !== frame || !previewBridge.ready)) {
        handlePreviewFrameLoad(frame);
    }
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
    previewRenderQueued = false;
    clearPreviewBridgeRecovery();
    previewBridge.render = null;
    previewBridge.token = '';
    resetScrollSync();
    setPreviewLoading(false);
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
    updateRightSidebarEditorLayout();
    if (!keepSidebarOpen) resizer?.classList.remove('visible');
    preview.path = '';
    preview.content = '';
    preview.documentHTML = '';
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
        document.addEventListener('right-sidebar-resize-start', suspendScrollSyncForResize);
        document.addEventListener('right-sidebar-resize-end', resumeScrollSyncAfterResize);
        window.addEventListener('message', handlePreviewBridgeMessage);
    }

    if (!panel.dataset.bound) {
        panel.dataset.bound = 'true';
        panel.addEventListener('click', event => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (action === 'generate-pdf') generatePDF();
            if (action === 'open-stylesheet') openPreviewStylesheet();
            if (action === 'style-reference') openPDFStyleReference();
        });
        const frame = panel.querySelector('.pdf-preview-frame');
        frame?.addEventListener('load', event => {
            handlePreviewFrameLoad(event.currentTarget);
        });
        if (frame) handlePreviewFrameLoad(frame);
    }
}

export default {
    initPDFPreview,
    openPDFPreview,
    closePDFPreview,
    isPDFPreviewOpen,
    schedulePDFPreviewRefresh,
};

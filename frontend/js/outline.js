/**
 * Document Outline — a quiet heading navigator for Markdown notes.
 *
 * The pane and sticky hierarchy deliberately read the CodeMirror document
 * rather than changing source. Navigation remains outside the editor's
 * decoration and widget layers, so cursor geometry stays owned by CodeMirror.
 */

import { getEditorContent, getEditorDocumentTabId, getEditorView } from './editor.js';
import { getState } from './state.js';
import { setRightSidebarOpen } from './rightSidebarState.js';
import { synchronizeMermaidEditorViewportWidth } from './mermaidEditorGutter.js';
import {
    activeOutlineHeadingHierarchy,
    activeOutlineHeadingIndex,
    extractOutlineHeadings,
    stickyHeadingBoundaryPosition,
} from './core/outlineModel.js';

export {
    activeOutlineHeadingHierarchy,
    activeOutlineHeadingIndex,
    extractOutlineHeadings,
    stickyHeadingBoundaryPosition,
};

const MARKDOWN_PATH = /\.(?:md|markdown|mdown|mkdn)$/i;

let initialized = false;
let stickyHeadingsEnabled = true;
let documentOutlineEnabled = true;
let stickySignature = '';
const stickyHeadingMeasureKey = {};
let stickyMeasureView = null;
let stickyScrollDOM = null;
let stickyScrollHandler = null;
let outlineLayoutMeasureRequest = 0;
let model = {
    tabId: null,
    source: null,
    headings: [],
};

function activeFileTab() {
    const activeTabId = getState('activeTabId');
    return (getState('openTabs') || []).find(tab => tab?.id === activeTabId && tab.type === 'file') || null;
}

function isMarkdownTab(tab) {
    return Boolean(tab?.path && MARKDOWN_PATH.test(tab.path));
}

function outlineElements() {
    return {
        button: document.getElementById('outline-toggle'),
        sticky: document.getElementById('sticky-heading-stack'),
        sidebar: document.getElementById('right-sidebar'),
        content: document.getElementById('right-sidebar-content'),
        title: document.getElementById('right-sidebar-title'),
        resizer: document.getElementById('right-sidebar-resizer'),
    };
}

function sidebarOwnsOutline() {
    const { sidebar } = outlineElements();
    return Boolean(sidebar?.classList.contains('open') && sidebar.dataset.mode === 'outline');
}

/** Keep CodeMirror block widgets and gutters in one measurement frame while the pane animates. */
function synchronizeEditorLayoutDuringOutlineTransition(view = getEditorView()) {
    if (!view || view.isDestroyed || typeof requestAnimationFrame !== 'function') return;
    const request = ++outlineLayoutMeasureRequest;
    let previousWidth = -1;
    let stableFrames = 0;
    let frameCount = 0;
    const measure = () => {
        if (request !== outlineLayoutMeasureRequest || view.isDestroyed || frameCount >= 30) return;
        const width = view.dom.getBoundingClientRect().width;
        stableFrames = Math.abs(width - previousWidth) < 0.5 ? stableFrames + 1 : 0;
        previousWidth = width;
        frameCount += 1;
        synchronizeMermaidEditorViewportWidth(view, width);
        view.requestMeasure();
        if (stableFrames < 3) requestAnimationFrame(measure);
    };
    view.requestMeasure();
    requestAnimationFrame(measure);
}

function setOutlineControlVisible(visible) {
    const { button } = outlineElements();
    if (button) {
        const shouldShow = documentOutlineEnabled && visible && !sidebarOwnsOutline();
        button.hidden = !shouldShow;
        if (!shouldShow) {
            button.classList.remove('is-open');
            if (!sidebarOwnsOutline()) button.setAttribute('aria-expanded', 'false');
        }
    }
}

function setOutlineOpenState(open) {
    const { button } = outlineElements();
    if (!button) return;
    button.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.hidden = open || !documentOutlineEnabled || !model.headings.length;
}

function resetModel() {
    model = { tabId: null, source: null, headings: [] };
    renderStickyHeadingsAtPosition(-1);
}

function refreshOutlineModel() {
    const tab = activeFileTab();
    // During a tab switch, activeTabId changes before the shared editor has
    // received the destination source. Do not briefly expose A's headings on
    // B's tab while the guarded setEditorContent request is pending.
    if (!isMarkdownTab(tab) || getEditorDocumentTabId() !== tab.id) {
        resetModel();
        setOutlineControlVisible(false);
        return false;
    }

    const source = getEditorContent();
    const changed = model.tabId !== tab.id || model.source !== source;
    if (changed) {
        model = {
            tabId: tab.id,
            source,
            headings: extractOutlineHeadings(source),
        };
    }
    setOutlineControlVisible(model.headings.length > 0);
    if (changed) {
        if (model.headings.length) scheduleStickyHeadingMeasure();
        else renderStickyHeadingsAtPosition(-1);
    }
    return changed;
}

function currentEditorPosition(preferViewport = false) {
    const view = getEditorView();
    if (!view) return 0;
    if (preferViewport && view.scrollDOM && typeof view.posAtCoords === 'function') {
        const rect = view.scrollDOM.getBoundingClientRect();
        const position = view.posAtCoords({ x: rect.left + 12, y: rect.top + 12 });
        if (Number.isInteger(position)) return position;
    }
    return view.state.selection.main.head;
}

function updateActiveOutlineItem(preferViewport = false) {
    if (!sidebarOwnsOutline()) return;
    const index = activeOutlineHeadingIndex(model.headings, currentEditorPosition(preferViewport));
    document.querySelectorAll('.outline-item').forEach((item, itemIndex) => {
        const active = itemIndex === index;
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'location');
        else item.removeAttribute('aria-current');
    });
}

function navigateToHeading(from) {
    const view = getEditorView();
    if (!view || !Number.isInteger(from)) return;
    view.dispatch({ selection: { anchor: from }, scrollIntoView: true });
    view.focus();
    updateActiveOutlineItem();
}

function headingButton(heading, className) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = className;
    item.dataset.position = String(heading.from);
    item.title = heading.text;

    const type = document.createElement('span');
    type.className = `${className}-type`;
    type.textContent = `h${heading.level}`;
    type.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = `${className}-text`;
    text.textContent = heading.text;
    item.setAttribute('aria-label', `Go to h${heading.level} ${heading.text}`);
    item.append(type, text);
    item.addEventListener('click', () => navigateToHeading(heading.from));
    return item;
}

function renderStickyHeadingsAtPosition(position) {
    const { sticky } = outlineElements();
    if (!sticky) return;
    const view = getEditorView();
    const hierarchy = stickyHeadingsEnabled && model.headings.length && position >= 0
        ? activeOutlineHeadingHierarchy(model.headings, position)
        : [];
    const signature = hierarchy.map(heading => `${heading.level}:${heading.from}:${heading.text}`).join('|');
    if (signature === stickySignature && sticky.childElementCount === hierarchy.length) return false;
    stickySignature = signature;
    sticky.replaceChildren(...hierarchy.map(heading => headingButton(heading, 'sticky-heading-item')));
    sticky.hidden = hierarchy.length === 0;
    view?.requestMeasure?.();
    // A newly added or removed row changes the covered boundary. Measure once
    // more so tightly spaced descendants settle without touching raw scroll
    // events or forcing synchronous layout.
    scheduleStickyHeadingMeasure(view);
    return true;
}

function scheduleStickyHeadingMeasure(view = getEditorView()) {
    const { sticky } = outlineElements();
    if (!sticky || !view || view.isDestroyed || !stickyHeadingsEnabled || !model.headings.length) return;
    if (stickyMeasureView === view) return;
    stickyMeasureView = view;
    view.requestMeasure({
        key: stickyHeadingMeasureKey,
        read(measuredView) {
            const stackHeight = sticky.hidden ? 0 : sticky.getBoundingClientRect().height;
            const boundaryHeight = measuredView.scrollDOM.getBoundingClientRect().top
                + stackHeight
                - measuredView.documentTop;
            const lineBlock = measuredView.lineBlockAtHeight(boundaryHeight);
            return stickyHeadingBoundaryPosition(boundaryHeight, lineBlock);
        },
        write(position, measuredView) {
            if (stickyMeasureView === measuredView) stickyMeasureView = null;
            if (measuredView !== getEditorView() || measuredView.isDestroyed) return;
            renderStickyHeadingsAtPosition(position);
        },
    });
}

function synchronizeStickyHeadingScrollListener(view = getEditorView()) {
    const nextScrollDOM = view && !view.isDestroyed ? view.scrollDOM : null;
    if (nextScrollDOM === stickyScrollDOM) return;
    if (stickyScrollDOM && stickyScrollHandler) {
        stickyScrollDOM.removeEventListener('scroll', stickyScrollHandler);
    }
    stickyScrollDOM = nextScrollDOM;
    stickyScrollHandler = nextScrollDOM
        ? () => scheduleStickyHeadingMeasure(view)
        : null;
    if (stickyScrollDOM && stickyScrollHandler) {
        // CodeMirror coalesces the keyed measure into its next read/write
        // cycle, so this passive handler does no layout or DOM work itself.
        stickyScrollDOM.addEventListener('scroll', stickyScrollHandler, { passive: true });
    }
}

function renderOutlinePanel() {
    const { content } = outlineElements();
    if (!content || !sidebarOwnsOutline()) return;

    content.querySelector('.outline-panel')?.remove();
    const panel = document.createElement('section');
    panel.className = 'outline-panel';
    panel.setAttribute('aria-label', 'Document outline');

    const intro = document.createElement('p');
    intro.className = 'outline-intro';
    intro.textContent = 'Headings in this note';
    panel.append(intro);

    const list = document.createElement('nav');
    list.className = 'outline-list';
    list.setAttribute('aria-label', 'Heading navigation');
    const baseLevel = Math.min(...model.headings.map(heading => heading.level));
    model.headings.forEach((heading, index) => {
        const item = headingButton(heading, 'outline-item');
        item.dataset.index = String(index);
        item.style.paddingInlineStart = `${8 + (heading.level - baseLevel) * 12}px`;
        list.append(item);
    });
    panel.append(list);
    content.append(panel);
    updateActiveOutlineItem();
}

function refreshOpenOutline({ preferViewport = false } = {}) {
    const changed = refreshOutlineModel();
    if (!sidebarOwnsOutline()) return;
    if (!model.headings.length) {
        closeOutlinePanel();
        return;
    }
    if (changed || !document.querySelector('.outline-panel')) renderOutlinePanel();
    else updateActiveOutlineItem(preferViewport);
}

function toggleOutlinePanel() {
    if (sidebarOwnsOutline()) {
        closeOutlinePanel();
        return;
    }
    openOutlinePanel();
}

export function openOutlinePanel() {
    if (!documentOutlineEnabled) return false;
    refreshOutlineModel();
    if (!model.headings.length) return false;

    // The right pane has one owner at a time. These events keep all cleanup
    // local to their panels and preserve the shared splitter for the new pane.
    document.dispatchEvent(new CustomEvent('close-history-panel'));
    document.dispatchEvent(new CustomEvent('close-pdf-preview', { detail: { keepSidebarOpen: true } }));
    document.dispatchEvent(new CustomEvent('close-raw-text-preview', { detail: { keepSidebarOpen: true } }));

    const { sidebar, title, resizer } = outlineElements();
    if (!sidebar) return false;
    sidebar.dataset.mode = 'outline';
    sidebar.classList.remove('pdf-preview-mode', 'collapsed');
    setRightSidebarOpen(sidebar, true);
    if (title) title.textContent = 'Document outline';
    resizer?.classList.add('visible');
    setOutlineOpenState(true);
    renderOutlinePanel();
    synchronizeEditorLayoutDuringOutlineTransition();
    window.dispatchEvent(new Event('resize'));
    return true;
}

export function closeOutlinePanel({ keepSidebarOpen = false } = {}) {
    const { sidebar, content, resizer } = outlineElements();
    const ownsSidebar = sidebar?.dataset.mode === 'outline';
    content?.querySelector('.outline-panel')?.remove();
    if (sidebar && ownsSidebar) {
        delete sidebar.dataset.mode;
        if (!keepSidebarOpen) {
            setRightSidebarOpen(sidebar, false);
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
            resizer?.classList.remove('visible');
        }
    }
    setOutlineOpenState(false);
    setOutlineControlVisible(model.headings.length > 0);
    synchronizeEditorLayoutDuringOutlineTransition();
    window.dispatchEvent(new Event('resize'));
}

export function setStickyHeadingsEnabled(enabled) {
    stickyHeadingsEnabled = Boolean(enabled);
    if (!stickyHeadingsEnabled) renderStickyHeadingsAtPosition(-1);
    else {
        synchronizeStickyHeadingScrollListener();
        scheduleStickyHeadingMeasure();
    }
}

export function setDocumentOutlineEnabled(enabled) {
    documentOutlineEnabled = Boolean(enabled);
    if (!documentOutlineEnabled && sidebarOwnsOutline()) closeOutlinePanel();
    setOutlineControlVisible(model.headings.length > 0);
}

export function initOutlinePanel() {
    if (initialized) return;
    initialized = true;

    const { button } = outlineElements();
    synchronizeStickyHeadingScrollListener();
    button?.addEventListener('click', toggleOutlinePanel);
    document.addEventListener('close-outline-panel', event => closeOutlinePanel(event.detail || {}));
    document.addEventListener('active-tab-changed', () => {
        if (sidebarOwnsOutline()) closeOutlinePanel();
        resetModel();
        setOutlineControlVisible(false);
    });
    document.addEventListener('tab-switched', refreshOpenOutline);
    document.addEventListener('editor-view-updated', event => {
        synchronizeStickyHeadingScrollListener();
        const detail = event.detail || {};
        if (detail.docChanged) refreshOpenOutline();
        else if (detail.selectionSet || detail.viewportChanged) {
            refreshOutlineModel();
            if (detail.viewportChanged) scheduleStickyHeadingMeasure();
            if (sidebarOwnsOutline()) updateActiveOutlineItem(Boolean(detail.viewportChanged && !detail.selectionSet));
        }
    });

    refreshOutlineModel();
    scheduleStickyHeadingMeasure();
}

export default {
    activeOutlineHeadingIndex,
    activeOutlineHeadingHierarchy,
    closeOutlinePanel,
    extractOutlineHeadings,
    initOutlinePanel,
    openOutlinePanel,
    setDocumentOutlineEnabled,
    setStickyHeadingsEnabled,
};

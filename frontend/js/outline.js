import { subscribeEditorUpdates } from './editorUpdates.js';
import { countEditorWork, traceEditorWork } from './editorDiagnostics.js';
/**
 * Document Outline — a quiet heading navigator for Markdown notes.
 *
 * The pane and sticky hierarchy deliberately read the CodeMirror document
 * rather than changing source. Navigation remains outside the editor's
 * decoration and widget layers, so cursor geometry stays owned by CodeMirror.
 */

import { getEditorContent, getEditorDocumentTabId, getEditorView } from './editor.js';
import { EditorView } from '@codemirror/view';
import { synchronizeEditorBlockActionLayout } from './editorBlockActionLayout.js';
import { getState } from './state.js';
import { setRightSidebarOpen } from './rightSidebarState.js';
import { claimRightPane, registerRightPaneMode } from './rightPaneCoordinator.js';
import { bindRightPaneLauncher } from './rightPaneLauncher.js';
import { setTooltip } from './tooltip.js';
import {
    activeOutlineHeadingHierarchy,
    activeOutlineHeadingIndex,
    advanceOutlineHeadingAlignment,
    documentOutlineControlState,
    extractOutlineHeadings,
    outlineEditNeedsParse,
    mapOutlineHeadings,
    outlineHeadingStructure,
    stickyHeadingBoundaryPosition,
} from './core/outlineModel.js';

export {
    activeOutlineHeadingHierarchy,
    activeOutlineHeadingIndex,
    documentOutlineControlState,
    extractOutlineHeadings,
    stickyHeadingBoundaryPosition,
};

const MARKDOWN_PATH = /\.(?:md|markdown|mdown|mkdn)$/i;

let initialized = false;
let stickyHeadingsEnabled = true;
let documentOutlineEnabled = true;
let stickySignature = '';
let outlineRows = [];
let activeOutlineRow = null;
const stickyHeadingMeasureKey = {};
let stickyMeasureView = null;
let stickyScrollDOM = null;
let stickyScrollHandler = null;
let outlineLayoutMeasureRequest = 0;
let stopHeadingAlignment = () => {};
let model = {
    tabId: null,
    document: null,
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
        synchronizeEditorBlockActionLayout(view, width);
        view.requestMeasure();
        if (stableFrames < 3) requestAnimationFrame(measure);
    };
    view.requestMeasure();
    requestAnimationFrame(measure);
}

function synchronizeOutlineControl() {
    const { button } = outlineElements();
    if (!button) return;
    const state = documentOutlineControlState({
        enabled: documentOutlineEnabled,
        markdownReady: model.tabId !== null,
        hasHeadings: model.headings.length > 0,
        open: sidebarOwnsOutline(),
    });
    button.hidden = state.hidden;
    // Remain in the keyboard focus order so the unavailable reason can be
    // discovered without a pointer. Activation is guarded below.
    button.disabled = false;
    button.setAttribute('aria-disabled', String(state.disabled));
    button.classList.toggle('is-open', state.expanded);
    button.setAttribute('aria-expanded', String(state.expanded));
    button.setAttribute('aria-pressed', String(state.expanded));
    setTooltip(button, state.tooltip);
    if (state.description) button.setAttribute('aria-description', state.description);
    else button.removeAttribute('aria-description');
}

function resetModel() {
    stopHeadingAlignment();
    model = { tabId: null, document: null, source: null, headings: [] };
    renderStickyHeadingsAtPosition(-1);
}

function refreshOutlineModel(update = {}) {
    const tab = activeFileTab();
    // During a tab switch, activeTabId changes before the shared editor has
    // received the destination source. Do not briefly expose A's headings on
    // B's tab while the guarded setEditorContent request is pending.
    if (!isMarkdownTab(tab) || getEditorDocumentTabId() !== tab.id) {
        resetModel();
        synchronizeOutlineControl();
        return false;
    }

    // CodeMirror documents are immutable. Selection and viewport updates can
    // reuse the heading model without flattening a long note into a string.
    const document = getEditorView()?.state.doc;
    if (document && model.tabId === tab.id && model.document === document) return false;
    if (document && model.tabId === tab.id && model.document === update.previousDocument && update.changes) {
        const changes = [];
        let needsParse = false;
        update.changes.iterChanges((from, to, nextFrom, nextTo, inserted) => {
            const before = update.previousDocument;
            const first = before.lineAt(from), last = before.lineAt(to);
            const nextFirst = document.lineAt(nextFrom), nextLast = document.lineAt(nextTo);
            needsParse ||= first.number !== last.number || nextFirst.number !== nextLast.number
                || outlineEditNeedsParse({
                    beforeLine: first.text, afterLine: nextFirst.text,
                    beforeNextLine: last.number < before.lines ? before.line(last.number + 1).text : '',
                    afterNextLine: nextLast.number < document.lines ? document.line(nextLast.number + 1).text : '',
                });
            changes.push({ from, to, insertedLength: inserted.length });
        });
        if (!needsParse) {
            stopHeadingAlignment();
            model = { ...model, document, source: null, headings: mapOutlineHeadings(model.headings, changes) };
            scheduleStickyHeadingMeasure();
            return true;
        }
    }
    const source = getEditorContent();
    const changed = model.tabId !== tab.id || model.source !== source;
    model.document = document;
    if (changed) {
        stopHeadingAlignment();
        model = {
            tabId: tab.id,
            document,
            source,
            headings: traceEditorWork('outline.parse', 'document structure', () => {
                countEditorWork('parse.outline');
                return extractOutlineHeadings(source);
            }),
        };
        model.headingStructure = outlineHeadingStructure(model.headings);
    }
    synchronizeOutlineControl();
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
    const next = outlineRows[index] || null;
    if (next === activeOutlineRow) return;
    if (activeOutlineRow) {
        countEditorWork('dom.outlineSelection');
        activeOutlineRow.classList.remove('is-active');
        activeOutlineRow.removeAttribute('aria-current');
    }
    if (next) {
        countEditorWork('dom.outlineSelection');
        next.classList.add('is-active');
        next.setAttribute('aria-current', 'location');
    }
    activeOutlineRow = next;
}

function navigateToHeading(from) {
    const view = getEditorView();
    if (!view || !Number.isInteger(from)) return;
    stopHeadingAlignment();
    const source = view.state.doc;
    const stickyHeight = () => {
        const { sticky } = outlineElements();
        return sticky && !sticky.hidden ? sticky.getBoundingClientRect().height : 0;
    };
    let alignment = { height: stickyHeight(), adjustments: 0 }, frame;
    let active = true;
    const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const cancel = () => {
        active = false;
        cancelAnimationFrame(frame);
        observer.disconnect();
        for (const type of inputs) document.removeEventListener(type, cancel, true);
        if (stopHeadingAlignment === cancel) stopHeadingAlignment = () => {};
    };
    stopHeadingAlignment = cancel;
    const current = () => active && !view.isDestroyed && view === getEditorView() && view.state.doc === source && view.state.selection.main.head === from;
    // Sticky layout can arrive several frames after the first scroll. Observe
    // its actual changes instead of guessing when layout has finished. There
    // is no polling; the next user input releases the observer before handling.
    const observer = new ResizeObserver(() => {
        if (!current()) { cancel(); return; }
        alignment = advanceOutlineHeadingAlignment(alignment, stickyHeight());
        if (!alignment.realign) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            if (!current()) { cancel(); return; }
            view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start' }) });
            if (!alignment.pending) cancel();
        });
    });
    view.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: 'start' }) });
    view.focus();
    updateActiveOutlineItem();
    const { sticky } = outlineElements();
    if (active && sticky) observer.observe(sticky); else cancel();
    for (const type of inputs) if (active) document.addEventListener(type, cancel, { passive: true, capture: true });
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
    item.addEventListener('click', () => navigateToHeading(Number(item.dataset.position)));
    return item;
}

function renderStickyHeadingsAtPosition(position) {
    const { sticky } = outlineElements();
    if (!sticky) return;
    const view = getEditorView();
    const hierarchy = stickyHeadingsEnabled && model.headings.length && position >= 0
        ? activeOutlineHeadingHierarchy(model.headings, position, model.headingStructure)
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

    const existing = [...content.querySelectorAll('.outline-item')];
    if (existing.length === model.headings.length && existing.every((item, index) => (
        item.querySelector('.outline-item-text')?.textContent === model.headings[index].text
        && item.querySelector('.outline-item-type')?.textContent === `h${model.headings[index].level}`
    ))) {
        outlineRows = existing;
        existing.forEach((item, index) => {
            const position = String(model.headings[index].from);
            if (item.dataset.position !== position) item.dataset.position = position;
        });
        updateActiveOutlineItem();
        return;
    }

    const focusedHeading = content.contains(document.activeElement)
        ? document.activeElement.closest('.outline-item')
        : null;
    const focusedPosition = focusedHeading ? Number(focusedHeading.dataset.position) : null;
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
    outlineRows = [];
    activeOutlineRow = null;
    const baseLevel = Math.min(...model.headings.map(heading => heading.level));
    model.headings.forEach((heading, index) => {
        const item = headingButton(heading, 'outline-item');
        item.dataset.index = String(index);
        item.style.paddingInlineStart = `${8 + (heading.level - baseLevel) * 12}px`;
        list.append(item);
        outlineRows.push(item);
    });
    panel.append(list);
    content.append(panel);
    updateActiveOutlineItem();
    if (focusedPosition !== null) {
        const index = Math.max(0, activeOutlineHeadingIndex(model.headings, focusedPosition));
        list.children[index]?.focus({ preventScroll: true });
    }
}

function refreshOpenOutline({ preferViewport = false, ...update } = {}) {
    const changed = refreshOutlineModel(update);
    if (!sidebarOwnsOutline()) return;
    if (!model.headings.length) {
        closeOutlinePanel();
        return;
    }
    if (changed || !document.querySelector('.outline-panel')) renderOutlinePanel();
    else updateActiveOutlineItem(preferViewport);
}

function toggleOutlinePanel({ focusPane = true } = {}) {
    if (outlineElements().button?.getAttribute('aria-disabled') === 'true') return;
    if (sidebarOwnsOutline()) {
        closeOutlinePanel();
        return;
    }
    openOutlinePanel({ focusHeading: focusPane });
}

export function openOutlinePanel({ focusHeading = false } = {}) {
    if (!documentOutlineEnabled) return false;
    refreshOutlineModel();
    if (!model.headings.length) return false;

    const { sidebar, title, resizer } = outlineElements();
    if (!sidebar) return false;
    claimRightPane('outline', sidebar);
    sidebar.dataset.mode = 'outline';
    sidebar.classList.remove('pdf-preview-mode', 'collapsed');
    setRightSidebarOpen(sidebar, true);
    if (title) title.textContent = 'Document outline';
    resizer?.classList.add('visible');
    synchronizeOutlineControl();
    renderOutlinePanel();
    if (focusHeading && sidebar.getAttribute('aria-hidden') !== 'true') {
        const heading = sidebar.querySelector('.outline-item[aria-current="location"]')
            || sidebar.querySelector('.outline-item');
        heading?.focus({ preventScroll: true });
    }
    synchronizeEditorLayoutDuringOutlineTransition();
    window.dispatchEvent(new Event('resize'));
    return true;
}

export function closeOutlinePanel({ keepSidebarOpen = false, restoreFocus = true } = {}) {
    const { button, sidebar, content, resizer } = outlineElements();
    const ownsSidebar = sidebar?.dataset.mode === 'outline';
    const returnFocus = restoreFocus && !keepSidebarOpen && ownsSidebar
        && sidebar.contains(document.activeElement);
    content?.querySelector('.outline-panel')?.remove();
    outlineRows = [];
    activeOutlineRow = null;
    if (sidebar && ownsSidebar) {
        delete sidebar.dataset.mode;
        if (!keepSidebarOpen) {
            setRightSidebarOpen(sidebar, false);
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
            resizer?.classList.remove('visible');
        }
    }
    synchronizeOutlineControl();
    if (returnFocus) {
        if (button && !button.hidden && sidebar.dataset.pureSuppressed !== 'true') {
            button.focus({ preventScroll: true });
        } else getEditorView()?.focus();
    }
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
    synchronizeOutlineControl();
}

export function initOutlinePanel() {
    if (initialized) return;
    initialized = true;

    const { button } = outlineElements();
    registerRightPaneMode('outline', closeOutlinePanel, openOutlinePanel);
    synchronizeStickyHeadingScrollListener();
    bindRightPaneLauncher(button, { getEditorView, activate: toggleOutlinePanel });
    document.addEventListener('active-tab-changed', () => {
        if (sidebarOwnsOutline()) closeOutlinePanel({ restoreFocus: false });
        resetModel();
        synchronizeOutlineControl();
    });
    document.addEventListener('tab-switched', refreshOpenOutline);
    document.addEventListener('editor-text-scale-applied', () => {
        synchronizeStickyHeadingScrollListener();
        scheduleStickyHeadingMeasure();
    });
    subscribeEditorUpdates('outline', detail => {
        synchronizeStickyHeadingScrollListener();
        if (detail.docChanged || detail.ownerChanged) refreshOpenOutline(detail);
        else if (detail.selectionSet || detail.viewportChanged) {
            refreshOutlineModel();
            if (detail.viewportChanged) scheduleStickyHeadingMeasure();
            if (sidebarOwnsOutline()) updateActiveOutlineItem(Boolean(detail.viewportChanged && !detail.selectionSet));
        }
    });

    refreshOutlineModel();
    scheduleStickyHeadingMeasure();
}

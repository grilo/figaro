/**
 * Document Outline — a quiet heading navigator for Markdown notes.
 *
 * The pane deliberately reads the CodeMirror document and selection rather
 * than adding editor decorations. That keeps it useful for long notes without
 * changing source layout, cursor movement, or live-preview widgets.
 */

import { getEditorContent, getEditorDocumentTabId, getEditorView } from './editor.js';
import { getState } from './state.js';

const MARKDOWN_PATH = /\.(?:md|markdown|mdown|mkdn)$/i;
const HEADING = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const SETEXT = /^\s*(=+|-+)\s*$/;

let initialized = false;
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

/**
 * Return source positions for Markdown headings while deliberately ignoring
 * frontmatter and fenced code. `from` is a CodeMirror document offset, so
 * callers can select a heading without searching its (possibly repeated) text
 * again.
 */
export function extractOutlineHeadings(source) {
    const text = String(source ?? '');
    const headings = [];
    let inFence = false;
    let fenceCharacter = '';
    let inFrontmatter = text.split('\n')[0]?.trim() === '---';
    let position = 0;
    const lines = text.split('\n');

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        const trimmed = line.trim();
        if (inFrontmatter) {
            if (index > 0 && (trimmed === '---' || trimmed === '...')) inFrontmatter = false;
            position += rawLine.length + 1;
            continue;
        }
        const fence = line.match(FENCE);
        if (fence) {
            const character = fence[1][0];
            if (!inFence) {
                inFence = true;
                fenceCharacter = character;
            } else if (character === fenceCharacter) {
                inFence = false;
                fenceCharacter = '';
            }
            position += rawLine.length + 1;
            continue;
        }

        if (!inFence) {
            const match = line.match(HEADING);
            if (match) {
                headings.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    from: position,
                });
            } else {
                const next = lines[index + 1] || '';
                const underline = next.endsWith('\r') ? next.slice(0, -1) : next;
                const setext = underline.match(SETEXT);
                if (trimmed && setext) {
                    headings.push({
                        level: setext[1][0] === '=' ? 1 : 2,
                        text: trimmed,
                        from: position,
                    });
                }
            }
        }
        position += rawLine.length + 1;
    }
    return headings;
}

/** Return the heading whose section contains a CodeMirror document position. */
export function activeOutlineHeadingIndex(headings, position) {
    if (!Array.isArray(headings) || !headings.length) return -1;
    let active = 0;
    for (let index = 1; index < headings.length; index++) {
        if (headings[index].from > position) break;
        active = index;
    }
    return active;
}

function outlineElements() {
    return {
        button: document.getElementById('outline-toggle'),
        separator: document.getElementById('outline-separator'),
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

function setOutlineControlVisible(visible) {
    const { button, separator } = outlineElements();
    if (button) {
        button.hidden = !visible;
        if (!visible) {
            button.classList.remove('is-open');
            button.setAttribute('aria-expanded', 'false');
        }
    }
    if (separator) separator.hidden = !visible;
}

function setOutlineOpenState(open) {
    const { button } = outlineElements();
    if (!button) return;
    button.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
}

function resetModel() {
    model = { tabId: null, source: null, headings: [] };
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
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'outline-item';
        item.dataset.index = String(index);
        item.dataset.position = String(heading.from);
        item.style.paddingInlineStart = `${8 + (heading.level - baseLevel) * 12}px`;
        item.textContent = heading.text;
        item.title = heading.text;
        item.addEventListener('click', () => navigateToHeading(heading.from));
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
    refreshOutlineModel();
    if (!model.headings.length) return false;

    // The right pane has one owner at a time. These events keep all cleanup
    // local to their panels and preserve the shared splitter for the new pane.
    document.dispatchEvent(new CustomEvent('close-history-panel'));
    document.dispatchEvent(new CustomEvent('close-pdf-preview', { detail: { keepSidebarOpen: true } }));
    document.dispatchEvent(new CustomEvent('close-markdown-preview', { detail: { keepSidebarOpen: true } }));

    const { sidebar, title, resizer } = outlineElements();
    if (!sidebar) return false;
    sidebar.dataset.mode = 'outline';
    sidebar.classList.remove('pdf-preview-mode', 'collapsed');
    sidebar.classList.add('open');
    if (title) title.textContent = 'Outline';
    resizer?.classList.add('visible');
    setOutlineOpenState(true);
    renderOutlinePanel();
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
            sidebar.classList.remove('open');
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
            resizer?.classList.remove('visible');
        }
    }
    setOutlineOpenState(false);
    window.dispatchEvent(new Event('resize'));
}

export function initOutlinePanel() {
    if (initialized) return;
    initialized = true;

    const { button } = outlineElements();
    button?.addEventListener('click', toggleOutlinePanel);
    document.addEventListener('close-outline-panel', event => closeOutlinePanel(event.detail || {}));
    document.addEventListener('active-tab-changed', () => {
        if (sidebarOwnsOutline()) closeOutlinePanel();
        resetModel();
        setOutlineControlVisible(false);
    });
    document.addEventListener('tab-switched', refreshOpenOutline);
    document.addEventListener('editor-view-updated', event => {
        const detail = event.detail || {};
        if (detail.docChanged) refreshOpenOutline();
        else if (sidebarOwnsOutline() && (detail.selectionSet || detail.viewportChanged)) {
            refreshOutlineModel();
            updateActiveOutlineItem(Boolean(detail.viewportChanged && !detail.selectionSet));
        }
    });

    refreshOutlineModel();
}

export default {
    activeOutlineHeadingIndex,
    closeOutlinePanel,
    extractOutlineHeadings,
    initOutlinePanel,
    openOutlinePanel,
};

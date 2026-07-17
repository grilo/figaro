/**
 * CodeMirror 6 Editor Implementation
 * Uses locally vendored CodeMirror 6 modules + codemirror-live-markdown
 */

import { log } from './log.js';
import { setState, getState } from './state.js';
import { statusBar } from './statusBar.js';
import { mathField } from './mathPlugin.js';
import { createDiagramField, diagramLanguages } from './liveDiagramPlugin.js';
import { getFootnoteAtPosition, resolveFootnoteNavigation } from './footnotes.js';
import { getFileLanguage, loadLanguageSupport } from './languageSupport.js';
import { createFrontmatterField } from './frontmatterPlugin.js';
import { createFrontmatterCompletionSource, getRelativePrintStylesheets } from './frontmatterCompletions.js';
import { createDateShortcutCompletionSource } from './dateShortcutCompletions.js';
import { pdfExportErrorDialog, tableConversionDialog } from './dialogs.js';
import { handleClipboardImagePaste, pasteClipboardImage } from './clipboardImage.js';
import { handleClipboardTablePaste, insertMarkdownTable, pasteClipboardTable } from './clipboardTable.js';
import { markdownTableAutocompleter, markdownTables, TableStyle, TableTheme } from 'codemirror-markdown-tables';
import {
    livePreviewPlugin,
    markdownStylePlugin,
    editorTheme,
    linkPlugin,
    codeBlockField,
    imageField,
    collapseOnSelectionFacet,
    mouseSelectingField,
    setMouseSelecting,
    shouldShowSource
} from 'codemirror-live-markdown';

// CodeMirror 6 imports (loaded from local vendor directory)
let EditorView, EditorState, StateField, StateEffect, RangeSetBuilder, Prec, Compartment,
    lineNumbers, highlightActiveLineGutter, drawSelection,
    keymap, defaultKeymap, cursorLineUp, cursorLineDown, history, historyKeymap, foldGutter, foldKeymap,
    bracketMatching, autocompletion, completionKeymap, acceptCompletion, indentUnit,
    markdownLanguage, markdownKeymap,
    ViewPlugin, Decoration, WidgetType, EditorSelection,
    syntaxTree, indentMore, indentLess,
    syntaxHighlighting, HighlightStyle, tags;

// Editor instance
let editorView = null;
let vimCompartment = null;
let imageBasePathCompartment = null;
let readOnlyCompartment = null;
let fileModeCompartment = null;
let foldingCompartment = null;
let vimActive = false;
let vimRequested = false;
let vimRequestId = 0;
let vimModeCM = null;
let vimModeChangeHandler = null;
let activeFileLanguage = { kind: 'markdown', label: 'Markdown', description: null };
let fileModeRequest = 0;
let markdownModeExtensions = null;
let codeModeExtensions = null;
let codeHighlighting = null;
let searchExtension = null;
let searchKeymap = [];
let openNativeSearchPanel = null;
let closeNativeSearchPanel = null;
let isNativeSearchPanelOpen = null;
const footnoteReturnPositions = new Map();

let indentationMarkers = null;
// CodeMirror's indentUnit is the single source of truth for both Tab / Shift+Tab
// and the indentation-marker extension. Keep the visual tab width in CSS in
// lockstep with this value (see .cm-code-file .cm-content).
const codeIndentUnit = '  ';

export function isBlockquoteLine(line) {
    return /^ {0,3}>\s?/.test(line);
}

/**
 * Return the adjacent source-line position only when the browser's visual
 * cursor calculation unexpectedly skipped multiple document lines.
 */
export function adjacentLinePositionForUnexpectedVerticalSkip(document, beforePosition, afterPosition, forward) {
    const sourceLine = document.lineAt(beforePosition);
    const movedLine = document.lineAt(afterPosition);
    const targetNumber = sourceLine.number + (forward ? 1 : -1);
    const skippedLines = forward
        ? movedLine.number > sourceLine.number + 1
        : movedLine.number < sourceLine.number - 1;
    if (!skippedLines || targetNumber < 1 || targetNumber > document.lines) return null;

    const targetLine = document.line(targetNumber);
    const sourceColumn = beforePosition - sourceLine.from;
    return targetLine.from + Math.min(sourceColumn, targetLine.length);
}

/**
 * Preserve CodeMirror's normal visual-line movement, but contain any remaining
 * engine-specific height-map error to one source line. Correct widget geometry
 * is the primary fix; this is a last-resort guard for desktop webviews.
 */
export function moveCursorVerticallySafely(view, forward) {
    const before = view.state.selection.main;
    if (!before.empty || view.state.selection.ranges.length !== 1) return false;

    const move = forward ? cursorLineDown : cursorLineUp;
    if (!move || !move(view)) return false;

    const after = view.state.selection.main;
    const targetPosition = adjacentLinePositionForUnexpectedVerticalSkip(
        view.state.doc,
        before.head,
        after.head,
        forward
    );
    if (targetPosition === null) return true;

    view.dispatch({
        selection: EditorSelection.cursor(targetPosition, after.assoc, after.bidiLevel, after.goalColumn),
        scrollIntoView: true,
        userEvent: 'select',
    });
    return true;
}

const bulletMarkers = ['\u2022', '\u25E6', '\u25AA'];

// Lezer includes the current BulletList in the ancestor chain for ListMark,
// so depth 1 is the top-level list. Cycle a conventional, stable hierarchy
// rather than shifting the first marker or flattening every deeper level.
export function bulletMarkerForListDepth(depth) {
    const normalizedDepth = Math.max(1, Math.floor(Number(depth) || 1));
    return bulletMarkers[(normalizedDepth - 1) % bulletMarkers.length];
}

async function loadCodeMirrorModules() {
    try {
        const [
            cmView, cmState, cmCommands, cmLanguage, cmMarkdown, cmAutocomplete, cmHighlight, cmSearch
        ] = await Promise.all([
            import('@codemirror/view'), import('@codemirror/state'), import('@codemirror/commands'),
            import('@codemirror/language'), import('@codemirror/lang-markdown'),
            import('@codemirror/autocomplete'), import('@lezer/highlight'), import('@codemirror/search')
        ]);
        // WebKitGTK 2.52 can misinterpret the shorthand destructuring target
        // here as an uninitialized binding. Assign the imported property
        // explicitly so the packaged editor can initialize in every webview.
        const indentationMarkerModule = await import('@replit/codemirror-indentation-markers');
        indentationMarkers = indentationMarkerModule.indentationMarkers;
        ({ EditorView, keymap, drawSelection } = cmView);
        ({ EditorState, StateField, StateEffect, RangeSetBuilder, Prec, Compartment, EditorSelection } = cmState);
        ({ defaultKeymap, cursorLineUp, cursorLineDown, history, historyKeymap, indentMore, indentLess } = cmCommands);
        ({ foldGutter, foldKeymap, bracketMatching, syntaxTree, indentUnit, syntaxHighlighting, HighlightStyle } = cmLanguage);
        ({ autocompletion, completionKeymap, acceptCompletion } = cmAutocomplete);
        ({ lineNumbers, highlightActiveLineGutter } = cmView);
        ({ markdownLanguage, markdownKeymap } = cmMarkdown);
        ({ ViewPlugin, Decoration, WidgetType } = cmView);
        ({ tags } = cmHighlight);
        ({
            search: searchExtension,
            searchKeymap,
            openSearchPanel: openNativeSearchPanel,
            closeSearchPanel: closeNativeSearchPanel,
            searchPanelOpen: isNativeSearchPanelOpen,
        } = cmSearch);
        codeHighlighting = syntaxHighlighting(HighlightStyle.define([
            { tag: [tags.keyword, tags.operatorKeyword, tags.controlKeyword, tags.definitionKeyword], color: 'var(--code-keyword-color)' },
            { tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string-color)' },
            { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--code-number-color)' },
            { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-function-color)' },
            { tag: tags.comment, color: 'var(--code-comment-color)', fontStyle: 'italic' },
            { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--code-type-color)' },
            { tag: [tags.variableName, tags.propertyName, tags.definition(tags.variableName)], color: 'var(--code-variable-color)' },
            { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--code-operator-color)' },
            { tag: [tags.meta, tags.annotation, tags.link], color: 'var(--code-builtin-color)' },
        ]));
        return true;
    } catch (err) {
        log.error('Failed to load CodeMirror modules:', err);
        throw err;
    }
}

async function initEditor() {
    await loadCodeMirrorModules();
}

/**
 * Resolve a relative markdown link URL against the current file's directory.
 * Only resolves paths starting with ../ or ./. Other relative paths
 * (e.g. "Projects/file.md") are passed through as vault-relative.
 * E.g. "../../Projects/x.md" + current file "notes/daily/2025.md"
 *   → "Projects/x.md"
 */
function resolveRelativeUrl(url) {
    if (!url || url.startsWith('/') || /^https?:/.test(url)) return url;

    // Only resolve paths that explicitly navigate with ../ or ./
    if (!url.startsWith('../') && !url.startsWith('./')) return url;

    try {
        const tabs = getState('openTabs');
        const activeId = getState('activeTabId');
        const activeTab = tabs.find(t => t.id === activeId);
        if (!activeTab || !activeTab.path) return url;

        const dir = activeTab.path.substring(0, activeTab.path.lastIndexOf('/'));
        if (!dir) return url;

        const parts = dir.split('/');
        for (const seg of url.split('/')) {
            if (seg === '..') {
                if (parts.length > 0) parts.pop();
            } else if (seg !== '.' && seg !== '') {
                parts.push(seg);
            }
        }
        return parts.join('/');
    } catch (_) {
        return url;
    }
}

/**
 * Extract a short preview from file content for the hover tooltip.
 * Strips markdown formatting, takes first 4 non-empty lines, truncates each.
 */
function extractPreview(content) {
    if (!content) return '';
    const lines = content.split('\n');
    const preview = [];
    let count = 0;
    for (const line of lines) {
        if (count >= 4) break;
        const trimmed = line.trim();
        if (!trimmed) continue;
        count++;
        let text = trimmed
            .replace(/^#{1,6}\s+/, '')
            .replace(/^>\s*/, '')
            .replace(/^[-*+]\s+/, '')
            .replace(/^\[([^\]]+)\]\([^)]+\)/, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/, '$1');
        if (text.length > 70) text = text.substring(0, 67) + '...';
        preview.push(text);
    }
    return preview.join('\n');
}

/**
 * Hover preview for markdown links — shows URL/file info on hover.
 * Uses a custom ViewPlugin with mouseover on contentDOM to avoid
 * conflicts with codemirror-live-markdown's Decoration.replace widgets.
 * Also handles Image, Autolink, and WikiLink syntax.
 */
function linkPreview() {
    const LINK_TYPES = new Set(['Link', 'URL', 'Image', 'Autolink']);
    const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;

    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.tooltip = null;
            this.view.contentDOM.addEventListener('mouseover', this.onMouseOver);
            this.view.contentDOM.addEventListener('mouseout', this.onMouseOut);
        }

        destroy() {
            this.view.contentDOM.removeEventListener('mouseover', this.onMouseOver);
            this.view.contentDOM.removeEventListener('mouseout', this.onMouseOut);
            this.hideTooltip();
        }

        onMouseOver = (event) => {
            const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return;

            console.log('[linkPreview] hover detected, pos:', pos);

            const tree = syntaxTree(this.view.state);
            let node = tree.resolveInner(pos, -1);
            console.log('[linkPreview] innermost node:', node?.name, 'from:', node?.from, 'to:', node?.to);

            while (node && !LINK_TYPES.has(node.name)) {
                node = node.parent;
            }

            if (!node || !LINK_TYPES.has(node.name)) {
                // Try WikiLink regex fallback
                const line = this.view.state.doc.lineAt(pos);
                const lineText = this.view.state.doc.sliceString(line.from, line.to);
                const offset = pos - line.from;

                // Search for a wikilink containing this position
                let m;
                const re = new RegExp(WIKI_LINK_RE.source, 'g');
                while ((m = re.exec(lineText)) !== null) {
                    if (offset >= m.index && offset <= m.index + m[0].length) {
                        const wikiName = m[2] || m[1];
                        console.log('[linkPreview] wikilink found:', wikiName);
                        this.showTooltip(event, wikiName, false);
                        return;
                    }
                }
                console.log('[linkPreview] no link node found, pos:', pos, 'node:', node?.name);
                return;
            }

            console.log('[linkPreview] link node found:', node.name);

            const text = this.view.state.doc.sliceString(node.from, node.to);
            let url;

            if (node.name === 'URL') {
                url = text;
            } else if (node.name === 'Autolink') {
                // Autolink: the URL is a child URL node
                const urlChild = node.getChild('URL');
                url = urlChild ? this.view.state.doc.sliceString(urlChild.from, urlChild.to) : text.replace(/^<|>$/g, '');
            } else if (node.name === 'Image') {
                const m = text.match(/^!\[([^\]]*)\]\((.+?)(?:\s+["'][^'"]+["'])?\)$/);
                url = m ? m[2] : null;
            } else {
                // Link node
                const m = text.match(/^\[([^\]]*)\]\((.+?)(?:\s+["'][^'"]+["'])?\)$/);
                url = m ? m[2] : null;
            }

            if (!url) {
                console.log('[linkPreview] could not extract URL from:', text);
                return;
            }

            console.log('[linkPreview] showing tooltip for:', url);
            this.showTooltip(event, url, /^https?:\/\//.test(url));
        };

        onMouseOut = (event) => {
            if (this.tooltip && !this.tooltip.contains(event.relatedTarget)) {
                this.hideTooltip();
            }
        };

        showTooltip(event, url, isExternal) {
            this.hideTooltip();

            const dom = document.createElement('div');
            dom.className = 'link-hover-preview';
            dom.addEventListener('mouseleave', () => this.hideTooltip());

            if (isExternal) {
                dom.innerHTML = '<span class="lh-type">External link</span><span class="lh-url">' + url + '</span>';
            } else {
                const displayUrl = (() => { try { return decodeURI(url); } catch (_) { return url; } })();
                dom.innerHTML = '<span class="lh-type">File link</span><span class="lh-path">' + displayUrl + '</span><span class="lh-status lh-checking">...</span>';
                const statusEl = dom.querySelector('.lh-status');
                const fetchContent = (window.go?.main?.App?.GetFileContent) || (window.pywebview?.api?.read_file);
                if (fetchContent) {
                    const resolvedUrl = resolveRelativeUrl(displayUrl);
                    fetchContent(resolvedUrl).then(r => {
                        const content = typeof r === 'string' ? r : (r && r.content) || '';
                        if (content) {
                            statusEl.className = 'lh-status lh-exists';
                            statusEl.textContent = '✓ Exists';
                            const previewText = extractPreview(content);
                            if (previewText) {
                                const previewEl = document.createElement('div');
                                previewEl.className = 'lh-preview';
                                previewEl.textContent = previewText;
                                dom.appendChild(previewEl);
                            }
                        } else if (r && r.path) {
                            statusEl.className = 'lh-status lh-exists';
                            statusEl.textContent = '✓ Exists';
                        } else {
                            statusEl.className = 'lh-status lh-missing';
                            statusEl.textContent = '✗ Not found';
                        }
                    }).catch(err => {
                        console.error('[linkPreview] fetchContent failed:', err);
                        statusEl.className = 'lh-status lh-missing';
                        statusEl.textContent = '✗ Not found';
                    });
                }
            }

            document.body.appendChild(dom);
            const rect = this.view.dom.getBoundingClientRect();
            dom.style.position = 'fixed';
            dom.style.left = Math.min(event.clientX, rect.right - 330) + 'px';
            dom.style.top = (event.clientY - dom.offsetHeight - 8) + 'px';

            this.tooltip = dom;
        }

        hideTooltip() {
            if (this.tooltip) {
                this.tooltip.remove();
                this.tooltip = null;
            }
        }
    });
}

/**
 * WebKitGTK reports a physical Shift+Tab as key="Unidentified" even though
 * code remains "Tab". Normalize that one event so CodeMirror and the nested
 * Markdown-table editor receive the key binding instead of moving browser
 * focus out of the editor.
 */
function normalizeWebKitShiftTab(event) {
    if (event?.key !== 'Unidentified' || event.code !== 'Tab' || !event.shiftKey
        || event.altKey || event.ctrlKey || event.metaKey) return false;

    const target = event.target;
    const KeyboardEventConstructor = target?.ownerDocument?.defaultView?.KeyboardEvent
        || globalThis.KeyboardEvent;
    if (!target?.dispatchEvent || typeof KeyboardEventConstructor !== 'function') return false;

    event.preventDefault();
    event.stopPropagation();
    target.dispatchEvent(new KeyboardEventConstructor('keydown', {
        key: 'Tab',
        code: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
    }));
    return true;
}

function createEditorView() {
    if (editorView) return editorView;
    const container = document.getElementById('editor-container');
    if (!container) return null;

    // The table widget installs its own keydown listener below the outer
    // CodeMirror handler. Observe the WebKitGTK Shift+Tab quirk in capture
    // phase so the normalized event reaches that nested listener first.
    const webKitShiftTabPlugin = ViewPlugin.fromClass(class {
        constructor(view) {
            this.dom = view.dom;
            this.handleKeyDown = event => normalizeWebKitShiftTab(event);
            this.dom.addEventListener('keydown', this.handleKeyDown, true);
        }

        destroy() {
            this.dom.removeEventListener('keydown', this.handleKeyDown, true);
        }
    });

    const getActiveFilePath = () => {
        const activeTab = (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId'));
        return activeTab?.type === 'file' ? activeTab.path : '';
    };
    const getDefaultAuthor = () => {
        const getUsername = globalThis.pywebview?.api?.get_os_username;
        return typeof getUsername === 'function' ? getUsername() : '';
    };

    // Live Diagram Field — block widgets need a StateField so CodeMirror can lay them out.
    let diagramField = [];
    if (StateField && EditorView && WidgetType && shouldShowSource && mouseSelectingField) {
        try { diagramField = createDiagramField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField); } catch(e) { log.warn('[diagram] create failed: ' + (e.message || e)); }
    }

    // Frontmatter is represented by a single collapsed Properties card until
    // the user activates it or moves the cursor into the YAML source.
    let frontmatterField = [];
    if (StateField && StateEffect && EditorView && Decoration && WidgetType) {
        try {
            frontmatterField = createFrontmatterField(
                StateField, StateEffect, EditorView, Decoration, WidgetType, mouseSelectingField,
                () => getRelativePrintStylesheets(getState('fileTreeData') || [], getActiveFilePath()),
                getDefaultAuthor,
                {
                    getActiveFilePath,
                    onStylesheetReady: async stylesheetPath => {
                        try {
                            const { refreshFileTree } = await import('./fileTree.js');
                            await refreshFileTree();
                            const { handleFileOpen } = await import('./app.js');
                            await handleFileOpen(stylesheetPath);
                        } catch (error) {
                            // The stylesheet was created successfully even if
                            // its tab cannot be opened immediately.
                            log.warn('[frontmatter] starter stylesheet created but could not be opened: ' + (error.message || error));
                        }
                    },
                }
            );
        } catch (error) {
            log.warn('[frontmatter] create failed: ' + (error.message || error));
        }
    }

    // Hashtag decoration plugin
    const hashtagPlugin = ViewPlugin.fromClass(class {
        constructor(view) { this.decorations = this.buildDecorations(view); }
        buildDecorations(view) {
            const builder = new RangeSetBuilder();
            const re = /(?<!\w)(?<!#)#([a-zA-Z][a-zA-Z0-9_-]*)\b/g;
            for (const { from, to } of view.visibleRanges) {
                const text = view.state.doc.sliceString(from, to);
                let m;
                while ((m = re.exec(text)) !== null) {
                    // Skip hex colors (#RGB, #RRGGBB, #RRGGBBAA)
                    if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(m[1])) continue;
                    const s = from + m.index;
                    const e = s + m[0].length;
                    const previous = s > 0 ? view.state.doc.sliceString(s - 1, s) : '';
                    const next = e < view.state.doc.length ? view.state.doc.sliceString(e, e + 1) : '';
                    // Kanban tags are standalone whitespace-delimited tokens.
                    // This excludes markdown anchors such as [guide](#section).
                    if ((previous && !/\s/.test(previous)) || (next && !/\s/.test(next))) continue;
                    builder.add(s, s + m[0].length, Decoration.mark({
                        class: 'cm-hashtag', attributes: { 'data-tag': m[1].toLowerCase() }
                    }));
                }
            }
            return builder.finish();
        }
        update(update) {
            if (update.docChanged || update.selectionSet || update.viewportChanged)
                this.decorations = this.buildDecorations(update.view);
        }
    }, { decorations: v => v.decorations });

    // Widget plugin — cursor-aware bullet points and interactive checkboxes
    const bulletW = (char) => new (class extends WidgetType {
        toDOM() { const s = document.createElement('span'); s.className = 'cm-bullet'; s.textContent = char; return s; }
    })();
    const checkboxW = (checked, view, from) => new (class extends WidgetType {
        toDOM() {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'cm-task-checkbox';
            input.checked = checked;
            input.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const newChar = checked ? ' ' : 'x';
                view.dispatch({
                    changes: { from: from + 1, to: from + 2, insert: newChar }
                });
            });
            return input;
        }
        eq(other) { return other.checked === checked; }
    })();

    const widgetPlugin = ViewPlugin.fromClass(class {
        constructor(view) { this.decorations = this.build(view); }
        update(update) {
            if (update.docChanged || update.selectionSet || update.viewportChanged)
                this.decorations = this.build(update.view);
        }
        build(view) {
            const decos = [];
            const activeLines = new Set();
            for (const r of view.state.selection.ranges) {
                const sl = view.state.doc.lineAt(r.from).number;
                const el = view.state.doc.lineAt(r.to).number;
                for (let l = sl; l <= el; l++) activeLines.add(l);
            }
            syntaxTree(view.state).iterate({
                enter: (ref) => {
                    const text = view.state.doc.sliceString(ref.from, ref.to);
                    const lineNum = view.state.doc.lineAt(ref.from).number;
                    const isActive = activeLines.has(lineNum);
                    if (ref.type.name === 'ListMark' && !isActive) {
                        const m = text.match(/^(\s*)([-*+]|\d+[.)])\s?/);
                        if (m) {
                            const start = ref.from + m[1].length;
                            const end = ref.to;
                            // Determine depth and list type
                            let depth = 0, isOrdered = false, p = ref.node.parent;
                            while (p) {
                                if (p.type.name === 'BulletList') depth++;
                                else if (p.type.name === 'OrderedList') isOrdered = true;
                                p = p.parent;
                            }
                            let widgetChar;
                            if (isOrdered) {
                                widgetChar = m[2] + ' ';
                            } else {
                                widgetChar = bulletMarkerForListDepth(depth) + ' ';
                            }
                            decos.push(Decoration.replace({
                                widget: bulletW(widgetChar)
                            }).range(start, end));
                        }
                    } else if (ref.type.name === 'Task') {
                        const m = text.match(/\[([ xX])\]/);
                        if (m) {
                            const start = ref.from + m.index;
                            if (!isActive) {
                                decos.push(Decoration.replace({
                                    widget: checkboxW(m[1] !== ' ', view, start)
                                }).range(start, start + m[0].length));
                            }
                        }
                    }
                }
            });
            return Decoration.set(decos.sort((a, b) => a.from - b.from), true);
        }
    }, { decorations: v => v.decorations });

    // Extras plugin: highlight, callouts, footnotes, horizontal rules
    const extrasPlugin = ViewPlugin.fromClass(class {
        constructor(view) { this.decorations = this.build(view); }
        update(update) {
            if (update.docChanged || update.selectionSet)
                this.decorations = this.build(update.view);
        }
        build(view) {
            const builder = new RangeSetBuilder();
            const doc = view.state.doc;
            const activeLines = new Set();
            for (const r of view.state.selection.ranges) {
                const sl = doc.lineAt(r.from).number;
                const el = doc.lineAt(r.to).number;
                for (let l = sl; l <= el; l++) activeLines.add(l);
            }
            for (const { from, to } of view.visibleRanges) {
                const text = doc.sliceString(from, to);
                const lines = text.split('\n');
                let pos = from;
                let inCallout = false;
                let calloutType = '';
                const calloutRe = /^>\s*\[!(\w+)\]\s*(.*)$/;

                for (const line of lines) {
                    const lineEnd = pos + line.length;
                    const lineNum = doc.lineAt(Math.min(pos, doc.length - 1)).number;
                    const isActive = activeLines.has(lineNum);
                    const calloutMatch = line.match(calloutRe);
                    const continuesCallout = !calloutMatch && inCallout && isBlockquoteLine(line);

                    // Plain blockquotes are line decorations so the border
                    // spans every quoted line (rather than only the `>` mark).
                    // Callouts keep their own stronger visual treatment.
                    if (isBlockquoteLine(line) && !calloutMatch && !continuesCallout) {
                        builder.add(pos, pos, Decoration.line({ class: 'cm-blockquote-line' }));
                    }
                    if (calloutMatch) {
                        inCallout = true;
                        calloutType = calloutMatch[1].toLowerCase();
                        builder.add(pos, pos, Decoration.line({ class: `cm-callout cm-callout-${calloutType}` }));
                    } else if (continuesCallout) {
                        builder.add(pos, pos, Decoration.line({ class: `cm-callout cm-callout-${calloutType}` }));
                    } else {
                        inCallout = false;
                        calloutType = '';
                    }

                    // Highlight: ==text==
                    const hlRe = /==([^=]+)==/g;
                    let m;
                    while ((m = hlRe.exec(line)) !== null) {
                        const s = pos + m.index;
                        builder.add(s, s + m[0].length, Decoration.mark({ class: 'cm-highlight' }));
                    }

                    // Footnote reference: [^1] or [^label]
                    const fnRe = /\[\^([^\]]+)\]/g;
                    while ((m = fnRe.exec(line)) !== null) {
                        const s = pos + m.index;
                        builder.add(s, s + m[0].length, Decoration.mark({ class: 'cm-footnote' }));
                    }

                    // Horizontal rule: ---, ***, ___
                    const hrRe = /^(-{3,}|\*{3,}|_{3,})\s*$/;
                    if (hrRe.test(line)) {
                        const cls = isActive ? 'cm-hr-active' : 'cm-hr-passive';
                        builder.add(pos, pos, Decoration.line({ class: cls }));
                    }

                    pos = lineEnd + 1; // +1 for newline
                }
            }
            return builder.finish();
        }
    }, { decorations: v => v.decorations });

    // Empty-link autofill

    const emptyLinkAutofillPlugin = ViewPlugin.fromClass(class {
        update(update) {
            if (update.docChanged) {
                const doc = update.state.doc;
                const sel = update.state.selection.main;
                if (sel.empty) {
                    const ls = doc.lineAt(sel.head).from;
                    const before = doc.sliceString(ls, sel.head);
                    // Empty link autofill: [text]() → [text](dir/text.md)
                    const emptyLink = before.match(/\[([^\]]+)\]\(\)$/);
                    if (emptyLink) {
                        const linkText = emptyLink[1];
                        let fileName = linkText.trim() + '.md';
                        const activeTab = getState('openTabs').find(t => t.id === getState('activeTabId'));
                        if (activeTab && activeTab.type === 'file' && activeTab.path) {
                            const dir = activeTab.path.substring(0, activeTab.path.lastIndexOf('/'));
                            if (dir) fileName = dir + '/' + fileName;
                        }
                        // Encode spaces so markdown parser sees a valid link
                        const encoded = fileName.replace(/ /g, '%20');
                        const replacement = `(${encoded})`;
                        queueMicrotask(() => {
                            const v = update.view;
                            if (!v.isDestroyed) v.dispatch({
                                changes: { from: sel.head - 2, to: sel.head, insert: replacement },
                                selection: { anchor: sel.head - 2 + replacement.length }
                            });
                        });
                    }
                }
            }
        }
    });

    // Helper: compute vault-relative path from target
    function makeLinkPath(targetPath) {
        // Always use vault-relative paths (absolute relative to vault root)
        return targetPath;
    }

    const imageCompletions = ctx => {
        const pos = ctx.pos, doc = ctx.state.doc;
        const line = doc.lineAt(pos), ls = line.from;
        const before = doc.sliceString(ls, pos);
        const match = before.match(/!\[([^\]]*)$/);
        if (!match) return null;
        const rawPrefix = match[1];
        const prefix = rawPrefix.toLowerCase();
        const fileTreeData = getState('fileTreeData') || [];
        const imgExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);
        const imgFiles = [];
        (function collect(items) {
            for (const item of items) {
                if (item.type === 'file') {
                    const ext = item.name.split('.').pop().toLowerCase();
                    if (imgExts.has(ext))
                        imgFiles.push({ name: item.name, path: item.path, mtime: item.mtime || 0 });
                }
                if (item.type === 'directory' && item.children) collect(item.children);
            }
        })(fileTreeData);
        if (!imgFiles.length) return null;
        // Sort by modification time, most recent first
        imgFiles.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        const rf = ls + match.index;
        const options = imgFiles
            .filter(f => f.name.toLowerCase().startsWith(prefix) || f.path.toLowerCase().includes(prefix))
            .slice(0, 10).map(f => ({
                label: f.name, detail: f.path,
                apply: (view, comp, from, to) => {
                    const linkPath = makeLinkPath(f.path);
                    const encodedPath = linkPath.replace(/ /g, '%20');
                    const rep = `![${f.name}](${encodedPath})`;
                    view.dispatch({ changes: { from, to, insert: rep }, selection: { anchor: from + rep.length } });
                }
            }));
        return { from: rf, options, filter: false };
    };

    const fileLinkCompletions = ctx => {
        const pos = ctx.pos, doc = ctx.state.doc;
        const line = doc.lineAt(pos), ls = line.from;
        const before = doc.sliceString(ls, pos);
        const match = before.match(/\[([^\]]*)$/);
        if (!match) return null;
        const rawPrefix = match[1];
        const prefix = rawPrefix.toLowerCase();
        const fileTreeData = getState('fileTreeData') || [];
        const mdFiles = [];
        (function collect(items) {
            for (const item of items) {
                if (item.type === 'file' && item.name.endsWith('.md'))
                    mdFiles.push({ name: item.name.replace('.md', ''), path: item.path, mtime: item.mtime || 0 });
                if (item.type === 'directory' && item.children) collect(item.children);
            }
        })(fileTreeData);
        if (!mdFiles.length) return null;
        // Sort by modification time, most recent first
        mdFiles.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        const rf = ls + match.index;
        const options = mdFiles
            .filter(f => f.name.toLowerCase().startsWith(prefix) || f.path.toLowerCase().startsWith(prefix))
            .slice(0, 10).map(f => ({
                label: f.name, detail: f.path,
                apply: (view, comp, from, to) => {
                    const linkPath = makeLinkPath(f.path);
                    const encodedPath = linkPath.replace(/ /g, '%20');
                    const rep = `[${f.name}](${encodedPath}) `;
                    view.dispatch({ changes: { from, to, insert: rep }, selection: { anchor: from + rep.length } });
                }
            }));
        return { from: rf, options, filter: false };
    };

    const frontmatterCompletions = createFrontmatterCompletionSource({
        getFileTree: () => getState('fileTreeData') || [],
        getActiveFilePath,
    });
    const dateShortcutCompletions = createDateShortcutCompletionSource();

    // codemirror-markdown-tables owns both the rendered table and its nested
    // cell editors. Keep document-wide undo/search bindings global while the
    // ordinary editing bindings operate inside the active cell.
    const markdownTableExtension = markdownTables({
        theme: TableTheme.dark.with({
            '--tbl-theme-row-background': 'var(--bg-color)',
            '--tbl-theme-header-row-background': 'var(--hover-bg)',
            '--tbl-theme-even-row-background': 'var(--bg-color)',
            '--tbl-theme-odd-row-background': 'var(--panel-bg)',
            '--tbl-theme-border-color': 'var(--border-color)',
            '--tbl-theme-border-hover-color': 'var(--border-light)',
            '--tbl-theme-border-active-color': 'var(--accent-color)',
            '--tbl-theme-outline-color': 'var(--focus-ring)',
            '--tbl-theme-text-color': 'var(--text-color)',
            '--tbl-theme-menu-background': 'var(--panel-bg)',
            '--tbl-theme-menu-border-color': 'var(--border-color)',
            '--tbl-theme-menu-text-color': 'var(--text-color)',
            '--tbl-theme-menu-hover-background': 'var(--active-bg)',
            '--tbl-theme-menu-hover-text-color': 'var(--text-color)',
        }),
        style: TableStyle.default.with({
            '--tbl-style-font-family': 'var(--font-editor)',
            '--tbl-style-font-size': 'inherit',
            '--tbl-style-menu-font-family': 'var(--font-sans)',
            '--tbl-style-menu-font-size': '12px',
        }),
        selectionType: 'codemirror',
        handlePosition: 'inside',
        lineWrapping: 'wrap',
        extensions: [keymap.of(defaultKeymap)],
        globalKeyBindings: [...historyKeymap, ...searchKeymap],
    });

    vimCompartment = new Compartment();
    imageBasePathCompartment = new Compartment();
    readOnlyCompartment = new Compartment();
    fileModeCompartment = new Compartment();
    foldingCompartment = new Compartment();

    const markdownExtensionsForPath = () => [
        collapseOnSelectionFacet.of(true),
        mouseSelectingField,
        webKitShiftTabPlugin,
        EditorView.lineWrapping,
        autocompletion({
            interactionDelay: 0,
            override: [
                frontmatterCompletions,
                dateShortcutCompletions,
                fileLinkCompletions,
                imageCompletions,
                markdownTableAutocompleter(),
            ],
        }),
        markdownLanguage,
        markdownStylePlugin,
        livePreviewPlugin,
        editorTheme,
        ...(Array.isArray(frontmatterField) ? frontmatterField : [frontmatterField]),
        linkPlugin(),
        linkPreview(),
        ...codeBlockField({ lineNumbers: true, skipLanguages: diagramLanguages }),
        ...(Array.isArray(diagramField) ? diagramField : [diagramField]),
        markdownTableExtension,
        mathField,
        hashtagPlugin,
        widgetPlugin,
        extrasPlugin,
        emptyLinkAutofillPlugin,
        EditorView.domEventHandlers({
            mousedown: handleMouseDown,
            click: handleClick,
            paste: (event, view) => handleClipboardImagePaste(event, view)
                || (activeFileLanguage.kind === 'markdown' && handleClipboardTablePaste(event, view)),
        }),
        Prec.high(keymap.of([
            { key: 'ArrowUp', run: view => moveCursorVerticallySafely(view, false), preventDefault: true },
            { key: 'ArrowDown', run: view => moveCursorVerticallySafely(view, true), preventDefault: true },
        ])),
        keymap.of(markdownKeymap),
    ];
    const codeExtensionsForSupport = (support) => [
        ...(support ? [support] : []),
        ...(EditorState ? [EditorState.tabSize.of(codeIndentUnit.length)] : []),
        ...(indentUnit ? [indentUnit.of(codeIndentUnit)] : []),
        ...(codeHighlighting ? [codeHighlighting] : []),
        ...(indentationMarkers ? indentationMarkers({
            // Use the same semantic colors as the active theme. The markers
            // are only enabled for conventional monospace source files—the
            // live Markdown renderer has variable-width text and widgets.
            colors: {
                light: 'var(--border-light)',
                dark: 'var(--border-light)',
                activeLight: 'var(--accent-color)',
                activeDark: 'var(--accent-color)',
            },
            highlightActiveBlock: true,
            markerType: 'codeOnly',
            thickness: 1,
            activeThickness: 1,
        }) : []),
        autocompletion(),
    ];
    markdownModeExtensions = markdownExtensionsForPath;
    codeModeExtensions = codeExtensionsForSupport;

    const editorState = EditorState.create({
        doc: '',
        extensions: [
            vimCompartment.of([]),
            readOnlyCompartment.of([]),
            imageBasePathCompartment.of(imageField({ basePath: '/vault/' })),
            fileModeCompartment.of(markdownExtensionsForPath()),
            lineNumbers(),
            highlightActiveLineGutter(),
            foldingCompartment.of([]),
            history(), bracketMatching(), drawSelection(),
            searchExtension({ top: false }),
            EditorView.updateListener.of(update => {
                if (update.docChanged) handleDocChange(update);
                if (update.selectionSet) updateCursorPosition(update);
            }),
            EditorView.theme({
                '&': { caretColor: 'var(--cursor-color) !important' },
                '.cm-content': { caretColor: 'var(--cursor-color) !important', fontFamily: 'var(--font-editor) !important' },
                '.cm-cursor': { borderLeft: 'none !important', background: 'var(--cursor-bg) !important', color: 'var(--cursor-text) !important', width: '0.65em' },
                // Override editorTheme colors from theme variables
                '.cm-header-1, .cm-header-2, .cm-header-3, .cm-header-4, .cm-header-5, .cm-header-6': {
                    color: 'var(--heading-color) !important',
                },
                '.cm-strong': { color: 'var(--bold-color) !important' },
                '.cm-emphasis': { color: 'var(--italic-color) !important' },
                '.cm-strikethrough': { color: 'var(--text-dim) !important' },
                // Horizontal rule: hide text by default, show line; active line shows text, hides line
                '.cm-hr-passive': { position: 'relative !important', color: 'transparent !important' },
                '.cm-hr-passive *': { color: 'transparent !important' },
                '.cm-hr-passive::after': { content: '"" !important', position: 'absolute !important', left: '12px !important', right: '12px !important', top: '50% !important', height: '2px !important', backgroundColor: 'var(--border-color) !important', pointerEvents: 'none !important', opacity: '1 !important' },
                '.cm-hr-active': { position: 'relative !important', color: 'inherit !important' },
                '.cm-hr-active *': { color: 'inherit !important', opacity: '1 !important' },
                '.cm-hr-active::after': { content: 'none !important' },
                // Code block syntax highlighting — themed via code-* variables (both edit + widget modes)
                '.hljs-keyword, .cm-codeblock-widget .hljs-keyword': { color: 'var(--code-keyword-color) !important' },
                '.hljs-string, .cm-codeblock-widget .hljs-string': { color: 'var(--code-string-color) !important' },
                '.hljs-number, .cm-codeblock-widget .hljs-number': { color: 'var(--code-number-color) !important' },
                '.hljs-function, .hljs-title, .cm-codeblock-widget .hljs-function, .cm-codeblock-widget .hljs-title': { color: 'var(--code-function-color) !important' },
                '.hljs-comment, .cm-codeblock-widget .hljs-comment': { color: 'var(--code-comment-color) !important', fontStyle: 'italic !important' },
                '.hljs-type, .hljs-class, .hljs-name, .cm-codeblock-widget .hljs-type, .cm-codeblock-widget .hljs-class, .cm-codeblock-widget .hljs-name': { color: 'var(--code-type-color) !important' },
                '.hljs-variable, .hljs-params, .cm-codeblock-widget .hljs-variable, .cm-codeblock-widget .hljs-params': { color: 'var(--code-variable-color) !important' },
                '.hljs-operator, .hljs-punctuation, .cm-codeblock-widget .hljs-operator, .cm-codeblock-widget .hljs-punctuation': { color: 'var(--code-operator-color) !important' },
                '.hljs-built_in, .hljs-literal, .hljs-attr, .hljs-attribute, .hljs-meta, .hljs-selector-tag, .hljs-selector-class, .hljs-selector-id, .cm-codeblock-widget .hljs-built_in, .cm-codeblock-widget .hljs-literal, .cm-codeblock-widget .hljs-attr, .cm-codeblock-widget .hljs-attribute, .cm-codeblock-widget .hljs-meta, .cm-codeblock-widget .hljs-selector-tag, .cm-codeblock-widget .hljs-selector-class, .cm-codeblock-widget .hljs-selector-id': { color: 'var(--code-builtin-color) !important' },
                // Table theming
                '.cm-table-widget th, .cm-table-widget td, .cm-table-editor th, .cm-table-editor td': { border: '1px solid var(--border-color) !important', padding: '8px 12px' },
                '.cm-table-widget th, .cm-table-editor th': { backgroundColor: 'var(--hover-bg) !important', fontWeight: '600' },
                '.cm-table-toggle': { border: '1px solid var(--border-color) !important', backgroundColor: 'var(--panel-bg) !important', color: 'var(--text-color) !important', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' },
                '.cm-table-source': { backgroundColor: 'color-mix(in srgb, var(--accent-color) 10%, transparent) !important' },
                // Code block widget styling
                '.cm-codeblock-widget': { backgroundColor: 'var(--hover-bg) !important', border: '1px solid var(--border-color) !important', borderRadius: '8px !important', padding: '12px !important', fontFamily: 'var(--font-mono) !important' },
                '.cm-codeblock-line': { paddingLeft: '4px !important', lineHeight: '1.5 !important', color: 'var(--text-color) !important' },
                '.cm-codeblock-fence': { color: 'var(--text-dim) !important' },
                '.cm-codeblock-copy': { backgroundColor: 'var(--panel-bg) !important', color: 'var(--text-muted) !important', borderRadius: '4px !important', border: '1px solid var(--border-color) !important', padding: '4px 8px !important', cursor: 'pointer !important' },
                '.cm-codeblock-copy:hover': { backgroundColor: 'var(--active-bg) !important', color: 'var(--text-color) !important' },
                '.cm-codeblock-source': { backgroundColor: 'color-mix(in srgb, var(--accent-color) 8%, transparent) !important' },
                '.cm-link, .cm-wikilink': { color: 'var(--link-color) !important' },
                '.cm-link-widget': { color: 'var(--link-color) !important', textDecoration: 'underline', cursor: 'pointer' },
                '.cm-link-widget:hover': { color: 'var(--link-hover-color) !important' },
                '.cm-wikilink-widget': { color: 'var(--link-color) !important', cursor: 'pointer' },
                '.cm-wikilink-widget:hover': { color: 'var(--link-hover-color) !important' },
                '.cm-code': { backgroundColor: 'var(--code-bg) !important', fontFamily: 'var(--font-mono) !important' },
                '.cm-quote': { position: 'relative !important', color: 'var(--quote-color) !important', paddingLeft: '16px !important', fontStyle: 'italic !important' },
                '.cm-quote::before': { content: '"" !important', position: 'absolute !important', left: '0 !important', top: '0 !important', bottom: '0 !important', width: '4px !important', backgroundColor: 'var(--quote-border) !important', pointerEvents: 'none !important' },
                '.cm-quote .cm-formatting-quote': { display: 'none !important' },
                '.cm-highlight': { backgroundColor: 'var(--highlight-bg) !important', padding: '1px 2px', borderRadius: '2px' },
                '.cm-footnote': { color: 'var(--accent-color) !important', fontSize: '0.85em', verticalAlign: 'super', cursor: 'pointer' },
                '.cm-callout': { padding: '4px 0' },
                '.cm-callout-note': { borderLeft: '3px solid var(--callout-note-color) !important', background: 'color-mix(in srgb, var(--callout-note-color) 8%, transparent) !important', paddingLeft: '12px' },
                '.cm-callout-warning': { borderLeft: '3px solid var(--callout-warning-color) !important', background: 'color-mix(in srgb, var(--callout-warning-color) 8%, transparent) !important', paddingLeft: '12px' },
                '.cm-callout-info': { borderLeft: '3px solid var(--callout-info-color) !important', background: 'color-mix(in srgb, var(--callout-info-color) 8%, transparent) !important', paddingLeft: '12px' },
                '.cm-callout-tip': { borderLeft: '3px solid var(--callout-tip-color) !important', background: 'color-mix(in srgb, var(--callout-tip-color) 8%, transparent) !important', paddingLeft: '12px' },
                '.cm-callout-danger': { borderLeft: '3px solid var(--callout-danger-color) !important', background: 'color-mix(in srgb, var(--callout-danger-color) 8%, transparent) !important', paddingLeft: '12px' },
                '.cm-callout-example': { borderLeft: '3px solid var(--callout-example-color) !important', background: 'color-mix(in srgb, var(--callout-example-color) 8%, transparent) !important', paddingLeft: '12px' },
                '.cm-formatting-block': { color: 'var(--text-dim) !important' },
                '.cm-formatting-inline': { color: 'var(--text-dim) !important' },
            }),
            EditorView.domEventHandlers({
                contextmenu: handleContextMenu
            }),
            keymap.of([
                ...searchKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap,
                { key: 'Tab', run: view => acceptCompletion(view) || indentMore(view), shift: indentLess },
            ])
        ]
    });

    editorView = new EditorView({ state: editorState, parent: container });

    // The persisted preference may load while the Home tab is active, before
    // an EditorView exists. Apply that requested state as soon as a file first
    // creates the shared editor.
    if (vimRequested) {
        toggleVim(true).catch(error => log.warn('Could not enable Vim mode:', error));
    }

    // Mouse drag tracking for live preview
    editorView.contentDOM.addEventListener('mousedown', () => {
        if (activeFileLanguage.kind !== 'markdown') return;
        editorView.dispatch({ effects: setMouseSelecting.of(true) });
    });
    document.addEventListener('mouseup', () => {
        requestAnimationFrame(() => {
            if (!editorView.isDestroyed && activeFileLanguage.kind === 'markdown') {
                editorView.dispatch({ effects: setMouseSelecting.of(false) });
            }
        });
    });

    // Block cursor
    function applyBlockCursor() {
        const c = editorView.dom.querySelector('.cm-cursor');
        if (c) {
            const styles = getComputedStyle(document.documentElement);
            const cursorBg = styles.getPropertyValue('--cursor-bg').trim() || 'white';
            const cursorText = styles.getPropertyValue('--cursor-text').trim() || '#1e1e1e';
            c.style.setProperty('border-left', 'none', 'important');
            c.style.setProperty('background', cursorBg, 'important');
            c.style.setProperty('color', cursorText, 'important');
            c.style.setProperty('width', '0.65em', 'important');
            return true;
        }
        return false;
    }
    if (!applyBlockCursor()) requestAnimationFrame(() => applyBlockCursor());
    new MutationObserver(() => applyBlockCursor()).observe(editorView.dom, { childList: true, subtree: true });

    setState('editorView', editorView);
    return editorView;
}

function getEditorView() { return editorView || getState('editorView'); }
function getEditorContent() { const v = getEditorView(); return v ? v.state.doc.toString() : ''; }

let _programmaticChange = false;
let _pendingContent = null;
function setEditorContent(content) {
    if (typeof content !== 'string') return;
    _pendingContent = content;
    const v = getEditorView();
    if (!v || v.isDestroyed) return;

    // Use setTimeout(0) to fully exit CodeMirror's current measurement cycle
    setTimeout(() => {
        if (v.isDestroyed || _pendingContent !== content) return;
        if (v.state.doc.toString() === content) return; // Already set
        try {
            _programmaticChange = true;
            v.dispatch({
                changes: { from: 0, to: v.state.doc.length, insert: content },
                scrollIntoView: false
            });
        } catch (e) {
            _programmaticChange = false;
            log.warn('Failed to set editor content:', e);
        }
    }, 0);
}

function imageFieldForPath(docPath) {
    const dir = docPath ? docPath.substring(0, docPath.lastIndexOf('/') + 1) : '';
    return imageField({ basePath: '/vault/' + dir });
}

function updateFileLanguageStatus() {
    const el = document.getElementById('file-type');
    if (!el) return;
    el.textContent = activeFileLanguage.label || 'Plain Text';
    el.style.color = '';
}

function applyFileLanguageUI(view, language) {
    const isCode = language.kind !== 'markdown';
    view.dom.classList.toggle('cm-code-file', isCode);
    view.dom.classList.toggle('cm-markdown-file', !isCode);
    view.dom.dataset.fileLanguage = language.kind;
    if (!vimActive) updateFileLanguageStatus();
}

/**
 * Reconfigure the shared editor for the active file without replacing the
 * EditorView. This preserves Vim, history, selection support, autosave, and
 * the rest of the normal file-tab lifecycle while dropping Markdown-only
 * widgets for source-code files.
 */
async function configureEditorForFile(path) {
    const view = getEditorView();
    if (!view || view.isDestroyed || !fileModeCompartment || !foldingCompartment) return false;

    const request = ++fileModeRequest;
    let language = getFileLanguage(path);
    let extensions;

    try {
        if (language.kind === 'markdown') {
            extensions = markdownModeExtensions ? markdownModeExtensions(path) : [];
        } else if (language.kind === 'code') {
            const support = await loadLanguageSupport(path);
            if (request !== fileModeRequest || view.isDestroyed) return false;
            extensions = codeModeExtensions ? codeModeExtensions(support) : [];
        } else {
            extensions = codeModeExtensions ? codeModeExtensions(null) : [];
        }
    } catch (error) {
        // A missing optional parser should never make a text file unreadable.
        // Fall back to a normal monospace editor and keep the failure visible
        // in logs for diagnostics.
        log.warn(`Unable to load ${language.label} syntax support:`, error);
        language = { kind: 'plain', label: 'Plain Text', description: null };
        extensions = codeModeExtensions ? codeModeExtensions(null) : [];
    }

    if (request !== fileModeRequest || view.isDestroyed) return false;
    const foldingExtensions = language.kind === 'code' && foldGutter && foldKeymap
        ? [foldGutter(), keymap.of(foldKeymap)]
        : [];
    view.dispatch({
        effects: [
            fileModeCompartment.reconfigure(extensions),
            foldingCompartment.reconfigure(foldingExtensions),
            imageBasePathCompartment.reconfigure(
                language.kind === 'markdown' ? imageFieldForPath(path) : []
            ),
        ],
    });
    activeFileLanguage = language;
    applyFileLanguageUI(view, language);
    return true;
}

function setImageBasePath(docPath) {
    const v = getEditorView();
    if (!v || !imageBasePathCompartment || activeFileLanguage.kind !== 'markdown') return;
    v.dispatch({
        effects: imageBasePathCompartment.reconfigure(imageFieldForPath(docPath))
    });
}


function setReadOnly(on) {
    const v = getEditorView();
    if (!v || !readOnlyCompartment) return;
    v.dispatch({
        effects: readOnlyCompartment.reconfigure(
            on ? EditorState.readOnly.of(true) : []
        )
    });
    // Also toggle contenteditable for clipboard
    if (v.contentDOM) {
        v.contentDOM.setAttribute('contenteditable', on ? 'false' : 'true');
    }
}

function focusEditor() { const v = getEditorView(); if (v) v.focus(); }

function handleDocChange(update) {
    if (_programmaticChange) { _programmaticChange = false; updateStats(update.state.doc.toString()); return; }
    const at = getState('openTabs').find(t => t.id === getState('activeTabId'));
    if (at && at.type === 'file') {
        const content = update.state.doc.toString();
        import('./tabManager.js').then(({ markTabDirty }) => markTabDirty(at.id));
        updateStats(content);
        // Consumers such as the PDF preview receive the in-memory snapshot,
        // so a live preview never waits for autosave or briefly shows stale
        // on-disk text.
        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: at.path, content }
        }));
    }
}
function updateCursorPosition(update) {
    const sel = update.state.selection.main;
    const line = update.state.doc.lineAt(sel.head).number;
    const col = sel.head - update.state.doc.lineAt(sel.head).from + 1;
    const el = document.getElementById('cursor-position');
    if (el) el.textContent = `Ln ${line}, Col ${col}`;
}
function updateStats(text) {
    const w = text.trim() ? text.trim().split(/\s+/).length : 0;
    const c = text.length;
    const rt = w > 0 ? Math.max(1, Math.ceil(w / 200)) : 0;
    const we = document.getElementById('word-count'), ce = document.getElementById('char-count');
    const re = document.getElementById('reading-time');
    if (we) we.textContent = `${w} words`;
    if (ce) ce.textContent = `${c} chars`;
    if (re) re.textContent = `${rt} min read`;
}

async function saveActiveFile() {
    const { saveActiveFile: saveActiveTabFile } = await import('./tabManager.js');
    return saveActiveTabFile();
}

/** Save the exact active editor buffer, then close only after save success. */
export async function saveAndCloseActiveFile() {
    const tabManager = await import('./tabManager.js');
    const tab = tabManager.getActiveTab();
    if (!tab || tab.type !== 'file' || !tab.path) return false;

    const content = getEditorContent();
    try {
        const result = await tabManager.saveFileSnapshot(tab, content);
        if (!result?.success) return false;

        const currentTab = (getState('openTabs') || []).find(candidate => candidate.id === tab.id);
        if (currentTab !== tab) return false;
        // A new edit may land while an asynchronous save is in flight. Never
        // close that newer buffer merely because the older snapshot saved.
        if (getState('activeTabId') === tab.id && getEditorContent() !== content) {
            tabManager.markTabDirty(tab.id);
            statusBar.set('File changed during save; tab kept open');
            return false;
        }
        return tabManager.closeTab(tab.id);
    } catch (error) {
        log.warn('Could not save and close the active file:', error);
        return false;
    }
}

/** Open the native CodeMirror find panel and focus its query field. */
export function openEditorSearch() {
    const view = getEditorView();
    if (!view || typeof openNativeSearchPanel !== 'function') return false;
    return openNativeSearchPanel(view);
}

function toggleSearchPanel() {
    const view = getEditorView();
    if (!view || typeof openNativeSearchPanel !== 'function') return false;
    return isNativeSearchPanelOpen?.(view.state)
        ? closeNativeSearchPanel(view)
        : openNativeSearchPanel(view);
}

function closeSearchPanel() {
    const view = getEditorView();
    if (!view || typeof closeNativeSearchPanel !== 'function') return false;
    return closeNativeSearchPanel(view);
}

function footnoteReturnKey(label) {
    return `${getState('activeTabId') || 'editor'}\u0000${label}`;
}

function handleFootnoteNavigation(event, view, position) {
    const text = view.state.doc.toString();
    const token = getFootnoteAtPosition(text, position);
    if (!token) return false;

    const key = footnoteReturnKey(token.label);
    const navigation = resolveFootnoteNavigation(text, position, footnoteReturnPositions.get(key));
    if (!navigation) return false;

    event.preventDefault();
    if (navigation.action === 'missing-definition') {
        statusBar.set(`Footnote definition not found: [^${navigation.label}]`);
        setTimeout(() => statusBar.clear(), 1800);
        return true;
    }
    if (navigation.action === 'missing-return') {
        statusBar.set(`No return location for footnote: [^${navigation.label}]`);
        setTimeout(() => statusBar.clear(), 1800);
        return true;
    }

    if (navigation.action === 'definition') {
        footnoteReturnPositions.set(key, navigation.returnPosition);
    }
    view.dispatch({ selection: { anchor: navigation.target }, scrollIntoView: true });
    view.focus();
    return true;
}

function handleMouseDown(event, view) {
    // Left-click = reuse current tab, Middle-click = open new tab
    if (event.button !== 0 && event.button !== 1) return;
    const replaceCurrent = event.button === 0;

    // Handle clicks on link widgets (don't move cursor, navigate directly)
    const linkEl = event.target.closest('.cm-link-widget');
    if (linkEl) {
        event.preventDefault();
        if (linkEl.classList.contains('cm-wikilink-widget')) {
            const fname = linkEl.textContent + '.md';
            handleLinkClick(fname, linkEl.textContent, replaceCurrent);
        } else {
            const href = linkEl.getAttribute('href');
            if (href) {
                if (/^https?:\/\//.test(href)) {
                    window.open(href, '_blank');
                } else {
                    handleLinkClick(decodeURI(href), linkEl.textContent, replaceCurrent);
                }
            }
        }
        return true;
    }

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;
    if (event.button === 0 && handleFootnoteNavigation(event, view, pos)) return true;
    const doc = view.state.doc, line = doc.lineAt(pos), lt = line.text, col = pos - line.from;
    const hr = /(?<!\w)(?<!#)#([a-zA-Z][a-zA-Z0-9_-]*)\b/g;
    let m;
    while ((m = hr.exec(lt)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
            event.preventDefault();
            import('./app.js').then(({ openTab }) => openTab('kanban-board', 'Kanban', 'kanban', { focusCol: m[1].toLowerCase() }));
            return true;
        }
    }
    const lr = /\[([^\]]+)\]\(([^)]*)\)/g;
    while ((m = lr.exec(lt)) !== null) {
        const linkTextStart = m.index;
        const linkTextEnd = m.index + m[1].length + 2;
        if (col >= linkTextStart && col <= linkTextEnd) {
            event.preventDefault(); handleLinkClick(m[2], m[1], replaceCurrent); return;
        }
    }
}
function handleClick(event, _view) {
    // Block browser default navigation for link widgets
    const linkEl = event.target.closest('.cm-link-widget');
    if (linkEl) {
        event.preventDefault();
    }
}

/**
 * Match native editor behavior: a context click inside an existing selection
 * should operate on that selection, while a click elsewhere moves the caret.
 */
export function shouldPreserveSelectionForContextMenu(selection, position) {
    const range = selection?.main || selection;
    const from = Number(range?.from);
    const to = Number(range?.to);
    const point = Number(position);
    return Number.isFinite(from) && Number.isFinite(to) && Number.isFinite(point) &&
        from !== to && point >= from && point <= to;
}

function selectedEditorText(view) {
    const range = view?.state?.selection?.main;
    if (!range || range.from === range.to) return '';
    if (typeof view.state.sliceDoc === 'function') return view.state.sliceDoc(range.from, range.to);
    return view.state.doc?.sliceString?.(range.from, range.to) || '';
}

function legacyCopyTextToClipboard(text) {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);

    const previouslyFocused = document.activeElement;
    textarea.focus();
    textarea.select();
    try {
        return document.execCommand('copy') === true;
    } finally {
        textarea.remove();
        previouslyFocused?.focus?.();
    }
}

/** Copy explicit editor-state text, independent of the browser DOM selection. */
export async function copyTextToClipboard(text) {
    const value = String(text || '');
    if (!value) return false;

    const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard;
    if (typeof clipboard?.writeText === 'function') {
        try {
            await clipboard.writeText(value);
            return true;
        } catch (_) {
            // Wails/webview permission policies vary. The legacy path below is
            // still invoked from the menu click, so it retains user activation.
        }
    }
    return legacyCopyTextToClipboard(value);
}

export async function copyEditorSelection(view) {
    return copyTextToClipboard(selectedEditorText(view));
}

async function cutEditorSelection(view) {
    const range = view?.state?.selection?.main;
    const text = selectedEditorText(view);
    if (!range || !text) return false;

    const { from, to } = range;
    if (!await copyTextToClipboard(text)) return false;

    view.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from },
    });
    return true;
}

async function pasteIntoEditor(view) {
    const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard;
    if (activeFileLanguage.kind === 'markdown' && typeof clipboard?.read === 'function') {
        try {
            const items = await clipboard.read();
            for (const item of items) {
                const imageType = Array.from(item?.types || []).find(type =>
                    String(type).toLowerCase().startsWith('image/')
                );
                if (!imageType) continue;
                return pasteClipboardImage(view, await item.getType(imageType));
            }

            const htmlItem = items.find(item => Array.from(item?.types || []).includes('text/html'));
            const csvItem = items.find(item => Array.from(item?.types || []).includes('text/csv'));
            const tsvItem = items.find(item => Array.from(item?.types || []).includes('text/tab-separated-values'));
            const plainItem = items.find(item => Array.from(item?.types || []).includes('text/plain'));
            const textItem = tsvItem || csvItem || plainItem;
            const mimeType = tsvItem ? 'text/tab-separated-values' : csvItem ? 'text/csv' : 'text/plain';
            const html = htmlItem ? await (await htmlItem.getType('text/html')).text() : '';
            const text = textItem ? await (await textItem.getType(mimeType)).text() : '';
            if (activeFileLanguage.kind === 'markdown'
                && pasteClipboardTable(view, { html, text, mimeType: html ? 'text/html' : mimeType })) return true;
            if (text) {
                const range = view.state.selection.main;
                view.dispatch({
                    changes: { from: range.from, to: range.to, insert: text },
                    selection: { anchor: range.from + text.length },
                    scrollIntoView: true,
                    userEvent: 'input.paste',
                });
                return true;
            }
        } catch (_) {
            // Keyboard paste events remain the most compatible image path in
            // embedded webviews; continue to text/legacy fallbacks here.
        }
    }
    if (typeof clipboard?.readText === 'function') {
        try {
            const text = await clipboard.readText();
            if (activeFileLanguage.kind === 'markdown'
                && pasteClipboardTable(view, { text, mimeType: 'text/plain' })) return true;
            const range = view.state.selection.main;
            view.dispatch({
                changes: { from: range.from, to: range.to, insert: text },
                selection: { anchor: range.from + text.length },
                scrollIntoView: true,
                userEvent: 'input.paste',
            });
            return true;
        } catch (_) {
            // Fall back for embedded runtimes that expose only the legacy API.
        }
    }

    view.focus?.();
    return typeof document !== 'undefined' && typeof document.execCommand === 'function' && document.execCommand('paste') === true;
}

function handleContextMenu(event, view) {
    event.preventDefault();
    
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null && !shouldPreserveSelectionForContextMenu(view.state.selection, pos)) {
        view.dispatch({ selection: { anchor: pos, head: pos } });
    }

    const existing = document.querySelector('.editor-context-menu');
    if (existing) existing.remove();

    const activeTab = (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId'));
    const hasSelection = Boolean(selectedEditorText(view));
    const selectionDisabledClass = hasSelection ? '' : ' disabled';
    const selectionDisabledAttribute = hasSelection ? '' : ' aria-disabled="true"';
    const convertTableAction = activeFileLanguage.kind === 'markdown' ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item${selectionDisabledClass}" data-action="convert-table"${selectionDisabledAttribute}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16M15 4v16"/></svg>
            Convert selection to table…
        </div>` : '';
    const printAction = activeTab?.path?.toLowerCase().endsWith('.md') ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="preview-pdf">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M8 15h8M8 18h6"/></svg>
            Preview PDF
        </div>` : '';

    const menu = document.createElement('div');
    menu.className = 'context-menu editor-context-menu';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    menu.innerHTML = `
        <div class="context-menu-item${selectionDisabledClass}" data-action="cut"${selectionDisabledAttribute}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/></svg>
            Cut
        </div>
        <div class="context-menu-item${selectionDisabledClass}" data-action="copy"${selectionDisabledAttribute}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
        </div>
        <div class="context-menu-item" data-action="paste">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            Paste
        </div>
        ${convertTableAction}
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="select-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
            Select All
        </div>
        ${printAction}
    `;
    document.body.appendChild(menu);

    menu.addEventListener('click', async (ev) => {
        const item = ev.target.closest('.context-menu-item');
        if (!item || item.classList.contains('disabled') || item.getAttribute('aria-disabled') === 'true') return;
        menu.remove();
        const action = item.dataset.action;
        if (action === 'cut') {
            if (!await cutEditorSelection(view)) statusBar.set('Could not copy selection to clipboard');
        } else if (action === 'copy') {
            if (!await copyEditorSelection(view)) statusBar.set('Could not copy selection to clipboard');
        } else if (action === 'paste') await pasteIntoEditor(view);
        else if (action === 'convert-table') {
            const originalDocument = view.state.doc.toString();
            const originalRange = view.state.selection.main;
            const sourceText = view.state.sliceDoc(originalRange.from, originalRange.to);
            const markdown = await tableConversionDialog(sourceText);
            if (!markdown) return;
            if (view.isDestroyed || view.state.doc.toString() !== originalDocument) {
                statusBar.set('Selection changed; table conversion cancelled');
                return;
            }
            insertMarkdownTable(view, markdown, { range: originalRange, userEvent: 'input' });
            statusBar.set('Converted selection to table');
            setTimeout(() => statusBar.set('Ready'), 1500);
        }
        else if (action === 'select-all') {
            const doc = view.state.doc;
            view.dispatch({ selection: { anchor: 0, head: doc.length } });
        } else if (action === 'preview-pdf') {
            try {
                const { openPDFPreview } = await import('./pdfPreview.js');
                await openPDFPreview({
                    path: activeTab.path,
                    title: activeTab.title,
                    content: view.state.doc.toString(),
                });
            } catch (error) {
                log.error('PDF preview failed:', error);
                await pdfExportErrorDialog(error);
            }
        }
    });

    const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

async function handleLinkClick(linkPath, linkText, replaceCurrent = false) {
    // Decode any percent-encoded characters (e.g., %20 → space) for file operations
    try { linkPath = decodeURI(linkPath); } catch (e) { /* decode may fail */ }
    try { linkPath = decodeURI(linkPath); } catch (e) { /* double-decode safety */ }

    const { openTab } = await import('./tabManager.js');

    if (!linkPath && linkText) {
        const dm = linkText.match(/^(\d{4}-\d{2}-\d{2})$/);
        if (dm) {
            const id = `calendar-${dm[1]}`;
            const tabs = getState('openTabs');
            if (replaceCurrent && !tabs.find(t => t.id === id)) {
                await replaceCurrentFileTab(id, `Mention of Date: [[${dm[1]}]]`, 'calendar', { dateStr: dm[1] });
            } else {
                openTab(id, `Mention of Date: [[${dm[1]}]]`, 'calendar', { dateStr: dm[1] });
            }
            return true;
        }
        return true;
    }
    const dm = linkPath.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (dm) {
        const id = `calendar-${dm[1]}`;
        const tabs = getState('openTabs');
        if (replaceCurrent && !tabs.find(t => t.id === id)) {
            await replaceCurrentFileTab(id, `Mention of Date: [[${dm[1]}]]`, 'calendar', { dateStr: dm[1] });
        } else {
            openTab(id, `Mention of Date: [[${dm[1]}]]`, 'calendar', { dateStr: dm[1] });
        }
        return true;
    }
    try {
        log.debug('handleLinkClick: reading', linkPath);
        const r = await window.pywebview.api.read_file(linkPath);
        log.debug('handleLinkClick: read_file result for', linkPath, ':', r ? 'found' : 'not found');
        if (r) {
            const tabs = getState('openTabs');
            if (replaceCurrent && !tabs.find(t => t.id === linkPath)) {
                await replaceCurrentFileTab(linkPath, linkPath.split('/').pop(), 'file', { path: linkPath, mtime: r.mtime });
            } else {
                openTab(linkPath, linkPath.split('/').pop(), 'file', { path: linkPath, mtime: r.mtime });
            }
        } else {
            const fileName = linkPath.split('/').pop();
            const fullPath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
            const msg = `The note “${fileName}” doesn’t exist yet.\n\nPath: ${fullPath}`;
            const sc = await window.confirmDialog('Create this note?', msg, false, false, {
                icon: 'file-add',
                confirmLabel: 'Create note',
            });
            if (sc) {
                const fpath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
                const fname = fpath.split('/').pop();
                const displayName = linkPath.endsWith('.md') ? fileName.replace('.md', '') : fileName;
                await window.pywebview.api.create_file(fpath, `# ${displayName}\n\n`);
                openTab(fpath, fname, 'file', { path: fpath, mtime: Date.now() / 1000 }, true);
                import('./fileTree.js').then(m => m.refreshFileTree());
            }
        }
    } catch (err) { log.error('Failed to open link:', err, 'path was:', linkPath); }
}

/**
 * Replace the current file tab with a new target.
 * If the active tab is a file tab, update it in-place.
 */
async function replaceCurrentFileTab(id, title, type, data) {
    const { replaceActiveFileTab } = await import('./tabManager.js');
    return replaceActiveFileTab(id, title, type, data);
}

function saveCursorState(_tabId) {
    const v = getEditorView(); if (!v) return null;
    const sel = v.state.selection.main;
    return { anchor: sel.anchor, head: sel.head };
}
function restoreCursorState(_tabId, cs) {
    const v = getEditorView(); if (!v || !cs) return;
    v.dispatch({ selection: { anchor: cs.anchor, head: cs.head }, scrollIntoView: true });
}

async function toggleVim(enable) {
    const requested = Boolean(enable);
    const requestChanged = vimRequested !== requested;
    vimRequested = requested;
    if (!vimCompartment || !editorView) {
        if (requestChanged) ++vimRequestId;
        return false;
    }
    if (vimActive === requested) {
        // A request for the opposite state can arrive while the dynamic Vim
        // module is still loading. Invalidate that pending request even though
        // the editor already happens to be in the newly requested state.
        if (requestChanged) ++vimRequestId;
        return true;
    }
    const requestId = ++vimRequestId;

    if (requested) {
        const { vim, Vim, getCM } = await import('@replit/codemirror-vim');
        if (!vimRequested || requestId !== vimRequestId || !editorView) return false;

        const view = editorView;
        view.dispatch({ effects: vimCompartment.reconfigure(vim()) });
        vimActive = true;

        // Register custom ex commands after a short delay (vim needs to init)
        setTimeout(() => {
            if (!vimActive || !vimRequested || requestId !== vimRequestId || editorView !== view) return;
            const cm = getCM(view);
            if (!cm || !Vim) return;

            // :w — save file
            Vim.defineEx('write', 'w', () => {
                saveActiveFile().catch(error => log.warn('Vim :write failed:', error));
            });

            // :e <filename> — open/create file relative to current file's directory
            Vim.defineEx('edit', 'e', (_cm, args) => {
                const fname = args?.trim();
                if (!fname) return;
                import('./app.js').then(({ getActiveTab, openTab }) => {
                    const tab = getActiveTab();
                    let dir = '';
                    if (tab && tab.type === 'file' && tab.path) {
                        const idx = tab.path.lastIndexOf('/');
                        if (idx >= 0) dir = tab.path.substring(0, idx + 1);
                    }
                    const relPath = fname.endsWith('.md') ? fname : fname + '.md';
                    const path = dir + relPath;
                    openTab(path, path.split('/').pop(), 'file', { path, isNew: true });
                });
            });

            // :q — close tab
            Vim.defineEx('quit', 'q', () => {
                import('./app.js').then(({ getActiveTab, closeTab }) => {
                    const tab = getActiveTab();
                    if (tab) closeTab(tab.id);
                });
            });

            // :wq / :x — save and close
            Vim.defineEx('wq', 'wq', () => {
                saveAndCloseActiveFile().catch(error => log.warn('Vim :wq failed:', error));
            });
            Vim.defineEx('xit', 'x', () => {
                saveAndCloseActiveFile().catch(error => log.warn('Vim :xit failed:', error));
            });
        }, 100);

        // Track vim mode for status bar
        updateVimStatus('normal');
        view.dom.classList.add('vim-normal');
        const cm = getCM(view);
        if (cm) {
            if (vimModeCM && vimModeChangeHandler) {
                vimModeCM.off('vim-mode-change', vimModeChangeHandler);
            }
            vimModeCM = cm;
            vimModeChangeHandler = (e) => {
                updateVimStatus(e.mode);
                // Add class to editor for visual mode CSS highlights
                const dom = view.dom;
                dom.classList.toggle('vim-visual', e.mode && e.mode.startsWith('visual'));
                dom.classList.toggle('vim-normal', e.mode === 'normal');
                dom.classList.toggle('vim-insert', e.mode === 'insert');
            };
            cm.on('vim-mode-change', vimModeChangeHandler);
        }
    } else {
        if (vimModeCM && vimModeChangeHandler) {
            vimModeCM.off('vim-mode-change', vimModeChangeHandler);
        }
        vimModeCM = null;
        vimModeChangeHandler = null;
        editorView.dispatch({ effects: vimCompartment.reconfigure([]) });
        vimActive = false;
        updateVimStatus(null);
        if (editorView) editorView.dom.classList.remove('vim-visual', 'vim-normal', 'vim-insert');
    }
    return true;
}

function isVimEnabled() { return vimActive; }

function updateVimStatus(mode) {
    const el = document.getElementById('file-type');
    if (!el) return;
    if (!mode) {
        updateFileLanguageStatus();
        return true;
    }
    const labels = {
        normal: 'NORMAL',
        insert: 'INSERT',
        visual: 'VISUAL',
        'visual line': 'VISUAL LINE',
        'visual block': 'VISUAL BLOCK',
        replace: 'REPLACE',
    };
    el.textContent = labels[mode] || mode.toUpperCase();
    el.style.color = 'var(--accent-color)';
}

export { initEditor, createEditorView, getEditorView,
    getEditorContent, setEditorContent, focusEditor,
    saveActiveFile, toggleSearchPanel, closeSearchPanel,
    saveCursorState, restoreCursorState, toggleVim, isVimEnabled, setImageBasePath, setReadOnly,
    configureEditorForFile, normalizeWebKitShiftTab };

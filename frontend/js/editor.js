import { backend } from './backend.js';
/**
 * CodeMirror 6 Editor Implementation
 * Uses locally vendored CodeMirror 6 modules + codemirror-live-markdown
 */

import { log } from './log.js';
import { setState, getState } from './state.js';
import { scheduleSessionSave } from './session.js';
import { statusBar } from './statusBar.js';
import { mathField } from './mathPlugin.js';
import { createDiagramField, diagramLanguages } from './liveDiagramPlugin.js';
import { getFootnoteAtPosition, resolveFootnoteNavigation } from './footnotes.js';
import { getFileLanguage, loadLanguageSupport } from './languageSupport.js';
import { createFrontmatterField } from './frontmatterPlugin.js';
import { createFrontmatterCompletionSource, getRelativePrintStylesheets } from './frontmatterCompletions.js';
import { createDateShortcutCompletionSource } from './dateShortcutCompletions.js';
import { errorDialog, pdfExportErrorDialog, tableConversionDialog } from './dialogs.js';
import { handleClipboardImagePaste, pasteClipboardImage } from './clipboardImage.js';
import { handleClipboardTablePaste, insertMarkdownTable, pasteClipboardTable } from './clipboardTable.js';
import {
    headingLinkCompletionMatch,
    markdownHeadingTargets,
    noteLinkCompletion,
    noteLinkCompletionMatch,
} from './linkCompletions.js';
import { getLinkStylePreference } from './linkStyle.js';
import { hexColorExtension, isHexColorToken } from './hexColorPlugin.js';
import { createDocumentKeyBindings, createTableCellProfile } from './codeMirrorProfiles.js';
import { createEditorDocumentSession } from './usecases/editorDocumentSession.js';
import { handleFileOpen } from './app.js';
import { refreshFileTree } from './fileTree.js';
import {
    closeTab,
    getActiveTab,
    markTabDirty,
    openTab,
    replaceActiveFileTab,
    saveActiveFile as saveActiveTabFile,
    saveFileSnapshot,
} from './tabManager.js';
import { openMarkdownPreview } from './markdownPreview.js';
import { openPDFPreview } from './pdfPreview.js';
import { markdownTableAutocompleter, markdownTables, TableStyle, TableTheme } from 'codemirror-markdown-tables';
import { indentationMarkers as indentationMarkerExtension } from '@replit/codemirror-indentation-markers';
import { getCM, vim, Vim } from '@replit/codemirror-vim';
import {
    Decoration, EditorView, ViewPlugin, WidgetType, drawSelection,
    highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view';
import {
    Compartment, EditorSelection, EditorState, Prec, RangeSetBuilder,
    StateEffect, StateField, Transaction,
} from '@codemirror/state';
import {
    cursorLineDown, cursorLineUp, defaultKeymap, history, historyKeymap,
    indentLess, indentMore, redo, undo,
} from '@codemirror/commands';
import {
    HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentUnit,
    syntaxHighlighting, syntaxTree,
} from '@codemirror/language';
import { acceptCompletion, autocompletion, completionKeymap, startCompletion } from '@codemirror/autocomplete';
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { lintKeymap, linter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { markdownLinter } from './markdownLint.js';
import { canonicalSpellcheckLanguage, createSpellcheckLinter, spellcheckSuggestionsAtPosition } from './spellcheck.js';
import {
    closeSearchPanel as closeNativeSearchPanel,
    openSearchPanel as openNativeSearchPanel,
    search as searchExtension,
    searchKeymap,
    searchPanelOpen as isNativeSearchPanelOpen,
} from '@codemirror/search';
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

// Editor instance
let editorView = null;
let vimCompartment = null;
let markdownTableCompartment = null;
let createMarkdownTableExtension = null;
let imageBasePathCompartment = null;
let readOnlyCompartment = null;
let fileModeCompartment = null;
let foldingCompartment = null;
let lineNumbersCompartment = null;
let markdownLintCompartment = null;
let spellcheckCompartment = null;
let vimActive = false;
let vimRequested = false;
let vimVisualRowsRequested = false;
let vimVisualRowsMapped = false;
let vimRevealBlocksRequested = false;
let vimAPI = null;
let vimGetCM = null;
let vimTableCellExtension = null;
const vimTablePromptText = new WeakMap();
const vimTableCellViews = new WeakMap();
let tableHistoryRedoBookmark = null;
let lineNumbersRequested = false;
let markdownLintRequested = true;
let spellcheckRequested = true;
let spellcheckLanguageRequested = 'en-US';
let vimRequestId = 0;
let vimModeCM = null;
let vimModeChangeHandler = null;
let activeFileLanguage = { kind: 'markdown', label: 'Markdown', description: null };
let fileModeRequest = 0;
let markdownModeExtensions = null;
let codeModeExtensions = null;
const footnoteReturnPositions = new Map();
const linkPreviewCache = new Map();
const linkPreviewRequests = new Map();
const linkPreviewCacheTTL = 30_000;
const editorStatsDebounceMs = 160;
let pendingContentNotification = null;
let contentNotificationFrame = null;
let pendingStatsDocument = null;
let statsTimer = null;
let lastMaterializedDocument = null;
let lastMaterializedContent = '';
let contextMenuRequestId = 0;

// CodeMirror's indentUnit is the single source of truth for both Tab / Shift+Tab
// and the indentation-marker extension. Keep the visual tab width in CSS in
// lockstep with this value (see .cm-code-file .cm-content).
const codeIndentUnit = '  ';
const vimVisualRowMappings = [
    ['j', 'gj', 'normal'],
    ['k', 'gk', 'normal'],
    ['<Down>', 'gj', 'normal'],
    ['<Up>', 'gk', 'normal'],
    ['j', 'gj', 'visual'],
    ['k', 'gk', 'visual'],
    ['<Down>', 'gj', 'visual'],
    ['<Up>', 'gk', 'visual'],
];

const vimTableNavigationKeys = {
    // Visual-mode arrow navigation never creates rows. h/l additionally stop
    // at the current row's outer cells instead of wrapping like Tab/Shift+Tab.
    h: { key: 'ArrowLeft', horizontal: -1 },
    // Enter creates a row when it leaves the last body cell. ArrowDown uses
    // the table widget's non-destructive edge behavior instead.
    j: { key: 'ArrowDown' },
    k: { key: 'ArrowUp' },
    l: { key: 'ArrowRight', horizontal: 1 },
};
const vimTablePromptKeys = new Set([':', '/', '?']);
let tableHistoryRestoreId = 0;

function vimStateFor(view) {
    return vimGetCM?.(view)?.state?.vim || null;
}

function vimModeForCM(cm) {
    const vimState = cm?.state?.vim;
    if (cm?.state?.overwrite) return 'replace';
    if (vimState?.insertMode) return 'insert';
    if (vimState?.visualMode) {
        if (vimState.visualBlock) return 'visual block';
        if (vimState.visualLine) return 'visual line';
        return 'visual';
    }
    return 'normal';
}

function vimModeFromEvent(event, cm) {
    if (event?.mode !== 'visual') return event?.mode || vimModeForCM(cm);
    if (event.subMode === 'linewise') return 'visual line';
    if (event.subMode === 'blockwise') return 'visual block';
    return 'visual';
}

function syncRootVimModeClasses(rootView, mode) {
    if (!rootView || rootView.isDestroyed) return;
    const normalizedMode = mode || 'normal';
    rootView.dom.classList.toggle('vim-visual', normalizedMode.startsWith('visual'));
    rootView.dom.classList.toggle('vim-normal', normalizedMode === 'normal');
    rootView.dom.classList.toggle('vim-insert', normalizedMode === 'insert');
}

function focusedTableCellVimMode(document) {
    const nestedEditor = document?.activeElement?.closest?.('.tbl-cell-editor .cm-editor');
    return nestedEditor?.dataset.vimMode || null;
}

function syncVimStatusForFocus(rootView = editorView) {
    if (!vimActive || !rootView || rootView.isDestroyed) return;
    queueMicrotask(() => {
        if (!vimActive || rootView.isDestroyed) return;
        const nestedMode = focusedTableCellVimMode(rootView.dom.ownerDocument);
        const rootMode = vimModeForCM(vimModeCM);
        // The table widget returns focus to the root editor without asking the
        // Vim adapter to emit another mode-change event. Reapply the root mode
        // classes during that handoff so its themed block cursor cannot fall
        // back to the adapter's red default after leaving a cell.
        if (!nestedMode) syncRootVimModeClasses(rootView, rootMode);
        updateVimStatus(nestedMode || rootMode);
    });
}

function tableCellViewForContent(content) {
    if (!content) return null;
    const nestedEditor = content.closest('.tbl-cell-editor .cm-editor');
    const isCurrentNestedView = view => view && !view.destroyed && view.dom === nestedEditor;
    const registered = vimTableCellViews.get(content);
    if (isCurrentNestedView(registered)) return registered;
    const discovered = EditorView.findFromDOM(content);
    return isCurrentNestedView(discovered) ? discovered : null;
}

function tableCellHistoryBookmark(rootView, nestedView = null) {
    const document = rootView?.dom?.ownerDocument;
    const nestedEditor = nestedView?.dom || document?.activeElement?.closest?.('.tbl-cell-editor .cm-editor');
    const cell = nestedEditor?.closest?.('.tbl-cell');
    const table = cell?.closest?.('.tbl-table-widget');
    const content = nestedEditor?.querySelector?.(':scope > .cm-scroller > .cm-content');
    const view = nestedView || tableCellViewForContent(content);
    if (!cell || !table || !view) return null;

    const tables = Array.from(rootView.dom.querySelectorAll('.tbl-table-widget'));
    const tableIndex = tables.indexOf(table);
    const row = Number.parseInt(cell.dataset.row, 10);
    const col = Number.parseInt(cell.dataset.col, 10);
    if (tableIndex < 0 || !Number.isInteger(row) || !Number.isInteger(col)) return null;
    return {
        tableIndex,
        row,
        col,
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
    };
}

function markdownTableStartLines(doc) {
    const starts = [];
    for (let number = 1; number < doc.lines; number += 1) {
        if (!vimTableCells(doc.line(number).text) || !isVimTableSeparator(doc.line(number + 1).text)) continue;
        starts.push(number);
        number += 1;
        while (number < doc.lines && vimTableCells(doc.line(number + 1).text)) number += 1;
    }
    return starts;
}

function markdownTableCellContentRange(line, col) {
    const pipes = [];
    for (let index = 0; index < line.text.length; index += 1) {
        if (line.text[index] !== '|') continue;
        let escapes = 0;
        for (let before = index - 1; before >= 0 && line.text[before] === '\\'; before -= 1) escapes += 1;
        if (escapes % 2 === 0) pipes.push(index);
    }
    if (pipes.length < col + 2) return null;
    let from = pipes[col] + 1;
    let to = pipes[col + 1];
    while (from < to && /\s/.test(line.text[from])) from += 1;
    while (to > from && /\s/.test(line.text[to - 1])) to -= 1;
    return { from: line.from + from, to: line.from + to };
}

function tableCellRootSelection(rootView, bookmark) {
    const startLine = markdownTableStartLines(rootView.state.doc)[bookmark.tableIndex];
    if (!startLine) return null;
    const lineNumber = bookmark.row === 0 ? startLine : startLine + bookmark.row + 1;
    if (lineNumber > rootView.state.doc.lines) return null;
    const range = markdownTableCellContentRange(rootView.state.doc.line(lineNumber), bookmark.col);
    if (!range) return null;
    const current = rootView.state.selection.main;
    if (current.anchor >= range.from && current.anchor <= range.to
        && current.head >= range.from && current.head <= range.to) {
        return EditorSelection.single(current.anchor, current.head);
    }
    const length = range.to - range.from;
    return EditorSelection.single(
        range.from + Math.min(bookmark.anchor, length),
        range.from + Math.min(bookmark.head, length),
    );
}

function restoreTableCellHistoryBookmark(rootView, bookmark, restoreId) {
    if (!bookmark) return;
    const window = rootView.dom.ownerDocument?.defaultView;
    let retries = 0;
    let rootSelectionRestored = false;
    const restore = () => {
        if (restoreId !== tableHistoryRestoreId || rootView.isDestroyed) return;
        if (!rootSelectionRestored) {
            const selection = tableCellRootSelection(rootView, bookmark);
            if (selection) {
                rootView.dispatch({
                    selection,
                    annotations: Transaction.addToHistory.of(false),
                });
                rootSelectionRestored = true;
            }
        }
        const table = rootView.dom.querySelectorAll('.tbl-table-widget')[bookmark.tableIndex];
        const cell = table?.querySelector(`.tbl-cell[data-row="${bookmark.row}"][data-col="${bookmark.col}"]`);
        const content = cell?.querySelector('.tbl-cell-editor .cm-content');
        const view = tableCellViewForContent(content);
        if (view?.dom?.isConnected) {
            view.focus();
            return;
        }
        if (content?.isConnected) {
            content.focus();
            return;
        }
        // Activating a collapsed cell editor can take one more paint. Retry
        // only until its nested view exists; repeated focusing after success
        // causes a table rebuild/focus loop.
        if (retries < 2) {
            retries += 1;
            window?.requestAnimationFrame(restore);
        }
    };

    // The document-history transaction rebuilds table cells on the next paint.
    // Wait for that rebuild to settle, then restore the target exactly once.
    window?.requestAnimationFrame(() => window.requestAnimationFrame(restore));
}

function runTableCellHistory(command, rootView, nestedView = null, documentChange = false) {
    const observedBookmark = tableCellHistoryBookmark(rootView, nestedView);
    const useSavedRedoPosition = command === redo
        && tableHistoryRedoBookmark?.rootView === rootView
        && tableHistoryRedoBookmark.document.eq(rootView.state.doc)
        && observedBookmark
        && tableHistoryRedoBookmark.tableIndex === observedBookmark.tableIndex
        && tableHistoryRedoBookmark.row === observedBookmark.row
        && tableHistoryRedoBookmark.col === observedBookmark.col;
    const bookmark = useSavedRedoPosition
        ? { ...observedBookmark, anchor: tableHistoryRedoBookmark.anchor, head: tableHistoryRedoBookmark.head }
        : observedBookmark;
    const startDocument = rootView.state.doc;
    let handled = false;
    // A nested Vim edit can add cell-selection events after the text change
    // (most visibly when Escape returns to Normal mode). Vim u/Ctrl+R and the
    // ordinary document history shortcuts must skip those selection-only
    // entries so one command reaches the adjacent document change.
    for (let attempts = 0; attempts < 64; attempts += 1) {
        const current = command(rootView);
        if (!current) break;
        handled = true;
        if (!documentChange || !rootView.state.doc.eq(startDocument)) break;
    }
    if (handled && command === undo && observedBookmark) {
        tableHistoryRedoBookmark = { ...observedBookmark, rootView, document: rootView.state.doc };
    } else if (command === redo) {
        tableHistoryRedoBookmark = null;
    }
    if (handled && bookmark) {
        const restoreId = ++tableHistoryRestoreId;
        restoreTableCellHistoryBookmark(rootView, bookmark, restoreId);
    }
    return handled;
}

function tableCellHistoryKeymap() {
    const wrap = command => command
        ? rootView => runTableCellHistory(command, rootView, null, command === undo || command === redo)
        : undefined;
    return historyKeymap.map(binding => ({
        ...binding,
        run: wrap(binding.run),
        shift: wrap(binding.shift),
    }));
}

function tableCellViewRegistryExtension() {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.onKeyDown = event => {
                if (event.defaultPrevented || event.altKey) return;
                const key = event.key?.toLowerCase();
                const modifier = event.ctrlKey || event.metaKey;
                const undoKey = modifier && key === 'z' && !event.shiftKey;
                const redoKey = (event.ctrlKey && key === 'y' && !event.shiftKey)
                    || (modifier && key === 'z' && event.shiftKey);
                if (!undoKey && !redoKey) return;
                stopVimTableCellEvent(event);
                const rootView = editorView;
                if (rootView && !rootView.isDestroyed) {
                    runTableCellHistory(undoKey ? undo : redo, rootView, view, true);
                }
            };
            vimTableCellViews.set(view.contentDOM, view);
            view.contentDOM.addEventListener('keydown', this.onKeyDown, true);
        }

        destroy() {
            vimTableCellViews.delete(this.view.contentDOM);
            this.view.contentDOM.removeEventListener('keydown', this.onKeyDown, true);
        }
    });
}

function dispatchVimTableHistory(event, view, vimState) {
    if (!vimState || vimState.insertMode || vimState.visualMode || event.defaultPrevented) return false;
    const key = event.key?.toLowerCase();
    const undoKey = key === 'u' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const redoKey = key === 'r' && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
    if (!undoKey && !redoKey) return false;

    stopVimTableCellEvent(event);
    const rootView = editorView;
    if (rootView && !rootView.isDestroyed) {
        runTableCellHistory(undoKey ? undo : redo, rootView, view, true);
    }
    return true;
}

function dispatchTableNavigationKey(event, view, key, shiftKey = false) {
    const KeyboardEventConstructor = view.dom.ownerDocument?.defaultView?.KeyboardEvent
        || globalThis.KeyboardEvent;
    if (typeof KeyboardEventConstructor !== 'function') return false;

    const target = event.target?.dispatchEvent ? event.target : view.contentDOM;
    return target.dispatchEvent(new KeyboardEventConstructor('keydown', {
        key,
        code: key === 'Tab' ? 'Tab' : key,
        shiftKey,
        bubbles: true,
        cancelable: true,
        composed: true,
    }));
}

function isVimTableHorizontalBoundary(event, direction) {
    if (!direction.horizontal) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const cell = target.closest('.tbl-cell');
    const table = cell?.closest('.tbl-table-widget');
    const column = Number.parseInt(cell?.dataset.col, 10);
    if (!table || !Number.isInteger(column)) return false;

    const columns = Array.from(table.querySelectorAll('.tbl-cell[data-col]'))
        .map(candidate => Number.parseInt(candidate.dataset.col, 10))
        .filter(Number.isInteger);
    if (!columns.length) return false;
    const boundary = direction.horizontal < 0 ? Math.min(...columns) : Math.max(...columns);
    return column === boundary;
}

function placeTableCellCursorAtHorizontalBoundary(view, direction) {
    if (!direction.horizontal) return;
    const anchor = direction.horizontal < 0 ? 0 : view.state.doc.length;
    if (view.state.selection.main.empty && view.state.selection.main.head === anchor) return;
    view.dispatch({ selection: { anchor } });
}

function restoreVimVisualTableCellMode(view, vimState) {
    const key = vimState.visualLine ? 'V' : 'v';
    const targetOptions = {
        key,
        code: 'KeyV',
        shiftKey: Boolean(vimState.visualLine),
        ctrlKey: Boolean(vimState.visualBlock),
        bubbles: true,
        cancelable: true,
        composed: true,
    };
    const restore = () => {
        const target = view.dom.ownerDocument.activeElement;
        if (!(target instanceof Element) || !target.closest('.tbl-cell-editor')) return;
        const nestedView = vimTableCellViews.get(target.closest('.cm-content'));
        if (vimStateFor(nestedView)?.visualMode) return;
        const KeyboardEventConstructor = target.ownerDocument.defaultView?.KeyboardEvent || globalThis.KeyboardEvent;
        if (typeof KeyboardEventConstructor === 'function') target.dispatchEvent(new KeyboardEventConstructor('keydown', targetOptions));
    };
    // Table navigation selects and focuses its destination synchronously. A
    // microtask restores Visual mode before a rapid following h/j/k/l can be
    // treated as an ordinary Normal-mode motion. The timer remains as a safe
    // fallback for webviews that defer the nested-cell focus change.
    queueMicrotask(restore);
    setTimeout(restore, 0);
}

function stopVimTableCellEvent(event) {
    event.preventDefault();
    // The nested CodeMirror handler runs before the table widget's bubbling
    // listener. WebKit can otherwise let the same physical key continue to
    // that listener after Vim has opened its prompt.
    event.stopImmediatePropagation?.();
    event.stopPropagation();
}

function queueVimTablePromptText(view, key) {
    const document = view.dom.ownerDocument;
    const pending = { key };
    vimTablePromptText.set(document, pending);
    // Chromium consumes the key at keydown. WebKit can deliver its matching
    // text event a moment later, so retain the guard for that short handoff.
    setTimeout(() => {
        if (vimTablePromptText.get(document) === pending) vimTablePromptText.delete(document);
    }, 100);
}

function vimTablePromptTextFromEvent(event) {
    if (event.type === 'textInput' || event.type === 'textinput') return event.data;
    return event.inputType === 'insertText' ? event.data : null;
}

function guardQueuedVimTablePromptText(target, view, key) {
    if (!target?.addEventListener) return;
    const document = view.dom.ownerDocument;
    const guard = event => {
        const pending = vimTablePromptText.get(document);
        if (vimTablePromptTextFromEvent(event) === key && pending?.key === key) {
            stopVimTableCellEvent(event);
            vimTablePromptText.delete(document);
        }
        removeGuard();
    };
    const removeGuard = () => {
        target.removeEventListener('beforeinput', guard, true);
        target.removeEventListener('textInput', guard, true);
        target.removeEventListener('textinput', guard, true);
    };
    // Keep this listener on the original key target. A table update can detach
    // that cell before WebKit delivers its queued text event.
    target.addEventListener('beforeinput', guard, true);
    target.addEventListener('textInput', guard, true);
    target.addEventListener('textinput', guard, true);
    setTimeout(removeGuard, 100);
}

/** Restore focus to the originating cell when a root-level Vim prompt is cancelled. */
function restoreVimTableCellFocusOnPromptCancel(rootView, cellContent) {
    const input = rootView.dom.querySelector('.cm-vim-panel input');
    if (!input || !cellContent?.closest?.('.tbl-cell-editor')) return;

    const onKeyDown = event => {
        const key = event.key?.toLowerCase();
        const cancelled = key === 'escape'
            || (event.ctrlKey && (key === 'c' || key === '['))
            || (key === 'backspace' && input.value === '');
        if (!cancelled) return;
        input.removeEventListener('keydown', onKeyDown, true);
        // codemirror-vim focuses its own editor while closing the dialog.
        // Run after that handoff so cancelling returns to the same table cell.
        setTimeout(() => {
            if (!rootView.isDestroyed && cellContent.isConnected) cellContent.focus();
        }, 0);
    };
    input.addEventListener('keydown', onKeyDown, true);
}

/**
 * Table-cell editors use a table-owned keydown observer in addition to their
 * Vim extension. Normal- and Visual-mode prompts belong to the root Vim
 * instance: this keeps the panel at the bottom of the document and lets / and
 * ? search the complete note instead of only the embedded cell's short document.
 */
function dispatchVimTablePrompt(event, view, vimState, key = event.key, queueText = true) {
    if (!vimState || vimState.insertMode || !vimTablePromptKeys.has(key)) return false;
    const rootView = editorView;
    const rootCM = rootView && !rootView.isDestroyed ? vimGetCM?.(rootView) : null;
    if (!rootCM || typeof vimAPI?.handleKey !== 'function') return false;
    stopVimTableCellEvent(event);
    if (queueText) {
        queueVimTablePromptText(view, key);
        guardQueuedVimTablePromptText(event.target, view, key);
    }
    vimAPI.handleKey(rootCM, key, 'user');
    restoreVimTableCellFocusOnPromptCancel(rootView, event.target);
    return true;
}

/** Cancel a delayed native text event after Vim has claimed a prompt key. */
function preventVimTablePromptText(event, view) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.tbl-table-widget') || target.closest('.cm-vim-panel')) return false;
    const document = view.dom.ownerDocument;
    const pending = vimTablePromptText.get(document);
    if (pending?.key !== vimTablePromptTextFromEvent(event)) return false;
    stopVimTableCellEvent(event);
    vimTablePromptText.delete(document);
    return true;
}

/**
 * WebKit may report a physical punctuation key as `Unidentified` and provide
 * the actual `:`, `/`, or `?` through beforeinput or its older textInput event.
 * Claim the character before the nested cell's CodeMirror input handler turns
 * it into a cell-local Vim prompt in either Normal or Visual mode.
 */
function routeVimTablePromptText(event) {
    const text = vimTablePromptTextFromEvent(event);
    if (!vimTablePromptKeys.has(text)) return false;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.cm-vim-panel')) return false;
    const cellContent = target.closest('.cm-content');
    const cellView = cellContent ? vimTableCellViews.get(cellContent) : null;
    const vimState = cellView ? vimStateFor(cellView) : null;
    return Boolean(cellView && dispatchVimTablePrompt(event, cellView, vimState, text, false));
}

/**
 * Claim Normal- and Visual-mode prompt keys in the capture phase, before
 * CodeMirror's Vim and the table widget attach their bubbling key handlers.
 * This also records the one queued text event that WebKit may emit after the
 * cell has been rebuilt.
 */
function vimTableCellPromptCaptureExtension() {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.onKeyDown = event => {
                const vimState = vimStateFor(view);
                if (!vimState || vimState.insertMode) return;
                if (dispatchVimTableHistory(event, view, vimState)) return;
                if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
                dispatchVimTablePrompt(event, view, vimState);
            };
            this.onPromptText = event => {
                if (event.defaultPrevented) return;
                const text = vimTablePromptTextFromEvent(event);
                const vimState = vimStateFor(view);
                if (!vimTablePromptKeys.has(text) || !vimState || vimState.insertMode) return;
                dispatchVimTablePrompt(event, view, vimState, text, false);
            };
            view.contentDOM.addEventListener('keydown', this.onKeyDown, true);
            // WebKitGTK can use its legacy textInput event after an
            // Unidentified keydown. CodeMirror's Vim plugin waits for text in
            // that case, so claim the character before it reaches the cell.
            view.contentDOM.addEventListener('beforeinput', this.onPromptText, true);
            view.contentDOM.addEventListener('textInput', this.onPromptText, true);
            view.contentDOM.addEventListener('textinput', this.onPromptText, true);
        }

        destroy() {
            this.view.contentDOM.removeEventListener('keydown', this.onKeyDown, true);
            this.view.contentDOM.removeEventListener('beforeinput', this.onPromptText, true);
            this.view.contentDOM.removeEventListener('textInput', this.onPromptText, true);
            this.view.contentDOM.removeEventListener('textinput', this.onPromptText, true);
        }
    });
}

/**
 * Some WebKit table-widget events are filtered before a nested CodeMirror
 * view sees them. Capture them from the persistent root document instead so a
 * queued prompt character cannot reach a newly rebuilt table cell.
 */
function vimTableCellPromptInputGuardExtension() {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.onBeforeInput = event => {
                if (preventVimTablePromptText(event, view)) return;
                routeVimTablePromptText(event);
            };
            view.dom.ownerDocument.addEventListener('beforeinput', this.onBeforeInput, true);
            view.dom.ownerDocument.addEventListener('textInput', this.onBeforeInput, true);
            view.dom.ownerDocument.addEventListener('textinput', this.onBeforeInput, true);
        }

        destroy() {
            this.view.dom.ownerDocument.removeEventListener('beforeinput', this.onBeforeInput, true);
            this.view.dom.ownerDocument.removeEventListener('textInput', this.onBeforeInput, true);
            this.view.dom.ownerDocument.removeEventListener('textinput', this.onBeforeInput, true);
        }
    });
}

/**
 * Table cells are nested CodeMirror editors. Normal-mode h/l remain Vim's
 * character motions; Visual mode uses spreadsheet-style cell movement, while
 * j/k move between rows in either non-Insert mode.
 */
function vimTableCellNavigationExtension() {
    return Prec.highest(EditorView.domEventHandlers({
        keydown: (event, view) => {
            if (event.defaultPrevented) return false;
            const vimState = vimStateFor(view);
            if (!vimState || vimState.insertMode) return false;

            if (dispatchVimTableHistory(event, view, vimState)) return true;
            if (event.altKey || event.ctrlKey || event.metaKey) return false;
            if (dispatchVimTablePrompt(event, view, vimState)) return true;

            const direction = vimTableNavigationKeys[event.key];
            if (!direction) return false;
            // Normal-mode h/l must retain Vim's ordinary character movement.
            // In particular, Vim itself keeps them at the beginning or end of
            // the cell instead of traversing to another table cell.
            if (direction.horizontal && !vimState.visualMode) return false;
            const preserveVisualMode = vimState.visualMode;

            // Do not steal an operator-pending motion such as d{motion}; it
            // must remain a normal Vim edit rather than a table transition.
            const bufferedKeys = vimState.inputState?.keyBuffer?.join('') || '';
            if (vimState.inputState?.operatorShortcut || (bufferedKeys && !/^\d+$/.test(bufferedKeys))) return false;
            if (vimState.inputState?.keyBuffer) vimState.inputState.keyBuffer.length = 0;

            event.preventDefault();
            event.stopPropagation();
            if (isVimTableHorizontalBoundary(event, direction)) return true;
            placeTableCellCursorAtHorizontalBoundary(view, direction);
            dispatchTableNavigationKey(event, view, direction.key, Boolean(direction.shiftKey));
            if (preserveVisualMode) restoreVimVisualTableCellMode(view, vimState);
            return true;
        },
    }));
}

/** Surface an embedded cell's modal state without changing its table selection. */
function vimTableCellModeExtension() {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.cm = vimGetCM?.(view) || null;
            this.onModeChange = event => {
                this.mode = vimModeFromEvent(event, this.cm);
                view.dom.dataset.vimMode = this.mode;
                if (view.hasFocus) updateVimStatus(this.mode);
            };
            this.onFocusIn = () => updateVimStatus(this.mode);
            this.onFocusOut = () => syncVimStatusForFocus();
            this.mode = vimModeForCM(this.cm);
            view.dom.dataset.vimMode = this.mode;
            this.cm?.on('vim-mode-change', this.onModeChange);
            view.dom.addEventListener('focusin', this.onFocusIn);
            view.dom.addEventListener('focusout', this.onFocusOut);
        }

        destroy() {
            this.cm?.off('vim-mode-change', this.onModeChange);
            this.view.dom.removeEventListener('focusin', this.onFocusIn);
            this.view.dom.removeEventListener('focusout', this.onFocusOut);
            delete this.view.dom.dataset.vimMode;
        }
    });
}

function vimFrontmatterRange(doc) {
    if (doc.lines < 2 || !/^---\s*$/.test(doc.line(1).text)) return null;
    for (let number = 2; number <= doc.lines; number += 1) {
        const line = doc.line(number);
        if (/^(?:---|\.\.\.)\s*$/.test(line.text)) return { from: 0, to: line.to, kind: 'source' };
    }
    return null;
}

function vimTableCells(line) {
    const text = line.trim();
    if (!text.startsWith('|') || !text.endsWith('|')) return null;
    return text.slice(1, -1).split('|').map(cell => cell.trim());
}

function isVimTableSeparator(line) {
    const cells = vimTableCells(line);
    return Boolean(cells?.length) && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

/** Return rendered block source ranges that Vim's vertical motions can enter. */
export function vimRenderedBlockRanges(state) {
    const ranges = [];
    const frontmatter = vimFrontmatterRange(state.doc);
    if (frontmatter) ranges.push(frontmatter);

    syntaxTree(state).iterate({
        enter: node => {
            if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
                ranges.push({ from: node.from, to: node.to, kind: 'source' });
            }
        },
    });

    for (let number = 1; number < state.doc.lines; number += 1) {
        const header = vimTableCells(state.doc.line(number).text);
        if (!header?.length || !isVimTableSeparator(state.doc.line(number + 1).text)) continue;
        let end = number + 1;
        while (end < state.doc.lines && vimTableCells(state.doc.line(end + 1).text)) end += 1;
        ranges.push({
            from: state.doc.line(number).from,
            to: state.doc.line(end).to,
            kind: 'table',
        });
        number = end;
    }

    return ranges.sort((left, right) => left.from - right.from || right.to - left.to);
}

function adjacentVimRenderedBlock(view, forward) {
    const selection = view.state.selection.main;
    const currentLine = view.state.doc.lineAt(selection.head).number;
    return vimRenderedBlockRanges(view.state).find(range => {
        const fromLine = view.state.doc.lineAt(range.from).number;
        const toLine = view.state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
        return forward ? fromLine === currentLine + 1 : toLine === currentLine - 1;
    }) || null;
}

/**
 * Let optional Vim j/k entry reveal a replacement block's portable source.
 * Tables are deliberately special: their own selection filter turns the
 * boundary into the first or last interactive cell instead of raw pipes.
 */
function enterAdjacentRenderedBlock(view, forward) {
    const block = adjacentVimRenderedBlock(view, forward);
    if (!block) return false;
    const target = block.kind === 'table'
        ? (forward ? block.from : block.to)
        : (forward ? Math.min(block.from + 1, block.to) : Math.max(block.from, block.to - 1));
    view.dispatch({
        selection: EditorSelection.cursor(target),
        scrollIntoView: true,
        userEvent: 'select',
    });
    return true;
}

function vimRenderedBlockNavigationExtension() {
    return Prec.highest(EditorView.domEventHandlers({
        keydown: (event, view) => {
            if (!vimActive || !vimRevealBlocksRequested || event.altKey || event.ctrlKey || event.metaKey
                || event.defaultPrevented || (event.key !== 'j' && event.key !== 'k')) return false;
            const vimState = vimStateFor(view);
            if (!vimState || vimState.insertMode || vimState.inputState?.operatorShortcut
                || (vimState.inputState?.keyBuffer?.length || 0) > 0) return false;
            if (!enterAdjacentRenderedBlock(view, event.key === 'j')) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
        },
    }));
}

const isWindowsPlatform = () => typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '');
const pendingWindowsSpanishDeadKeys = new WeakMap();
const windowsSpanishDeadKeyDefinitions = [
    {
        matches: event => hasAltGraphModifier(event) && isDigit4Key(event),
        spacing: '~',
        combining: '\u0303',
        composable: 'AaEeIiNnOoUuYy',
    },
    {
        matches: event => event.code === 'BracketLeft' && !hasAltGraphModifier(event),
        spacing: event => event.shiftKey ? '^' : '`',
        combining: event => event.shiftKey ? '\u0302' : '\u0300',
        composable: 'AaEeIiOoUuYy',
    },
    {
        matches: event => event.code === 'Semicolon' && !hasAltGraphModifier(event),
        spacing: event => event.shiftKey ? '¨' : '´',
        combining: event => event.shiftKey ? '\u0308' : '\u0301',
        composable: 'AaEeIiOoUuYy',
    },
];

function hasAltGraphModifier(event) {
    return event.getModifierState?.('AltGraph') === true || (event.ctrlKey && event.altKey);
}

function isDigit4Key(event) {
    return event.code === 'Digit4' || event.keyCode === 52 || event.which === 52;
}

function isModifierOnlyKey(event) {
    return ['Alt', 'AltGraph', 'Control', 'Meta', 'Shift'].includes(event?.key);
}

function getWindowsSpanishDeadKey(event) {
    if (event?.key !== 'Dead') return null;
    const definition = windowsSpanishDeadKeyDefinitions.find(candidate => candidate.matches(event));
    if (!definition) return null;
    return {
        spacing: typeof definition.spacing === 'function' ? definition.spacing(event) : definition.spacing,
        combining: typeof definition.combining === 'function' ? definition.combining(event) : definition.combining,
        composable: definition.composable,
    };
}

function resolveWindowsSpanishDeadKey(deadKey, key) {
    if (key === ' ') return deadKey.spacing;
    if (typeof key !== 'string' || key.length !== 1) return null;
    if (deadKey.composable.includes(key)) return `${key}${deadKey.combining}`.normalize('NFC');
    // A dead key followed by an unsupported printable character conventionally
    // emits the spacing accent before that character rather than losing either.
    return `${deadKey.spacing}${key}`;
}

export function insertTextAtCursor(view, text) {
    if (!view?.state?.selection) return false;
    const selection = view.state.selection.main;
    if (!selection || !text) return false;
    view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length },
        userEvent: 'input.type',
    });
    return true;
}

function handleWindowsSpanishDeadKey(event, view) {
    if (!isWindowsPlatform() || !event || !view) return false;

    // WebView2 can expose Spanish dead keys without delivering a usable
    // composition event. Preserve just the layout's known dead-key events so
    // the following key resolves the accent instead of inserting it early.
    const deadKey = getWindowsSpanishDeadKey(event);
    if (deadKey) {
        pendingWindowsSpanishDeadKeys.set(view, deadKey);
        event.preventDefault();
        return true;
    }

    const pendingDeadKey = pendingWindowsSpanishDeadKeys.get(view);
    if (!pendingDeadKey) return false;
    if (isModifierOnlyKey(event)) return false;

    pendingWindowsSpanishDeadKeys.delete(view);

    // Backspace and Escape cancel a native dead key. They must not edit the
    // document while clearing this compatibility state.
    if (event.key === 'Backspace' || event.key === 'Escape') {
        event.preventDefault();
        return true;
    }

    const text = resolveWindowsSpanishDeadKey(pendingDeadKey, event.key);
    if (text && insertTextAtCursor(view, text)) {
        event.preventDefault();
        return true;
    }
    return false;
}

// Native desktop drops are imported through the Wails file-drop callback. Do
// not let CodeMirror's browser fallback insert an opaque filesystem path into
// the note while that native import confirmation is being shown.
export function handleExternalFileDrop(event) {
    const types = Array.from(event?.dataTransfer?.types || []);
    const hasFiles = types.includes('Files')
        || types.includes('text/uri-list')
        || Number(event?.dataTransfer?.files?.length) > 0;
    if (!hasFiles) return false;
    event.preventDefault();
    return true;
}

export function isBlockquoteLine(line) {
    return /^ {0,3}>\s?/.test(line);
}

export function selectionLineSignature(doc, selection) {
    return (selection?.ranges || []).map(range => {
        const first = doc.lineAt(range.from).number;
        const last = doc.lineAt(range.to).number;
        return first + ':' + last;
    }).join('|');
}

// Link hover can fire repeatedly while the pointer crosses a rendered link's
// child nodes. Keep the preview informative without reopening the same note on
// every mouse event; a short TTL avoids presenting a long-lived stale preview.
export function fetchLinkPreviewFile(path) {
    const key = String(path || '');
    const cached = linkPreviewCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    if (linkPreviewRequests.has(key)) return linkPreviewRequests.get(key);

    const request = Promise.resolve(backend().ReadFile(key)).then(value => {
        linkPreviewCache.set(key, { value, expiresAt: Date.now() + linkPreviewCacheTTL });
        return value;
    }).finally(() => linkPreviewRequests.delete(key));
    linkPreviewRequests.set(key, request);
    return request;
}

export function invalidateLinkPreviewCache(path = null) {
    if (path === null) {
        linkPreviewCache.clear();
        return;
    }
    linkPreviewCache.delete(String(path));
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

/**
 * Return CSS custom properties for a wrapped Markdown list item. The first
 * display row stays at the source margin, while subsequent visual rows start
 * where the item body begins. A source-column fallback keeps non-layout
 * environments deterministic; a live editor measures the current raw or
 * rendered marker so the decoration never changes the document.
 */
export function markdownListHangingIndentAttributes(lineText, metrics = null) {
    const match = String(lineText ?? '').match(/^([ \t]*)(?:[-*+]|\d+[.)])([ \t]+)/);
    if (!match) return null;

    // A Markdown tab conventionally advances to the next four-column stop.
    // Keep the same calculation for the CSS ch unit used by this editor.
    let columns = 0;
    for (const character of match[1]) {
        columns = character === '\t' ? columns + (4 - (columns % 4)) : columns + 1;
    }
    columns += match[0].length - match[1].length;
    let indent = `${columns}ch`;
    if (metrics?.view && metrics.markerText) {
        const computed = getComputedStyle(metrics.view.contentDOM);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext?.('2d');
        if (context) {
            const family = computed.fontFamily || 'sans-serif';
            const size = computed.fontSize || '16px';
            const style = computed.fontStyle || 'normal';
            const sourceFont = `${style} ${computed.fontWeight || '400'} ${size} ${family}`;
            const markerFont = `${style} ${metrics.markerWeight || computed.fontWeight || '400'} ${size} ${family}`;
            const expandedLeadingWhitespace = match[1].replace(/\t/g, '    ');
            context.font = sourceFont;
            const leadingWidth = context.measureText(
                expandedLeadingWhitespace + (metrics.trailingSourceWhitespace || '')
            ).width;
            context.font = markerFont;
            const markerWidth = context.measureText(metrics.markerText).width + (metrics.markerMargin || 0);
            indent = `${leadingWidth + markerWidth}px`;
        }
    }
    return {
        class: 'cm-markdown-list-item',
        style: `--cm-list-hanging-indent: ${indent}; --cm-list-hanging-outdent: -${indent};`,
    };
}

/**
 * Keep wrapped blockquote rows aligned with the first body character. The
 * source marker is visible only on the active line, while its separator
 * whitespace remains visible in passive live preview, so each state needs its
 * own non-destructive hanging indent.
 */
export function markdownBlockquoteHangingIndentAttributes(
    lineText,
    { view = null, markerVisible = false } = {}
) {
    const match = String(lineText ?? '').match(/^([ \t]{0,3})((?:>[ \t]?)+)/);
    if (!match) return null;

    const visibleMarkerPrefix = markerVisible ? match[2] : match[2].replace(/>/g, '');
    const visiblePrefix = match[1] + visibleMarkerPrefix;
    let columns = 0;
    let expandedPrefix = '';
    for (const character of visiblePrefix) {
        if (character === '\t') {
            const spaces = 4 - (columns % 4);
            expandedPrefix += ' '.repeat(spaces);
            columns += spaces;
        } else {
            expandedPrefix += character;
            columns += 1;
        }
    }

    let indent = `${columns}ch`;
    if (view && expandedPrefix) {
        const computed = getComputedStyle(view.contentDOM);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext?.('2d');
        if (context) {
            const family = computed.fontFamily || 'sans-serif';
            const size = computed.fontSize || '16px';
            const style = computed.fontStyle || 'normal';
            context.font = `${style} ${computed.fontWeight || '400'} ${size} ${family}`;
            indent = `${context.measureText(expandedPrefix).width}px`;
        }
    }

    return {
        class: 'cm-blockquote-line',
        style: `--cm-blockquote-hanging-indent: ${indent}; --cm-blockquote-hanging-outdent: -${indent};`,
    };
}

const codeHighlighting = syntaxHighlighting(HighlightStyle.define([
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

async function initEditor() {
    // CodeMirror dependencies are statically initialized with this module.
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

            const tree = syntaxTree(this.view.state);
            let node = tree.resolveInner(pos, -1);

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
                        const wikiName = normalizeWikiLinkTarget(m[1]);
                        this.showTooltip(event, wikiName, false);
                        return;
                    }
                }
                return;
            }

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
                return;
            }

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
                const resolvedUrl = resolveRelativeUrl(displayUrl);
                fetchLinkPreviewFile(resolvedUrl).then(r => {
                    if (!dom.isConnected) return;
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
                    if (!dom.isConnected) return;
                    log.debug('[linkPreview] fetchContent failed:', err);
                    statusEl.className = 'lh-status lh-missing';
                    statusEl.textContent = '✗ Not found';
                });
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

function destroyEditorView() {
    if (!editorView) return;
    try {
        editorView.destroy();
    } catch (_) { /* best effort */ }
    editorView = null;
}

function createEditorView() {
    const container = document.getElementById('editor-container');
    if (editorView) {
        if (!editorView.isDestroyed && container && container.contains(editorView.dom)) {
            return editorView;
        }
        destroyEditorView();
    }
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

    // A table cell has its own CodeMirror editor, but the outer editor keeps
    // an equivalent source selection. Only the nested editor may draw a
    // caret while that cell owns focus, otherwise the outer cursor paints as
    // a full-cell rectangle at the start of the active cell.
    const tableCellFocusPlugin = ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.sync = () => {
                queueMicrotask(() => {
                    if (view.isDestroyed) return;
                    const active = view.dom.ownerDocument?.activeElement;
                    view.dom.classList.toggle('cm-table-cell-focused', Boolean(active?.closest?.('.tbl-cell-editor')));
                    syncVimStatusForFocus(view);
                });
            };
            view.dom.addEventListener('focusin', this.sync);
            view.dom.addEventListener('focusout', this.sync);
            this.sync();
        }

        destroy() {
            this.view.dom.removeEventListener('focusin', this.sync);
            this.view.dom.removeEventListener('focusout', this.sync);
            this.view.dom.classList.remove('cm-table-cell-focused');
        }
    });

    const getActiveFilePath = () => {
        const activeTab = (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId'));
        return activeTab?.type === 'file' ? activeTab.path : '';
    };
    const getDefaultAuthor = () => {
        const app = backend();
        return typeof app.GetOSUsername === 'function' ? app.GetOSUsername() : '';
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
                            await refreshFileTree();
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
                    // Valid CSS hex colors own ambiguous tokens such as #bad.
                    if (isHexColorToken(m[0])) continue;
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
            if (update.docChanged || update.viewportChanged)
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
        constructor(view) {
            this.activeLineSignature = selectionLineSignature(view.state.doc, view.state.selection);
            this.decorations = this.build(view);
        }
        update(update) {
            const nextSignature = selectionLineSignature(update.state.doc, update.state.selection);
            if (update.docChanged || update.viewportChanged
                || (update.selectionSet && nextSignature !== this.activeLineSignature)) {
                this.decorations = this.build(update.view);
                this.activeLineSignature = nextSignature;
            }
        }
        build(view) {
            const decos = [];
            const activeLines = new Set();
            const seenNodes = new Set();
            for (const r of view.state.selection.ranges) {
                const sl = view.state.doc.lineAt(r.from).number;
                const el = view.state.doc.lineAt(r.to).number;
                for (let l = sl; l <= el; l++) activeLines.add(l);
            }
            // Interactive list decorations only matter while they are in the
            // viewport. Rebuild them on viewport changes instead of walking
            // every syntax node in a large note after each keystroke.
            for (const { from, to } of view.visibleRanges) {
                syntaxTree(view.state).iterate({
                    from,
                    to,
                    enter: (ref) => {
                        const nodeKey = ref.type.id + ':' + ref.from + ':' + ref.to;
                        if (seenNodes.has(nodeKey)) return;
                        seenNodes.add(nodeKey);
                        const text = view.state.doc.sliceString(ref.from, ref.to);
                        const lineNum = view.state.doc.lineAt(ref.from).number;
                        const isActive = activeLines.has(lineNum);
                        if (ref.type.name === 'ListMark') {
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
                                const line = view.state.doc.lineAt(ref.from);
                                const sourceMarker = line.text.match(/^([ \t]*)(?:[-*+]|\d+[.)])([ \t]+)/);
                                const attributes = markdownListHangingIndentAttributes(line.text, {
                                    view,
                                    markerText: isActive
                                        ? sourceMarker?.[0].slice(sourceMarker[1].length)
                                        : widgetChar,
                                    markerWeight: isActive ? null : '700',
                                    // The raw ListMark's visible source span
                                    // carries CodeMirror's inline cursor buffer;
                                    // include its measured three-pixel tail so
                                    // an active line and its continuation meet.
                                    markerMargin: isActive ? 3 : 2,
                                    // Lezer's ListMark ends before this
                                    // separator, so it remains in the DOM
                                    // beside the replacement widget.
                                    trailingSourceWhitespace: isActive ? '' : sourceMarker?.[2] || '',
                                });
                                if (attributes) {
                                    decos.push(Decoration.line({ attributes }).range(line.from));
                                }
                                if (!isActive) {
                                    decos.push(Decoration.replace({
                                        widget: bulletW(widgetChar)
                                    }).range(start, end));
                                }
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
            }
            return Decoration.set(decos.sort((a, b) => a.from - b.from), true);
        }
    }, { decorations: v => v.decorations });

    // Extras plugin: highlight, callouts, footnotes, horizontal rules
    const extrasPlugin = ViewPlugin.fromClass(class {
        constructor(view) {
            this.activeLineSignature = selectionLineSignature(view.state.doc, view.state.selection);
            this.decorations = this.build(view);
        }
        update(update) {
            const nextSignature = selectionLineSignature(update.state.doc, update.state.selection);
            if (update.docChanged || update.viewportChanged
                || (update.selectionSet && nextSignature !== this.activeLineSignature)) {
                this.decorations = this.build(update.view);
                this.activeLineSignature = nextSignature;
            }
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
                        const attributes = markdownBlockquoteHangingIndentAttributes(line, {
                            view,
                            markerVisible: isActive,
                        });
                        builder.add(pos, pos, Decoration.line({ attributes }));
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
        const match = noteLinkCompletionMatch(before);
        if (!match) return null;
        const rawPrefix = match.prefix;
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
        const rf = ls + match.fromOffset;
        const options = mdFiles
            .filter(f => f.name.toLowerCase().startsWith(prefix) || f.path.toLowerCase().startsWith(prefix))
            .slice(0, 10).map(f => ({
                label: f.name, detail: f.path,
                apply: (view, comp, from, to) => {
                    const rep = noteLinkCompletion(getLinkStylePreference(), f);
                    view.dispatch({ changes: { from, to, insert: rep }, selection: { anchor: from + rep.length } });
                }
            }));
        return { from: rf, options, filter: false };
    };

    const headingLinkCompletions = ctx => {
        const pos = ctx.pos, doc = ctx.state.doc;
        const line = doc.lineAt(pos), ls = line.from;
        const before = doc.sliceString(ls, pos);
        const match = headingLinkCompletionMatch(before);
        if (!match) return null;
        const prefix = match.prefix.toLowerCase();
        const from = ls + match.fromOffset;
        const targets = markdownHeadingTargets(doc.toString())
            .filter(target => target.slug.startsWith(prefix) || target.label.toLowerCase().includes(prefix))
            .slice(0, 20);
        if (!targets.length) return null;

        return {
            from,
            filter: false,
            options: targets.map(target => ({
                label: target.label,
                detail: `#${target.slug}`,
                apply: (view, _completion, applyFrom, applyTo) => {
                    const hasClosingParenthesis = view.state.doc.sliceString(applyTo, applyTo + 1) === ')';
                    const insert = `#${target.slug}${hasClosingParenthesis ? '' : ')'}`;
                    view.dispatch({
                        changes: { from: applyFrom, to: applyTo, insert },
                        selection: { anchor: applyFrom + insert.length },
                    });
                },
            })),
        };
    };

    // CodeMirror normally activates completions after word characters. A
    // fragment target starts with `#`, so explicitly start the same normal
    // completion flow when typing inside `[label](#fragment)`.
    const headingLinkCompletionActivator = ViewPlugin.fromClass(class {
        update(update) {
            if (!update.docChanged || !update.state.selection.main.empty) return;
            const typed = update.transactions.some(transaction => transaction.isUserEvent?.('input.type'));
            if (!typed) return;
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            if (!headingLinkCompletionMatch(update.state.doc.sliceString(line.from, head))) return;
            queueMicrotask(() => {
                if (!update.view.isDestroyed) startCompletion(update.view);
            });
        }
    });

    const frontmatterCompletions = createFrontmatterCompletionSource({
        getFileTree: () => getState('fileTreeData') || [],
        getActiveFilePath,
    });
    const dateShortcutCompletions = createDateShortcutCompletionSource();

    // codemirror-markdown-tables owns both the rendered table and its nested
    // cell editors. Keep document-wide undo/search bindings global while the
    // ordinary editing bindings operate inside the active cell.
    // Table cells are independent, embedded CodeMirror editors. They do not
    // inherit root-editor extensions, so refresh this compartment when Vim
    // changes and give cells the same modal commands as the surrounding note.
    createMarkdownTableExtension = () => {
        const cellProfile = createTableCellProfile({
            viewRegistryExtension: tableCellViewRegistryExtension(),
            keymapExtension: bindings => keymap.of(bindings),
            defaultBindings: defaultKeymap,
            vimExtension: vimTableCellExtension,
            historyBindings: tableCellHistoryKeymap(),
            searchBindings: searchKeymap,
	        });
	        return markdownTables({
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
            extensions: cellProfile.extensions,
            globalKeyBindings: cellProfile.globalKeyBindings,
        });
    };

    vimCompartment = new Compartment();
    markdownTableCompartment = new Compartment();
    imageBasePathCompartment = new Compartment();
    readOnlyCompartment = new Compartment();
    fileModeCompartment = new Compartment();
    foldingCompartment = new Compartment();
    lineNumbersCompartment = new Compartment();
    markdownLintCompartment = new Compartment();
    spellcheckCompartment = new Compartment();

    const markdownExtensionsForPath = () => [
        collapseOnSelectionFacet.of(true),
        mouseSelectingField,
        webKitShiftTabPlugin,
        tableCellFocusPlugin,
        vimTableCellPromptInputGuardExtension(),
        vimRenderedBlockNavigationExtension(),
        EditorView.lineWrapping,
        markdownLintCompartment.of(markdownLintRequested ? [linter(markdownLinter, { delay: 500 })] : []),
        spellcheckCompartment.of(spellcheckRequested ? [linter(createSpellcheckLinter(spellcheckLanguageRequested), { delay: 700 })] : []),
        autocompletion({
            interactionDelay: 0,
            override: [
                frontmatterCompletions,
                dateShortcutCompletions,
                headingLinkCompletions,
                fileLinkCompletions,
                imageCompletions,
                markdownTableAutocompleter(),
            ],
        }),
        markdownLanguage,
        markdownStylePlugin,
        headingLinkCompletionActivator,
        livePreviewPlugin,
        editorTheme,
        ...(Array.isArray(frontmatterField) ? frontmatterField : [frontmatterField]),
        linkPlugin({
            onWikiLinkClick: target => handleLinkClick(normalizeWikiLinkTarget(target), target, true),
        }),
        linkPreview(),
        ...codeBlockField({ lineNumbers: true, skipLanguages: diagramLanguages }),
        ...(Array.isArray(diagramField) ? diagramField : [diagramField]),
        markdownTableCompartment.of(createMarkdownTableExtension()),
        mathField,
        hexColorExtension,
        hashtagPlugin,
        widgetPlugin,
        extrasPlugin,
        emptyLinkAutofillPlugin,
        EditorView.domEventHandlers({
            mousedown: handleMouseDown,
            click: handleClick,
            paste: (event, view) => handleClipboardImagePaste(event, view)
                || (activeFileLanguage.kind === 'markdown' && handleClipboardTablePaste(event, view)),
            drop: handleExternalFileDrop,
        }),
        // Backspace and Escape must cancel a pending dead key before
        // CodeMirror's ordinary keymap can edit the document.
        Prec.highest(EditorView.domEventHandlers({ keydown: handleWindowsSpanishDeadKey })),
        Prec.high(keymap.of([
            { key: 'ArrowUp', run: view => moveCursorVerticallySafely(view, false), preventDefault: true },
            { key: 'ArrowDown', run: view => moveCursorVerticallySafely(view, true), preventDefault: true },
        ])),
        keymap.of(lintKeymap),
        keymap.of(markdownKeymap),
    ];
    const codeExtensionsForSupport = (support) => [
        ...(support ? [support] : []),
        ...(EditorState ? [EditorState.tabSize.of(codeIndentUnit.length)] : []),
        ...(indentUnit ? [indentUnit.of(codeIndentUnit)] : []),
        ...(codeHighlighting ? [codeHighlighting] : []),
        ...(indentationMarkerExtension ? indentationMarkerExtension({
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
        hexColorExtension,
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
            lineNumbersCompartment.of(lineNumbersRequested ? [lineNumbers(), highlightActiveLineGutter()] : []),
            foldingCompartment.of([]),
            history(), bracketMatching(), drawSelection(),
            searchExtension({ top: false }),
            EditorView.updateListener.of(update => {
                const replacingDocument = update.docChanged && _programmaticChange;
                if (update.docChanged) handleDocChange(update);
                if (update.selectionSet) {
                    updateCursorPosition(update);
                    // The shared EditorView temporarily owns each file in
                    // turn. Keep that file's selection current so workspace
                    // detours and restarts return to the exact cursor range.
                    if (!replacingDocument) rememberActiveFileCursor(update);
                }
                // Lightweight consumers such as the document Outline can
                // follow editor state without installing decorations or
                // competing with CodeMirror's cursor/layout machinery.
                if (update.docChanged || update.selectionSet || update.viewportChanged) {
                    document.dispatchEvent(new CustomEvent('editor-view-updated', {
                        detail: {
                            docChanged: update.docChanged,
                            selectionSet: update.selectionSet,
                            viewportChanged: update.viewportChanged,
                        },
                    }));
                }
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
            keymap.of(createDocumentKeyBindings({
                searchBindings: searchKeymap,
                defaultBindings: defaultKeymap,
                historyBindings: historyKeymap,
                completionBindings: completionKeymap,
                acceptCompletion,
                indentMore,
                indentLess,
            }))
        ]
    });

    editorView = new EditorView({ state: editorState, parent: container });

    // The persisted preference may load while the workspace overview is active, before
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

    setState('editorView', editorView);
    return editorView;
}

function getEditorView() { return editorView || getState('editorView'); }
function getEditorContent() { const v = getEditorView(); return v ? v.state.doc.toString() : ''; }

let _programmaticChange = false;

const editorDocumentSession = createEditorDocumentSession({
    schedule: callback => setTimeout(callback, 0),
    readEditor: getEditorView,
    editorUnavailable: view => !view || view.isDestroyed,
    readActiveTabId: () => getState('activeTabId'),
    readContent: view => view.state.doc.toString(),
    beforeReplace() {
        // Preserve the outgoing dirty document before this shared editor
        // receives another tab's source.
        flushPendingContentNotification();
        cancelPendingStatsUpdate();
    },
    applyContent(view, request) {
        _programmaticChange = true;
        const selection = normalizedCursorState(request.cursorState, request.content.length);
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: request.content },
            ...(selection ? { selection, scrollIntoView: true } : { scrollIntoView: false }),
        });
    },
    restoreSelection: restoreCursorState,
    reportFailure(error) {
        _programmaticChange = false;
        log.warn('Failed to set editor content:', error);
    },
});

/**
 * Replace the shared editor document. When tabId is supplied, the deferred
 * CodeMirror transaction is allowed to land only while that tab is still
 * active. This prevents a rapid A -> B -> A switch from mounting B's delayed
 * document into A's editor.
 */
function setEditorContent(content, tabId = undefined, cursorState = null) {
    editorDocumentSession.mount(content, tabId, cursorState);
}

function getEditorDocumentTabId() { return editorDocumentSession.documentTabId(); }

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

/** Toggle the editor's line-number gutter without replacing the document. */
function setLineNumbers(enabled) {
    lineNumbersRequested = Boolean(enabled);
    const view = getEditorView();
    if (!view || !lineNumbersCompartment) return;
    view.dispatch({
        effects: lineNumbersCompartment.reconfigure(
            lineNumbersRequested ? [lineNumbers(), highlightActiveLineGutter()] : []
        ),
    });
    view.requestMeasure();
}

/** Toggle local Markdown diagnostics without changing source or preview state. */
function setMarkdownLint(enabled) {
    markdownLintRequested = Boolean(enabled);
    const view = getEditorView();
    if (!view || !markdownLintCompartment || activeFileLanguage.kind !== 'markdown') return;
    view.dispatch({
        effects: markdownLintCompartment.reconfigure(
            markdownLintRequested ? [linter(markdownLinter, { delay: 500 })] : []
        ),
    });
}

/** Apply the offline spellcheck preference without changing Markdown source. */
function setSpellcheck({ enabled = true, language = 'en-US' } = {}) {
    spellcheckRequested = Boolean(enabled);
    spellcheckLanguageRequested = canonicalSpellcheckLanguage(language);
    const view = getEditorView();
    if (!view || !spellcheckCompartment || activeFileLanguage.kind !== 'markdown') return;
    view.dispatch({
        effects: spellcheckCompartment.reconfigure(
            spellcheckRequested
                ? [linter(createSpellcheckLinter(spellcheckLanguageRequested), { delay: 700 })]
                : []
        ),
    });
}

function focusEditor() { const v = getEditorView(); if (v) v.focus(); }

function materializedDocumentContent(document) {
    if (document === lastMaterializedDocument) return lastMaterializedContent;
    const content = document.toString();
    lastMaterializedDocument = document;
    lastMaterializedContent = content;
    return content;
}

function flushPendingContentNotification() {
    const pending = pendingContentNotification;
    pendingContentNotification = null;
    contentNotificationFrame = null;
    if (!pending) return;

    const tab = (getState('openTabs') || []).find(candidate => candidate?.id === pending.tabId);
    // A switch-away captures the active document synchronously and a
    // successful save clears its dirty state. In either case this delayed
    // observer snapshot must not resurrect a stale dirty cache.
    if (!tab || !tab.dirty || tab._editGeneration !== pending.generation) return;

    const content = materializedDocumentContent(pending.document);
    tab._content = content;
    document.dispatchEvent(new CustomEvent('file-content-changed', {
        detail: { path: pending.path, content },
    }));
}

function scheduleContentNotification(tab, editorDocument) {
    pendingContentNotification = {
        tabId: tab.id,
        path: tab.path,
        generation: tab._editGeneration,
        document: editorDocument,
    };
    if (contentNotificationFrame !== null) return;

    const flush = () => flushPendingContentNotification();
    contentNotificationFrame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(flush)
        : setTimeout(flush, 0);
}

function scheduleStatsUpdate(editorDocument) {
    pendingStatsDocument = editorDocument;
    if (statsTimer !== null) clearTimeout(statsTimer);
    statsTimer = setTimeout(() => {
        statsTimer = null;
        const document = pendingStatsDocument;
        pendingStatsDocument = null;
        if (document) updateStats(materializedDocumentContent(document));
    }, editorStatsDebounceMs);
}

function cancelPendingStatsUpdate() {
    if (statsTimer !== null) clearTimeout(statsTimer);
    statsTimer = null;
    pendingStatsDocument = null;
}

function handleDocChange(update) {
    if (_programmaticChange) {
        _programmaticChange = false;
        cancelPendingStatsUpdate();
        updateStats(materializedDocumentContent(update.state.doc));
        return;
    }
    const at = getState('openTabs').find(t => t.id === getEditorDocumentTabId());
    if (at && at.type === 'file') {
        const becameDirty = !at.dirty;
        at._editGeneration = (at._editGeneration || 0) + 1;
        // Mark the model dirty synchronously. The tab-bar import only paints
        // that fact; source snapshots below remain owned by CodeMirror until
        // a consumer actually needs a string.
        at.dirty = true;
        if (becameDirty) {
            markTabDirty(at.id, { alreadyDirty: true });
        }
        // Kanban and the PDF preview need the current in-memory text, but
        // each can consume the newest frame rather than every transaction in
        // a rapid typing burst. Saves and tab switches read the editor state
        // directly, so this never weakens the dirty-buffer guarantee.
        scheduleContentNotification(at, update.state.doc);
        scheduleStatsUpdate(update.state.doc);
    }
}
function updateCursorPosition(update) {
    const sel = update.state.selection.main;
    const line = update.state.doc.lineAt(sel.head).number;
    const col = sel.head - update.state.doc.lineAt(sel.head).from + 1;
    const el = document.getElementById('cursor-position');
    if (el) el.textContent = `Ln ${line}, Col ${col}`;
}

function normalizedCursorState(cursorState, documentLength) {
    if (!cursorState || !Number.isInteger(cursorState.anchor) || !Number.isInteger(cursorState.head)) return null;
    const clamp = position => Math.max(0, Math.min(position, documentLength));
    return { anchor: clamp(cursorState.anchor), head: clamp(cursorState.head) };
}

function rememberActiveFileCursor(update) {
    const tabId = getEditorDocumentTabId();
    if (!tabId || getState('activeTabId') !== tabId) return;
    const tab = getState('openTabs').find(candidate => candidate.id === tabId);
    if (!tab || tab.type !== 'file') return;

    const selection = update.state.selection.main;
    tab.cursorState = { anchor: selection.anchor, head: selection.head };
    scheduleSessionSave();
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
    return saveActiveTabFile();
}

/** Save the exact active editor buffer, then close only after save success. */
export async function saveAndCloseActiveFile() {
    const tab = getActiveTab();
    if (!tab || tab.type !== 'file' || !tab.path) return false;

    const content = getEditorContent();
    try {
        const result = await saveFileSnapshot(tab, content);
        if (!result?.success) return false;

        const currentTab = (getState('openTabs') || []).find(candidate => candidate.id === tab.id);
        if (currentTab !== tab) return false;
        // A new edit may land while an asynchronous save is in flight. Never
        // close that newer buffer merely because the older snapshot saved.
        if (getState('activeTabId') === tab.id && getEditorContent() !== content) {
            markTabDirty(tab.id);
            statusBar.set('File changed during save; tab kept open');
            return false;
        }
        return closeTab(tab.id);
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

    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });

    // Handle clicks on link widgets (don't move cursor, navigate directly)
    const linkEl = event.target.closest('.cm-link-widget');
    if (linkEl) {
        event.preventDefault();
        if (linkEl.classList.contains('cm-wikilink-widget')) {
            // The widget's own click listener receives its real target for a left
            // click. Middle-click has no click event, so recover the source token.
            if (event.button === 1 && position !== null) {
                const line = view.state.doc.lineAt(position);
                const wiki = wikiLinkAtPosition(line.text, position - line.from);
                if (wiki) handleLinkClick(normalizeWikiLinkTarget(wiki.target), wiki.label, false);
            }
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

    const pos = position;
    if (pos === null) return;
    if (event.button === 0 && handleFootnoteNavigation(event, view, pos)) return true;
    const doc = view.state.doc, line = doc.lineAt(pos), lt = line.text, col = pos - line.from;
    const hr = /(?<!\w)(?<!#)#([a-zA-Z][a-zA-Z0-9_-]*)\b/g;
    let m;
    while ((m = hr.exec(lt)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
            event.preventDefault();
            openTab('kanban-board', 'Kanban', 'kanban', { focusCol: m[1].toLowerCase() });
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
    const wiki = wikiLinkAtPosition(lt, col);
    if (wiki) {
        event.preventDefault();
        handleLinkClick(normalizeWikiLinkTarget(wiki.target), wiki.label, replaceCurrent);
        return true;
    }
}

/** Parse the conventional target-first wikilink covering a source position. */
export function wikiLinkAtPosition(line, column) {
    const links = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;
    while ((match = links.exec(String(line || ''))) !== null) {
        if (column < match.index || column > match.index + match[0].length) continue;
        return {
            target: match[1].trim(),
            label: (match[2] || match[1]).trim(),
        };
    }
    return null;
}

/** Convert an editor wikilink target into a readable vault note path. */
export function normalizeWikiLinkTarget(target) {
    let value = String(target || '').trim();
    try { value = decodeURI(value); } catch (_) { /* keep source spelling */ }
    const suffixAt = value.search(/[?#]/);
    if (suffixAt >= 0) value = value.slice(0, suffixAt);
    if (value && !value.toLowerCase().endsWith('.md')) value += '.md';
    return value.replace(/^\/+/, '');
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
    const requestId = ++contextMenuRequestId;
    const showMenu = suggestion => {
        if (requestId !== contextMenuRequestId || view.isDestroyed) return;
        showEditorContextMenu(event, view, suggestion);
    };

    if (activeFileLanguage.kind !== 'markdown' || !spellcheckRequested || pos === null) {
        showMenu(null);
        return true;
    }

    const source = view.state.doc.toString();
    spellcheckSuggestionsAtPosition(source, pos, spellcheckLanguageRequested)
        .then(showMenu)
        .catch(() => showMenu(null));
    return true;
}

function showEditorContextMenu(event, view, spellcheckSuggestion) {
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
    const previewActions = activeTab?.path?.toLowerCase().endsWith('.md') ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="preview-markdown">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
            Preview Markdown
        </div>
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
        ${previewActions}
    `;
    appendSpellcheckSuggestionItems(menu, spellcheckSuggestion);
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const margin = 8;
    if (event.clientX + menuRect.width > window.innerWidth - margin) {
        menu.style.left = 'auto';
        menu.style.right = `${margin}px`;
    } else {
        menu.style.left = `${Math.max(margin, event.clientX)}px`;
    }
    if (event.clientY + menuRect.height > window.innerHeight - margin) {
        menu.style.top = 'auto';
        menu.style.bottom = `${margin}px`;
    } else {
        menu.style.top = `${Math.max(margin, event.clientY)}px`;
    }

    menu.addEventListener('click', async (ev) => {
        const item = ev.target.closest('.context-menu-item');
        if (!item || item.classList.contains('disabled') || item.getAttribute('aria-disabled') === 'true') return;
        menu.remove();
        const action = item.dataset.action;
        if (action === 'replace-spelling') {
            const replacement = item._figaroSpellcheckReplacement;
            if (!replacement || view.state.sliceDoc(replacement.from, replacement.to) !== replacement.word) {
                statusBar.set('Spelling changed; choose a suggestion again');
                return;
            }
            view.dispatch({
                changes: { from: replacement.from, to: replacement.to, insert: replacement.suggestion },
                selection: { anchor: replacement.from + replacement.suggestion.length },
                scrollIntoView: true,
                userEvent: 'input.spellcheck',
            });
            statusBar.set(`Replaced “${replacement.word}”`);
            setTimeout(() => statusBar.set('Ready'), 1500);
        } else if (action === 'cut') {
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
        } else if (action === 'preview-markdown') {
            try {
                await openMarkdownPreview({
                    path: activeTab.path,
                    title: activeTab.title,
                    content: view.state.doc.toString(),
                });
            } catch (error) {
                log.error('Markdown preview failed:', error);
                await errorDialog('Markdown preview couldn’t open', error, 'Could not open the Markdown preview.');
            }
        } else if (action === 'preview-pdf') {
            try {
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

function appendSpellcheckSuggestionItems(menu, spellcheckSuggestion) {
    if (!spellcheckSuggestion) return;

    const section = document.createDocumentFragment();
    const label = document.createElement('div');
    label.className = 'context-menu-label';
    label.textContent = 'Spelling suggestions';
    section.appendChild(label);

    if (spellcheckSuggestion.suggestions.length) {
        for (const suggestion of spellcheckSuggestion.suggestions) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'context-menu-item context-menu-item--spelling-suggestion';
            item.dataset.action = 'replace-spelling';
            item.textContent = suggestion;
            item.setAttribute('aria-label', `Replace “${spellcheckSuggestion.word}” with “${suggestion}”`);
            item._figaroSpellcheckReplacement = {
                from: spellcheckSuggestion.from,
                to: spellcheckSuggestion.to,
                word: spellcheckSuggestion.word,
                suggestion,
            };
            section.appendChild(item);
        }
    } else {
        const empty = document.createElement('div');
        empty.className = 'context-menu-item context-menu-item--spelling-empty disabled';
        empty.textContent = 'No suggestions found';
        section.appendChild(empty);
    }

    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    section.appendChild(separator);
    menu.prepend(section);
}

async function handleLinkClick(linkPath, linkText, replaceCurrent = false) {
    // Decode any percent-encoded characters (e.g., %20 → space) for file operations
    try { linkPath = decodeURI(linkPath); } catch (e) { /* decode may fail */ }
    try { linkPath = decodeURI(linkPath); } catch (e) { /* double-decode safety */ }

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
        const r = await backend().ReadFile(linkPath);
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
                await backend().CreateFile(fpath, `# ${displayName}\n\n`);
                openTab(fpath, fname, 'file', { path: fpath, mtime: Date.now() / 1000 }, true);
                refreshFileTree();
            }
        }
    } catch (err) { log.error('Failed to open link:', err, 'path was:', linkPath); }
}

/**
 * Replace the current file tab with a new target.
 * If the active tab is a file tab, update it in-place.
 */
async function replaceCurrentFileTab(id, title, type, data) {
    return replaceActiveFileTab(id, title, type, data);
}

function saveCursorState(_tabId) {
    const v = getEditorView(); if (!v) return null;
    const sel = v.state.selection.main;
    return { anchor: sel.anchor, head: sel.head };
}
function restoreCursorState(_tabId, cs) {
    const v = getEditorView(); if (!v || !cs) return;
    const selection = normalizedCursorState(cs, v.state.doc.length);
    if (selection) v.dispatch({ selection, scrollIntoView: true });
}

function applyVimVisualRowsMapping(enabled) {
    if (!vimAPI || vimVisualRowsMapped === enabled) return vimVisualRowsMapped;
    for (const [from, to, context] of vimVisualRowMappings) {
        if (enabled) vimAPI.map(from, to, context);
        else vimAPI.unmap(from, context);
    }
    vimVisualRowsMapped = enabled;
    return vimVisualRowsMapped;
}

/**
 * Configure display-row motions for Vim Normal and Visual mode. Operator
 * pending mappings intentionally stay untouched, so commands such as `dj`
 * retain their conventional source-line meaning.
 */
function setVimVisualRows(enabled) {
    vimVisualRowsRequested = Boolean(enabled);
    if (!vimActive) return false;
    return applyVimVisualRowsMapping(vimVisualRowsRequested);
}

/** Configure whether Vim j/k enters a rendered Markdown block before skipping it. */
function setVimRevealBlocks(enabled) {
    vimRevealBlocksRequested = Boolean(enabled);
    return vimRevealBlocksRequested;
}

/** Rebuild embedded table-cell editors after their Vim extension changes. */
function reconfigureMarkdownTableCells() {
    if (!editorView || !markdownTableCompartment || !createMarkdownTableExtension) return;
    if (activeFileLanguage.kind !== 'markdown' || !markdownModeExtensions || !fileModeCompartment) return;

    // codemirror-markdown-tables deliberately keeps each embedded cell editor
    // alive while its table widget is unchanged. Removing and restoring the
    // Markdown mode makes that lifecycle explicit when the modal editor
    // changes, so existing cells cannot retain a stale keymap.
    editorView.dispatch({ effects: fileModeCompartment.reconfigure([]) });
    editorView.dispatch({ effects: fileModeCompartment.reconfigure(markdownModeExtensions()) });
}

/** Register the application commands before the newly enabled mode can receive input. */
function registerVimExCommands(Vim) {
    Vim.defineEx('write', 'w', () => {
        saveActiveFile().catch(error => log.warn('Vim :write failed:', error));
    });

    Vim.defineEx('edit', 'e', (_cm, args) => {
        const fname = args?.trim();
        if (!fname) return;
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

    Vim.defineEx('quit', 'q', () => {
        const tab = getActiveTab();
        if (tab) closeTab(tab.id);
    });

    Vim.defineEx('wq', 'wq', () => {
        saveAndCloseActiveFile().catch(error => log.warn('Vim :wq failed:', error));
    });
    Vim.defineEx('xit', 'x', () => {
        saveAndCloseActiveFile().catch(error => log.warn('Vim :xit failed:', error));
    });
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
        if (!vimRequested || requestId !== vimRequestId || !editorView) return false;

        const view = editorView;
        vimAPI = Vim;
        vimGetCM = getCM;
        vimTableCellExtension = [
            vim(),
            vimTableCellPromptCaptureExtension(),
            vimTableCellNavigationExtension(),
            vimTableCellModeExtension(),
        ];
        view.dispatch({ effects: vimCompartment.reconfigure(vim()) });
        reconfigureMarkdownTableCells();
        vimActive = true;
        applyVimVisualRowsMapping(vimVisualRowsRequested);
        registerVimExCommands(Vim);

        // Track vim mode for status bar
        updateVimStatus('normal');
        syncRootVimModeClasses(view, 'normal');
        const cm = getCM(view);
        if (cm) {
            if (vimModeCM && vimModeChangeHandler) {
                vimModeCM.off('vim-mode-change', vimModeChangeHandler);
            }
            vimModeCM = cm;
            vimModeChangeHandler = (e) => {
                if (!focusedTableCellVimMode(view.dom.ownerDocument)) updateVimStatus(e.mode);
                // Add classes to the root editor for modal cursor and Visual
                // selection styling.
                syncRootVimModeClasses(view, e.mode);
            };
            cm.on('vim-mode-change', vimModeChangeHandler);
        }
    } else {
        applyVimVisualRowsMapping(false);
        if (vimModeCM && vimModeChangeHandler) {
            vimModeCM.off('vim-mode-change', vimModeChangeHandler);
        }
        vimModeCM = null;
        vimModeChangeHandler = null;
        vimGetCM = null;
        vimTableCellExtension = null;
        reconfigureMarkdownTableCells();
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
    getEditorContent, getEditorDocumentTabId, setEditorContent, focusEditor,
    saveActiveFile, toggleSearchPanel, closeSearchPanel,
    saveCursorState, restoreCursorState, toggleVim, isVimEnabled, setVimVisualRows, setVimRevealBlocks, setImageBasePath, setReadOnly, setLineNumbers, setMarkdownLint, setSpellcheck,
    configureEditorForFile, normalizeWebKitShiftTab };

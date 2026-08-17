import { backend } from './backend.js';
/**
 * CodeMirror 6 Editor Implementation
 * Uses locally vendored CodeMirror 6 modules + codemirror-live-markdown
 */

import { log } from './log.js';
import { setState, getState, subscribe } from './state.js';
import { scheduleSessionSave } from './session.js';
import { statusBar } from './statusBar.js';
import { mathField } from './mathPlugin.js';
import { createDiagramField, diagramLanguages, scanDiagramFences } from './liveDiagramPlugin.js';
import { createMarkdownTableField } from './liveMarkdownTablePlugin.js';
import { requestSourceFootprintMeasure, sourceFootprintExtension } from './sourceFootprint.js';
import {
    defaultTabSize,
    expandedTabText,
    normalizeTabSize,
    tabSizeIndentUnit,
} from './core/tabSizeModel.js';
import { getFootnoteAtPosition, resolveFootnoteNavigation } from './footnotes.js';
import { getFileLanguage, loadLanguageSupport } from './languageSupport.js';
import { createFrontmatterField } from './frontmatterPlugin.js';
import { getFrontmatterRegion } from './frontmatter.js';
import { FRONTMATTER_UPWARD_REVEAL_USER_EVENT } from './core/frontmatterPresentationModel.js';
import { createFrontmatterCompletionSource, getRelativePrintStylesheets } from './frontmatterCompletions.js';
import { createDateShortcutCompletionSource } from './dateShortcutCompletions.js';
import { createTaskDueDateCompletionSource } from './taskDueDateCompletions.js';
import { openDatePicker } from './datePicker.js';
import { errorDialog, pdfExportErrorDialog, tableConversionDialog } from './dialogs.js';
import { insertMarkdownTable } from './clipboardTable.js';
import {
    FIGARO_MARKDOWN_CLIPBOARD_TYPE,
    handleClipboardPaste,
    handleMarkdownClipboardCopy,
    handlePlainPasteBypass,
    handlePlainPasteKeydown,
    handlePlainPasteKeyup,
    pasteClipboardItemImage,
    pasteClipboardPayload,
} from './clipboardPaste.js';
import {
    headingLinkCompletionMatch,
    linkedNoteCompletionInsertion,
    markdownHeadingPosition,
    markdownHeadingTargets,
    noteLinkCompletion,
    noteLinkCompletionMatch,
    planLinkedNoteCompletion,
    shouldOfferLinkedNoteCreation,
} from './linkCompletions.js';
import { getLinkStylePreference } from './linkStyle.js';
import { hexColorExtension, isHexColorToken } from './hexColorPlugin.js';
import { createDocumentKeyBindings } from './codeMirrorProfiles.js';
import { createEditorDocumentSession } from './usecases/editorDocumentSession.js';
import { createLinkedNoteFromCompletion } from './usecases/createLinkedNoteFromCompletion.js';
import { reviewMissingLinkedNote, reviewSameDirectoryNoteName } from './usecases/similarNoteReview.js';
import {
    markdownEditorNavigationAtPosition,
    markdownLinkDestinationAtPosition,
    markdownReferenceDefinitions,
    markdownReferenceLink,
    planMarkdownLinkTargetReplacement,
    resolveMarkdownReferenceLink,
} from './core/noteLinks.js';
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
import { openRawTextPreview } from './rawTextPreview.js';
import { openPDFPreview } from './pdfPreview.js';
import {
    configureContextMenu,
    dismissContextMenu,
} from './contextMenu.js';
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
    historyField, indentLess, indentMore, redo, undo,
} from '@codemirror/commands';
import {
    HighlightStyle, bracketMatching, foldGutter, foldedRanges, foldKeymap, indentUnit,
    syntaxHighlighting, syntaxTree,
} from '@codemirror/language';
import { acceptCompletion, autocompletion, completionKeymap, startCompletion } from '@codemirror/autocomplete';
import {
    deleteMarkupBackward,
    insertNewlineContinueMarkupCommand,
    markdownLanguage,
    pasteURLAsLink,
} from '@codemirror/lang-markdown';
import { lintKeymap, linter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { validateMermaidSource } from './diagramRenderer.js';
import { createMarkdownDocumentLinter } from './usecases/markdownDocumentLint.js';
import { createMarkdownBlockGuidesExtension } from './markdownBlockGuides.js';
import { openMermaidEditor } from './mermaidEditor.js';
import { canonicalSpellcheckLanguage, createSpellcheckLinter, spellcheckSuggestionsAtPosition } from './spellcheck.js';
import {
    unexpectedVerticalMotionTarget,
    verticalBoundaryTarget,
    verticalViewportBoundaryTarget,
} from './core/verticalCursorModel.js';
import {
    planVimClipboardPaste,
    vimPasteKeys,
    vimPasteReplayKeys,
} from './core/vimClipboardModel.js';
import { markdownLinkPastePlan } from './core/markdownLinkPasteModel.js';
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
let imageBasePathCompartment = null;
let readOnlyCompartment = null;
let fileModeCompartment = null;
let foldingCompartment = null;
let lineNumbersCompartment = null;
let markdownLintCompartment = null;
let spellcheckCompartment = null;
let tabSizeCompartment = null;
let historyCompartment = null;
let vimActive = false;
let vimRequested = false;
let vimVisualRowsRequested = false;
let vimVisualRowsMapped = false;
let vimVisualRowMotionsRegistered = false;
let vimRevealBlocksRequested = false;
let vimAPI = null;
let vimGetCM = null;
let lineNumbersRequested = false;
let markdownLintRequested = true;
const markdownDocumentLinter = createMarkdownDocumentLinter(validateMermaidSource);
let markdownBlockGuidesRequested = true;
let spellcheckRequested = true;
let spellcheckLanguageRequested = 'en-US';
let vimRequestId = 0;
let vimModeCM = null;
let vimModeChangeHandler = null;
const vimModeClassSyncTokens = new WeakMap();
let activeFileLanguage = { kind: 'markdown', label: 'Markdown', description: null };
let fileModeRequest = 0;
let markdownModeExtensions = null;
let editorTabSizeRequested = defaultTabSize;

// Figaro exits an empty list item with one Enter. CodeMirror's default keeps a
// two-item tight list alive for one extra press, which is surprising in a
// prose editor. Backspace retains the library's Markdown-aware behavior.
const figaroMarkdownKeymap = [
    { key: 'Enter', run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
    { key: 'Backspace', run: deleteMarkupBackward },
];

export function editorAccessibleLabel({ language = activeFileLanguage, tab = null } = {}) {
    const title = tab?.title || tab?.path?.split('/').pop() || 'Untitled document';
    const surface = language?.kind === 'markdown'
        ? 'Markdown editor'
        : (language?.kind === 'code' ? `${language.label || 'Code'} editor` : 'Plain text editor');
    return `${surface} — ${title}`;
}

function syncEditorAccessibleLabel() {
    const view = getEditorView();
    if (!view?.contentDOM) return false;
    const activeId = getState('activeTabId');
    const tab = (getState('openTabs') || []).find(candidate => candidate.id === activeId) || null;
    view.contentDOM.setAttribute('aria-label', editorAccessibleLabel({ tab }));
    return true;
}

if (typeof subscribe === 'function') {
    subscribe('activeTabId', syncEditorAccessibleLabel);
    subscribe('openTabs', syncEditorAccessibleLabel);
}
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
let vimClipboardMappingsRegistered = false;
const vimClipboardControllers = new WeakSet();
const editorHistoryByTab = new WeakMap();

function editorTabSizeExtensions(value = editorTabSizeRequested) {
    const size = normalizeTabSize(value);
    return [
        EditorState.tabSize.of(size),
        indentUnit.of(tabSizeIndentUnit(size)),
    ];
}

/** Apply one indentation width to every editor surface backed by CodeMirror. */
function setEditorTabSize(value) {
    editorTabSizeRequested = normalizeTabSize(value, editorTabSizeRequested);
    document.documentElement?.style.setProperty('--editor-tab-size', String(editorTabSizeRequested));

    if (!editorView || editorView.isDestroyed || !tabSizeCompartment) return editorTabSizeRequested;
    editorView.dispatch({ effects: tabSizeCompartment.reconfigure(editorTabSizeExtensions()) });
    requestSourceFootprintMeasure(editorView);
    return editorTabSizeRequested;
}

function getEditorTabSize() {
    return editorTabSizeRequested;
}

function createEditorFoldControl(expanded, regionLabel) {
    const control = document.createElement('button');
    const action = expanded ? 'Collapse' : 'Expand';
    control.type = 'button';
    control.className = 'ui-editor-fold-control';
    control.setAttribute('aria-label', `${action} ${regionLabel}`);
    control.setAttribute('aria-expanded', String(expanded));
    control.title = `${action} ${regionLabel}`;

    // A primary-pointer fold should leave typing focus in the editor. Keyboard
    // activation remains native: Enter and Space still dispatch the click that
    // CodeMirror's gutter controller handles.
    control.addEventListener('mousedown', event => {
        if (event.button === 0) event.preventDefault();
    });
    return control;
}

function editorFoldingExtensions(kind) {
    if (!foldGutter || !foldKeymap) return [];
    if (kind === 'markdown') return markdownBlockGuidesRequested ? markdownBlockGuidesExtension : [];
    return [
        foldGutter({
            markerDOM: expanded => createEditorFoldControl(expanded, 'code region'),
        }),
        keymap.of(foldKeymap),
    ];
}

const stickyHeadingScrollMargins = EditorView.scrollMargins.of(() => {
    const stack = document.getElementById('sticky-heading-stack');
    if (!stack || stack.hidden) return null;
    return { top: Math.ceil(stack.getBoundingClientRect().height) };
});

const vimVisualRowMappings = [
    ['j', '<FigaroVisualDown>', 'normal'],
    ['k', '<FigaroVisualUp>', 'normal'],
    ['<Down>', '<FigaroVisualDown>', 'normal'],
    ['<Up>', '<FigaroVisualUp>', 'normal'],
    ['j', '<FigaroVisualDown>', 'visual'],
    ['k', '<FigaroVisualUp>', 'visual'],
    ['<Down>', '<FigaroVisualDown>', 'visual'],
    ['<Up>', '<FigaroVisualUp>', 'visual'],
];

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

function vimModeClassExtension(mode) {
    const normalizedMode = mode || '';
    const className = normalizedMode.startsWith('visual') ? 'vim-visual'
        : normalizedMode === 'normal' ? 'vim-normal'
            : normalizedMode === 'insert' ? 'vim-insert'
                : '';
    return className ? EditorView.editorAttributes.of({ class: className }) : [];
}

function syncRootVimModeClasses(rootView, mode, compartment = null) {
    if (!rootView || rootView.isDestroyed) return;
    const normalizedMode = mode || 'normal';
    if (!compartment) {
        rootView.dom.classList.toggle('vim-visual', normalizedMode.startsWith('visual'));
        rootView.dom.classList.toggle('vim-normal', normalizedMode === 'normal');
        rootView.dom.classList.toggle('vim-insert', normalizedMode === 'insert');
        return;
    }
    const token = {};
    vimModeClassSyncTokens.set(rootView, token);
    queueMicrotask(() => {
        if (rootView.isDestroyed || vimModeClassSyncTokens.get(rootView) !== token) return;
        rootView.dispatch({ effects: compartment.reconfigure(vimModeClassExtension(mode)) });
    });
}

function vimFrontmatterRange(doc) {
    if (doc.lines < 2 || !/^---\s*$/.test(doc.line(1).text)) return null;
    for (let number = 2; number <= doc.lines; number += 1) {
        const line = doc.line(number);
        if (/^(?:---|\.\.\.)\s*$/.test(line.text)) {
            return {
                from: 0,
                to: Math.min(doc.length, line.to + 1),
                kind: 'source',
                frontmatter: true,
            };
        }
    }
    return null;
}

function hashtagCompletionContextAllowed(context) {
    const frontmatter = vimFrontmatterRange(context.state.doc);
    if (frontmatter && context.pos <= frontmatter.to) return false;
    const probe = Math.max(0, Math.min(context.pos - 1, context.state.doc.length));
    for (let node = syntaxTree(context.state).resolveInner(probe, -1); node; node = node.parent) {
        if (/(?:Code|Link|URL|HTML)/.test(node.name)) return false;
    }
    return true;
}

const richPasteProtectedNode = /(?:Code|HTML|Link|URL|Image|Escape|Entity)/i;
const markdownLinkPasteProtectedNode = /(?:Code|HorizontalRule|HTML|Link|Comment|Processing|Escape|Entity|Image|Mark|URL)/i;

function markdownURLPasteInsertion(state, clipboardText) {
    const ranges = state?.selection?.ranges || [];
    if (activeFileLanguage.kind !== 'markdown' || ranges.length !== 1 || ranges[0].empty) return null;
    const range = ranges[0];
    const markdownActive = markdownLanguage.isActiveAt(state, range.from, 1);
    let plainSelection = true;
    syntaxTree(state).iterate({
        from: range.from,
        to: range.to,
        enter: node => {
            if (node.from > range.from || markdownLinkPasteProtectedNode.test(node.name)) {
                plainSelection = false;
            }
        },
        leave: node => {
            if (node.to < range.to) plainSelection = false;
        },
    });
    return markdownLinkPastePlan({
        clipboardText,
        selectedText: state.sliceDoc(range.from, range.to),
        markdownActive,
        plainSelection,
    })?.insertion || null;
}

function pasteMarkdownURLAsLink(view, clipboardText) {
    const insertion = markdownURLPasteInsertion(view?.state, clipboardText);
    if (!insertion) return false;
    return pasteClipboardPayload(view, {
        text: insertion,
        internal: true,
        mimeType: 'text/plain',
    }, { markdown: true });
}

/** Whether a rich conversion would be inserted into syntax that must stay literal. */
export function markdownRichPasteProtectedContext(state) {
    const ranges = state?.selection?.ranges || [];
    if (ranges.length !== 1) return true;
    const range = ranges[0];
    const source = state.doc.toString();
    const frontmatter = getFrontmatterRegion(source);
    if (frontmatter) {
        const touchesFrontmatter = range.empty
            ? range.from >= frontmatter.from && range.from < frontmatter.to
            : range.from < frontmatter.to && range.to > frontmatter.from;
        if (touchesFrontmatter) return true;
    }

    const tree = syntaxTree(state);
    const probes = range.empty
        ? [range.from]
        : [range.from, Math.max(range.from, range.to - 1)];
    for (const probe of probes) {
        for (let node = tree.resolveInner(probe, -1); node; node = node.parent) {
            if (richPasteProtectedNode.test(node.name)) return true;
        }
    }
    let protectedRange = false;
    if (!range.empty) {
        tree.iterate({
            from: range.from,
            to: range.to,
            enter: node => {
                if (richPasteProtectedNode.test(node.name)) protectedRange = true;
            },
        });
    }
    return protectedRange;
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
            } else if (node.name === 'Table') {
                ranges.push({ from: node.from, to: node.to, kind: 'table' });
            }
        },
    });

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

/** Plan the CodeMirror selection used to reveal a rendered source block. */
export function vimRenderedBlockSelection(selection, block, forward, extendVisual = false) {
    if (!selection || !block) return null;
    const target = block.kind === 'table'
        ? (forward ? block.from : block.to)
        : (forward ? Math.min(block.from + 1, block.to) : Math.max(block.from, block.to - 1));
    if (extendVisual && block.kind === 'source') {
        return { anchor: selection.anchor, head: target };
    }
    return { anchor: target, head: target };
}

/**
 * Let optional Vim j/k entry reveal a replacement block's portable source.
 * Tables are deliberately special: their own selection filter turns the
 * boundary into the first or last interactive cell instead of raw pipes.
 */
function enterAdjacentRenderedBlock(view, forward, extendVisual = false, block = adjacentVimRenderedBlock(view, forward)) {
    if (!block) return false;
    const selection = vimRenderedBlockSelection(view.state.selection.main, block, forward, extendVisual);
    if (!selection) return false;
    view.dispatch({
        selection: EditorSelection.range(selection.anchor, selection.head),
        scrollIntoView: true,
        userEvent: block.frontmatter && !forward
            ? FRONTMATTER_UPWARD_REVEAL_USER_EVENT
            : 'select',
    });
    return true;
}

/** Reveal hidden Properties source only in response to an upward motion. */
function revealFrontmatterForUpwardMotion(view) {
    const frontmatter = vimFrontmatterRange(view?.state?.doc);
    const selection = view?.state?.selection?.main;
    if (!frontmatter || !selection || selection.head > frontmatter.to) return false;
    if (view.dom.querySelector('.cm-frontmatter-source-line')) return false;
    view.dispatch({ userEvent: FRONTMATTER_UPWARD_REVEAL_USER_EVENT });
    return true;
}

function vimRenderedBlockNavigationExtension() {
    return Prec.highest(EditorView.domEventHandlers({
        keydown: (event, view) => {
            if (!vimActive || event.altKey || event.ctrlKey || event.metaKey
                || event.defaultPrevented || (event.key !== 'j' && event.key !== 'k')) return false;
            const vimState = vimStateFor(view);
            if (!vimState || vimState.insertMode || vimState.inputState?.operatorShortcut
                || (vimState.inputState?.keyBuffer?.length || 0) > 0) return false;
            const forward = event.key === 'j';
            if (!forward && revealFrontmatterForUpwardMotion(view)) {
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
            const block = adjacentVimRenderedBlock(view, forward);
            const frontmatterEntry = block?.frontmatter && !forward;
            if (!block || (!frontmatterEntry
                && !vimRevealBlocksRequested
                && (!vimState.visualMode || block.kind !== 'source'))) return false;
            if (!enterAdjacentRenderedBlock(view, forward, Boolean(vimState.visualMode), block)) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
        },
    }));
}

/**
 * Preserve Vim's source-line edge semantics before its compatibility adapter
 * asks a native webview for vertical geometry. Display-row mappings perform
 * their own candidate check because they may still move within a wrapped
 * first or last source line.
 */
function vimSourceBoundaryExtension() {
    return Prec.highest(EditorView.domEventHandlers({
        keydown: (event, view) => {
            if (!vimActive || vimVisualRowsRequested || event.altKey || event.ctrlKey
                || event.metaKey || event.defaultPrevented) return false;
            const forward = event.key === 'j' || event.key === 'ArrowDown';
            if (!forward && event.key !== 'k' && event.key !== 'ArrowUp') return false;

            const vimState = vimStateFor(view);
            if (!vimState || vimState.insertMode || vimState.inputState?.operatorShortcut
                || (vimState.inputState?.keyBuffer?.length || 0) > 0) return false;
            const headLine = view.state.doc.lineAt(view.state.selection.main.head).number;
            if ((forward && headLine !== view.state.doc.lines) || (!forward && headLine !== 1)) return false;

            if (!forward && revealFrontmatterForUpwardMotion(view)) {
                event.preventDefault();
                event.stopPropagation();
                return true;
            }

            event.preventDefault();
            event.stopPropagation();
            return true;
        },
    }));
}

function mermaidEditorInputProfile(mainView) {
    if (!vimActive) return null;
    const modeClassCompartment = new Compartment();
    return {
        extensions: [
            vim(),
            vimSourceBoundaryExtension(),
            modeClassCompartment.of(vimModeClassExtension('normal')),
        ],
        capturesEscape(modalView, event) {
            return Boolean(modalView?.dom.contains(event.target));
        },
        attach(modalView, { apply, cancel }) {
            const cm = getCM(modalView);
            const syncMode = event => {
                const mode = vimModeFromEvent(event, cm);
                updateVimStatus(mode);
                syncRootVimModeClasses(modalView, mode, modeClassCompartment);
            };
            updateVimStatus('normal');
            syncRootVimModeClasses(modalView, 'normal', modeClassCompartment);
            cm?.on('vim-mode-change', syncMode);

            Vim.defineEx('write', 'w', apply);
            Vim.defineEx('quit', 'q', cancel);
            Vim.defineEx('wq', 'wq', apply);
            Vim.defineEx('xit', 'x', apply);
            return () => {
                cm?.off('vim-mode-change', syncMode);
                registerVimExCommands(Vim);
                const rootMode = vimModeForCM(vimModeCM);
                syncRootVimModeClasses(mainView, rootMode);
                updateVimStatus(rootMode);
            };
        },
    };
}

const markdownBlockGuidesExtension = createMarkdownBlockGuidesExtension({
    openMermaidEditor: (view, guide) => {
        const block = scanDiagramFences(view.state.doc).find(candidate => (
            candidate.lang === 'mermaid' && candidate.from === guide.from
        ));
        if (!block) return;
        openMermaidEditor(view, block, {
            inputProfile: mermaidEditorInputProfile(view),
        });
    },
});

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
 * Return the adjacent source-line position when the browser's visual cursor
 * calculation unexpectedly stalls or skips multiple document lines.
 */
export function adjacentLinePositionForUnexpectedVerticalSkip(document, beforePosition, afterPosition, forward) {
    const sourceLine = document.lineAt(beforePosition);
    const movedLine = document.lineAt(afterPosition);
    const targetNumber = sourceLine.number + (forward ? 1 : -1);
    if (targetNumber < 1 || targetNumber > document.lines) return null;

    const targetLine = document.line(targetNumber);
    return unexpectedVerticalMotionTarget({
        beforePosition,
        afterPosition,
        sourceLineNumber: sourceLine.number,
        movedLineNumber: movedLine.number,
        sourceLineColumn: beforePosition - sourceLine.from,
        totalLines: document.lines,
        adjacentLineFrom: targetLine.from,
        adjacentLineTo: targetLine.to,
        forward,
    });
}

/** A folded range intentionally turns several source lines into one visual row. */
function verticalMovementCrossesFoldedRange(state, beforePosition, afterPosition) {
    const beforeLine = state.doc.lineAt(beforePosition);
    const afterLine = state.doc.lineAt(afterPosition);
    if (Math.abs(afterLine.number - beforeLine.number) <= 1) return false;

    const upperLine = beforeLine.number < afterLine.number ? beforeLine : afterLine;
    const lowerLine = beforeLine.number < afterLine.number ? afterLine : beforeLine;
    const gapFrom = upperLine.to;
    const gapTo = lowerLine.from;
    let covered = false;
    foldedRanges(state).between(gapFrom, gapTo, (from, to) => {
        if (from <= gapFrom && to >= gapTo - 1) covered = true;
    });
    return covered;
}

/**
 * CodeMirror may report the hidden end of a folded range when moving upward
 * from the next visible row. Normalize that logical endpoint back onto the
 * visible heading while preserving the requested source column.
 */
function visibleFoldBoundaryTarget(state, beforePosition, afterPosition, forward) {
    if (forward || afterPosition >= beforePosition) return null;
    const sourceLine = state.doc.lineAt(beforePosition);
    const sourceColumn = beforePosition - sourceLine.from;
    let target = null;
    foldedRanges(state).between(
        Math.max(0, sourceLine.from - 2),
        sourceLine.from,
        (from, to) => {
            if (to < sourceLine.from - 1 || afterPosition > to || beforePosition <= to) return;
            const headingLine = state.doc.lineAt(from);
            target = headingLine.from + Math.min(sourceColumn, headingLine.length);
        },
    );
    return target;
}

/**
 * Preserve CodeMirror's normal visual-line movement, but contain any remaining
 * engine-specific height-map error to one source line. Correct widget geometry
 * is the primary fix; this is a last-resort guard for desktop webviews.
 */
export function moveCursorVerticallySafely(view, forward) {
    const before = view.state.selection.main;
    if (!before.empty || view.state.selection.ranges.length !== 1) return false;
    if (!forward && revealFrontmatterForUpwardMotion(view)) return true;

    const sourceLine = view.state.doc.lineAt(before.head);
    const blockedAtBoundary = verticalBoundaryTarget({
        beforePosition: before.head,
        afterPosition: before.head,
        sourceLineNumber: sourceLine.number,
        movedLineNumber: sourceLine.number,
        sourceLineFrom: sourceLine.from,
        sourceLineTo: sourceLine.to,
        totalLines: view.state.doc.lines,
        documentLength: view.state.doc.length,
        forward,
    });
    if (blockedAtBoundary !== null) return true;

    // Inspect a fold before a command dispatch can place its selection inside
    // hidden source (which CodeMirror correctly interprets as an unfold). Keep
    // the long-established command path for every ordinary visual row.
    if (foldedRanges(view.state).size) {
        let foldedMove = view.moveVertically(before, forward);
        if (foldedMove.head === before.head) {
            foldedMove = view.moveToLineBoundary(before, forward);
        }
        const foldBoundaryTarget = visibleFoldBoundaryTarget(
            view.state,
            before.head,
            foldedMove.head,
            forward,
        );
        if (foldBoundaryTarget !== null
            || verticalMovementCrossesFoldedRange(view.state, before.head, foldedMove.head)) {
            view.dispatch({
                selection: foldBoundaryTarget === null
                    ? foldedMove
                    : EditorSelection.cursor(
                        foldBoundaryTarget,
                        foldedMove.assoc,
                        foldedMove.bidiLevel,
                        foldedMove.goalColumn,
                    ),
                scrollIntoView: true,
                userEvent: 'select',
            });
            if (!forward) revealFrontmatterForUpwardMotion(view);
            return true;
        }
    }

    const move = forward ? cursorLineDown : cursorLineUp;
    if (!move(view)) {
        const stalledTarget = adjacentLinePositionForUnexpectedVerticalSkip(
            view.state.doc,
            before.head,
            before.head,
            forward,
        );
        if (stalledTarget === null) return false;
        view.dispatch({
            selection: EditorSelection.cursor(
                stalledTarget,
                before.assoc,
                before.bidiLevel,
                before.goalColumn,
            ),
            scrollIntoView: true,
            userEvent: 'select',
        });
        if (!forward) revealFrontmatterForUpwardMotion(view);
        return true;
    }

    const after = view.state.selection.main;
    const movedLine = view.state.doc.lineAt(after.head);
    const boundaryTarget = verticalBoundaryTarget({
        beforePosition: before.head,
        afterPosition: after.head,
        sourceLineNumber: sourceLine.number,
        movedLineNumber: movedLine.number,
        sourceLineFrom: sourceLine.from,
        sourceLineTo: sourceLine.to,
        totalLines: view.state.doc.lines,
        documentLength: view.state.doc.length,
        forward,
    });
    const targetPosition = boundaryTarget ?? adjacentLinePositionForUnexpectedVerticalSkip(
        view.state.doc,
        before.head,
        after.head,
        forward
    );
    if (targetPosition === null) {
        if (!forward) revealFrontmatterForUpwardMotion(view);
        return true;
    }
    view.dispatch({
        selection: EditorSelection.cursor(
            targetPosition,
            after.assoc,
            after.bidiLevel,
            after.goalColumn,
        ),
        scrollIntoView: true,
        userEvent: 'select',
    });
    if (!forward) revealFrontmatterForUpwardMotion(view);
    return true;
}

/** Vim motion equivalent of gj/gk with the same stalled-height-map repair. */
function moveVimByVisualRows(cm, head, motionArgs, vimState) {
    const view = cm?.cm6;
    if (!view || !head) return head;

    if (vimState.lastMotion !== moveVimByVisualRows || !Number.isFinite(vimState.lastHSPos)) {
        vimState.lastHSPos = cm.charCoords(head, 'div').left;
    }

    const forward = Boolean(motionArgs.forward);
    const repeat = Math.max(1, Math.floor(Number(motionArgs.repeat) || 1));
    let range = EditorSelection.cursor(cm.indexFromPos(head), 1, undefined, vimState.lastHSPos);
    for (let index = 0; index < repeat; index += 1) {
        const before = range.head;
        const moved = view.moveVertically(range, forward);
        const sourceLine = view.state.doc.lineAt(before);
        const movedLine = view.state.doc.lineAt(moved.head);
        const crossedBoundary = verticalBoundaryTarget({
            beforePosition: before,
            afterPosition: moved.head,
            sourceLineNumber: sourceLine.number,
            movedLineNumber: movedLine.number,
            sourceLineFrom: sourceLine.from,
            sourceLineTo: sourceLine.to,
            totalLines: view.state.doc.lines,
            documentLength: view.state.doc.length,
            forward,
        }) !== null;
        const foldBoundaryTarget = visibleFoldBoundaryTarget(
            view.state,
            before,
            moved.head,
            forward,
        );
        const fallback = crossedBoundary
            ? before
            : foldBoundaryTarget ?? (
                verticalMovementCrossesFoldedRange(view.state, before, moved.head)
                    ? null
                    : adjacentLinePositionForUnexpectedVerticalSkip(
                        view.state.doc,
                        before,
                        moved.head,
                        forward,
                    )
            );
        range = fallback === null
            ? moved
            : EditorSelection.cursor(
                fallback,
                moved.assoc,
                moved.bidiLevel,
                moved.goalColumn ?? vimState.lastHSPos,
            );
    }

    const result = cm.posFromIndex(range.head);
    vimState.lastHPos = result.ch;
    return result;
}

function registerVimVisualRowMotions(api) {
    if (!api || vimVisualRowMotionsRegistered) return;
    api.defineMotion('figaroMoveByVisualRows', moveVimByVisualRows);
    api.mapCommand('<FigaroVisualDown>', 'motion', 'figaroMoveByVisualRows', { forward: true }, {});
    api.mapCommand('<FigaroVisualUp>', 'motion', 'figaroMoveByVisualRows', { forward: false }, {});
    vimVisualRowMotionsRegistered = true;
}

/**
 * Stop WebKitGTK from interpreting wheel overscroll as a jump to the opposite
 * document edge. Returning true lets CodeMirror cancel the native wheel event.
 */
export function handleVerticalBoundaryWheel(event, view) {
    const scroller = view?.scrollDOM;
    if (!scroller) return false;

    const target = verticalViewportBoundaryTarget({
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        deltaY: event?.deltaY,
        deltaMode: event?.deltaMode,
        lineHeight: view.defaultLineHeight,
    });
    if (target === null) return false;

    scroller.scrollTop = target;
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

    const tabSize = normalizeTabSize(metrics?.tabSize ?? metrics?.view?.state?.tabSize);
    const columns = expandedTabText(match[0], tabSize).columns;
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
            const expandedLeadingWhitespace = expandedTabText(match[1], tabSize).text;
            const expandedTrailingWhitespace = expandedTabText(
                metrics.trailingSourceWhitespace || '',
                tabSize,
                columns,
            ).text;
            context.font = sourceFont;
            const leadingWidth = context.measureText(
                expandedLeadingWhitespace + expandedTrailingWhitespace
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
    { view = null, markerVisible = false, tabSize = view?.state?.tabSize } = {}
) {
    const match = String(lineText ?? '').match(/^([ \t]{0,3})((?:>[ \t]?)+)/);
    if (!match) return null;

    const visibleMarkerPrefix = markerVisible ? match[2] : match[2].replace(/>/g, '');
    const visiblePrefix = match[1] + visibleMarkerPrefix;
    const expanded = expandedTabText(visiblePrefix, tabSize);
    const { columns } = expanded;
    const expandedPrefix = expanded.text;

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
 * (e.g. "Archive/file.md") are passed through as vault-relative.
 * E.g. "../../Archive/x.md" + current file "notes/daily/2025.md"
 *   → "Archive/x.md"
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
 * code remains "Tab". Normalize that one event so CodeMirror receives the
 * key binding instead of moving browser focus out of the editor.
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

function applyLinkedNoteCompletion(view, request, plan, path) {
    if (!view || view.isDestroyed) return false;
    const { from, to, expectedSource } = request;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from
        || to > view.state.doc.length || view.state.doc.sliceString(from, to) !== expectedSource) {
        return false;
    }
    const insert = linkedNoteCompletionInsertion(plan, path);
    if (!insert) return false;
    view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        annotations: Transaction.userEvent.of('input.complete'),
    });
    view.focus();
    return true;
}

async function completeLinkedNoteCreation(view, request, plan) {
    const outcome = await createLinkedNoteFromCompletion({
        tree: getState('fileTreeData') || [],
        plan,
        reviewName: options => reviewSameDirectoryNoteName({
            ...options,
            confirm: window.confirmDialog,
        }),
        createFile: (path, content) => backend().CreateFile(path, content),
        applyLink: path => applyLinkedNoteCompletion(view, request, plan, path),
        refreshTree: refreshFileTree,
        openExisting: handleFileOpen,
    });

    if (outcome.kind === 'failed') {
        await errorDialog('Couldn’t create linked note', outcome.error, 'The link text and existing notes were left unchanged.');
    } else if (outcome.kind === 'stale') {
        await errorDialog('Link text changed', 'The link text changed while the note choice was open.', 'Nothing was replaced. Try the link again.');
    } else if (outcome.kind === 'created-stale') {
        await errorDialog('Linked note created', `“${outcome.path}” was created, but the original link text changed before it could be completed.`, 'The new note is available in the file tree.');
    } else if (outcome.kind === 'created') {
        statusBar.set(`Created linked note: ${outcome.path}`);
        setTimeout(() => statusBar.set('Ready'), 2500);
    }
}

function safeReferenceHref(target) {
    const value = String(target || '').trim();
    if (!value || /^(?:javascript|vbscript|data):/i.test(value)) return '';
    try { return encodeURI(value); } catch (_) { return ''; }
}

class ReferenceLinkWidget extends WidgetType {
    constructor(link) {
        super();
        this.link = link;
    }

    eq(other) {
        return other.link.label === this.link.label && other.link.target === this.link.target;
    }

    toDOM() {
        const anchor = document.createElement('a');
        anchor.className = 'cm-link-widget cm-reference-link-widget';
        anchor.textContent = this.link.label;
        anchor.title = this.link.target;
        const href = safeReferenceHref(this.link.target);
        if (href) anchor.setAttribute('href', href);
        return anchor;
    }

    ignoreEvent() {
        return false;
    }
}

function referenceLinkPlugin() {
    const buildDecorations = view => {
        const state = view.state;
        const definitions = markdownReferenceDefinitions(state.doc.toString());

        const decorations = [];
        const seen = new Set();
        const isDragging = state.field(mouseSelectingField, false);
        for (const range of view.visibleRanges) {
            syntaxTree(state).iterate({
                from: range.from,
                to: range.to,
                enter: node => {
                    if (node.name !== 'Link') return;
                    const key = `${node.from}:${node.to}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    const source = state.doc.sliceString(node.from, node.to);
                    const reference = markdownReferenceLink(source);
                    if (!reference) return;
                    const resolved = resolveMarkdownReferenceLink(source, definitions);
                    if (!resolved) {
                        decorations.push(Decoration.mark({ class: 'cm-unresolved-reference' }).range(node.from, node.to));
                        return;
                    }
                    if (shouldShowSource(state, node.from, node.to) || isDragging) {
                        decorations.push(Decoration.mark({
                            class: 'cm-reference-link-source',
                            attributes: {
                                'data-reference-label': resolved.label,
                                'data-reference-target': resolved.target,
                            },
                        }).range(node.from, node.to));
                        return;
                    }
                    decorations.push(Decoration.replace({
                        widget: new ReferenceLinkWidget(resolved),
                    }).range(node.from, node.to));
                },
            });
        }
        return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
    };

    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.decorations = buildDecorations(view);
        }

        update(update) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = buildDecorations(update.view);
                return;
            }
            const dragging = update.state.field(mouseSelectingField, false);
            const wasDragging = update.startState.field(mouseSelectingField, false);
            if (dragging !== wasDragging) this.decorations = buildDecorations(update.view);
        }
    }, { decorations: value => value.decorations });
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

    // CodeMirror marks its complete gutter rail aria-hidden because line
    // numbers and ordinary markers are decorative. Fold arrows and Markdown
    // block controls are real controls, so expose only that interactive gutter.
    const foldGutterAccessibilityPlugin = ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.sync();
            queueMicrotask(() => this.sync());
        }

        update() {
            this.sync();
            queueMicrotask(() => this.sync());
        }

        sync() {
            if (this.view.isDestroyed) return;
            for (const gutters of this.view.dom.querySelectorAll('.cm-gutters')) {
                const interactiveGutters = [...gutters.querySelectorAll(
                    '.cm-markdownBlockGutter, .cm-foldGutter',
                )];
                if (!interactiveGutters.length) {
                    gutters.setAttribute('aria-hidden', 'true');
                    continue;
                }
                gutters.removeAttribute('aria-hidden');
                for (const gutter of gutters.querySelectorAll(':scope > .cm-gutter')) {
                    if (interactiveGutters.includes(gutter)) {
                        gutter.removeAttribute('aria-hidden');
                        gutter.setAttribute('role', 'group');
                        gutter.setAttribute('aria-label', gutter.classList.contains('cm-markdownBlockGutter')
                            ? 'Markdown block controls'
                            : 'Code folding');
                    } else {
                        gutter.setAttribute('aria-hidden', 'true');
                    }
                }
            }
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
            if (update.docChanged || update.geometryChanged || update.viewportChanged
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
            if (update.docChanged || update.geometryChanged || update.viewportChanged
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

    const fileLinkCompletions = async ctx => {
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
        // Empty link completions remain recency-based. Once the user types,
        // use the same native relevance engine as global search so headings,
        // paths, accents, prefixes, and conservative typo matches agree.
        mdFiles.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        const rf = ls + match.fromOffset;
        let matchedFiles = mdFiles.slice(0, 10);
        if (rawPrefix) {
            try {
                const response = await backend().SearchNotes(rawPrefix, {
                    case_sensitive: false,
                    title_only: false,
                    profile: 'links',
                    limit: 10,
                    suggest: false,
                });
                matchedFiles = (response?.results || []).map(file => ({
                    name: String(file.name || file.path?.split('/').pop() || file.path || '')
                        .replace(/\.md$/i, ''),
                    path: file.path,
                    mtime: file.mtime || 0,
                })).filter(file => file.path);
            } catch {
                matchedFiles = mdFiles
                    .filter(file => file.name.toLowerCase().startsWith(prefix)
                        || file.path.toLowerCase().startsWith(prefix))
                    .slice(0, 10);
            }
        }
        const options = matchedFiles.map(f => ({
            label: f.name, detail: f.path,
            apply: (view, comp, from, to) => {
                const rep = noteLinkCompletion(getLinkStylePreference(), f);
                view.dispatch({ changes: { from, to, insert: rep }, selection: { anchor: from + rep.length } });
            }
        }));
        const activeTab = getActiveTab();
        const creationPlan = planLinkedNoteCompletion({
            label: rawPrefix,
            currentPath: activeTab?.type === 'file' ? activeTab.path : '',
            style: getLinkStylePreference(),
        });
        if (shouldOfferLinkedNoteCreation(creationPlan, mdFiles)) {
            options.push({
                label: `Create “${creationPlan.label}”`,
                detail: `New note · ${creationPlan.path}`,
                type: 'text',
                boost: -100,
                apply: (view, _completion, from, to) => {
                    const request = {
                        from,
                        to,
                        expectedSource: view.state.doc.sliceString(from, to),
                    };
                    void completeLinkedNoteCreation(view, request, creationPlan);
                },
            });
        }
        if (!options.length) return null;
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

    const hashtagCompletionActivator = ViewPlugin.fromClass(class {
        update(update) {
            if (!update.docChanged || !update.state.selection.main.empty) return;
            const typed = update.transactions.some(transaction => transaction.isUserEvent?.('input.type'));
            if (!typed) return;
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            if (!/\s#[a-zA-Z0-9_-]*$/.test(update.state.doc.sliceString(line.from, head))) return;
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
    const taskDueDateCompletions = createTaskDueDateCompletionSource({
        getColumns: () => getState('kanbanCompletionColumns') || [],
        restartCompletion: startCompletion,
        contextAllowed: hashtagCompletionContextAllowed,
        openPicker: ({ view, position, now, onSelect }) => {
            const anchorRect = view.coordsAtPos(position) || view.contentDOM.getBoundingClientRect();
            openDatePicker({
                anchor: view.contentDOM,
                anchorRect,
                now,
                onSelect,
            });
        },
    });

    // CodeMirror owns GFM syntax awareness; this field only supplies a
    // source-preserving semantic preview for an unfocused table range.
    let markdownTableField = [];
    if (StateField && EditorView && WidgetType && shouldShowSource && mouseSelectingField) {
        try { markdownTableField = createMarkdownTableField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField); } catch (error) { log.warn('[table] create failed: ' + (error.message || error)); }
    }
    vimCompartment = new Compartment();
    imageBasePathCompartment = new Compartment();
    readOnlyCompartment = new Compartment();
    fileModeCompartment = new Compartment();
    foldingCompartment = new Compartment();
    lineNumbersCompartment = new Compartment();
    markdownLintCompartment = new Compartment();
    spellcheckCompartment = new Compartment();
    tabSizeCompartment = new Compartment();
    historyCompartment = new Compartment();

    const markdownExtensionsForPath = () => [
        collapseOnSelectionFacet.of(true),
        mouseSelectingField,
        vimRenderedBlockNavigationExtension(),
        EditorView.lineWrapping,
        stickyHeadingScrollMargins,
        markdownLintCompartment.of(markdownLintRequested ? [linter(markdownDocumentLinter, { delay: 500 })] : []),
        spellcheckCompartment.of(spellcheckRequested ? [linter(createSpellcheckLinter(spellcheckLanguageRequested), { delay: 700 })] : []),
        autocompletion({
            interactionDelay: 0,
            override: [
                frontmatterCompletions,
                taskDueDateCompletions,
                dateShortcutCompletions,
                headingLinkCompletions,
                fileLinkCompletions,
                imageCompletions,
            ],
        }),
        markdownLanguage,
        EditorView.domEventHandlers({ paste: handlePlainPasteBypass }),
        pasteURLAsLink,
        markdownStylePlugin,
        headingLinkCompletionActivator,
        hashtagCompletionActivator,
        livePreviewPlugin,
        editorTheme,
        ...(Array.isArray(frontmatterField) ? frontmatterField : [frontmatterField]),
        linkPlugin({
            onWikiLinkClick: target => handleLinkClick(normalizeWikiLinkTarget(target), target, true),
        }),
        referenceLinkPlugin(),
        linkPreview(),
        ...codeBlockField({ lineNumbers: true, skipLanguages: diagramLanguages }),
        ...(Array.isArray(diagramField) ? diagramField : [diagramField]),
        ...(Array.isArray(markdownTableField) ? markdownTableField : [markdownTableField]),
        mathField,
        sourceFootprintExtension,
        hexColorExtension,
        hashtagPlugin,
        widgetPlugin,
        extrasPlugin,
        emptyLinkAutofillPlugin,
        EditorView.domEventHandlers({
            mousedown: handleMouseDown,
            click: handleClick,
            wheel: handleVerticalBoundaryWheel,
            keydown: handlePlainPasteKeydown,
            keyup: handlePlainPasteKeyup,
            copy: (event, view) => activeFileLanguage.kind === 'markdown'
                && handleMarkdownClipboardCopy(event, view),
            paste: (event, view) => handleClipboardPaste(event, view, {
                markdown: activeFileLanguage.kind === 'markdown',
                protectedContext: markdownRichPasteProtectedContext(view.state),
            }),
            drop: handleExternalFileDrop,
        }),
        Prec.high(keymap.of([
            { key: 'ArrowUp', run: view => moveCursorVerticallySafely(view, false), preventDefault: true },
            { key: 'ArrowDown', run: view => moveCursorVerticallySafely(view, true), preventDefault: true },
        ])),
        keymap.of(lintKeymap),
        keymap.of(figaroMarkdownKeymap),
    ];
    const codeExtensionsForSupport = (support) => [
        ...(support ? [support] : []),
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
            vimSourceBoundaryExtension(),
            vimCompartment.of([]),
            readOnlyCompartment.of([]),
            tabSizeCompartment.of(editorTabSizeExtensions()),
            imageBasePathCompartment.of(imageField({ basePath: '/vault/' })),
            fileModeCompartment.of(markdownExtensionsForPath()),
            lineNumbersCompartment.of(lineNumbersRequested ? [lineNumbers(), highlightActiveLineGutter()] : []),
            foldingCompartment.of(editorFoldingExtensions('markdown')),
            foldGutterAccessibilityPlugin,
            historyCompartment.of(history()), bracketMatching(), drawSelection(),
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
    syncEditorAccessibleLabel();

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

function editorHistoryTab(tabId) {
    if (tabId == null) return null;
    return (getState('openTabs') || []).find(tab => tab?.id === tabId && tab.type === 'file') || null;
}

function captureEditorHistory(view, tabId) {
    const tab = editorHistoryTab(tabId);
    if (!tab || !view.state.field(historyField, false)) return;
    editorHistoryByTab.set(tab, view.state.toJSON({ history: historyField }));
}

function historyExtensionsForDocument(request) {
    const tab = editorHistoryTab(request.tabId);
    const saved = tab ? editorHistoryByTab.get(tab) : null;
    if (!saved || saved.doc !== request.content || !saved.history) {
        if (tab && saved) editorHistoryByTab.delete(tab);
        return history();
    }

    try {
        const restoredState = EditorState.fromJSON(saved, {
            extensions: [history()],
        }, { history: historyField });
        const restoredHistory = restoredState.field(historyField);
        return [history(), historyField.init(() => restoredHistory)];
    } catch (error) {
        editorHistoryByTab.delete(tab);
        log.warn('Could not restore editor undo history:', error);
        return history();
    }
}

function dispatchEditorContent(view, request, excludeFromHistory = false) {
    _programmaticChange = true;
    const selection = normalizedCursorState(request.cursorState, request.content.length);
    view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: request.content },
        ...(selection ? { selection, scrollIntoView: true } : { scrollIntoView: false }),
        ...(excludeFromHistory
            ? { annotations: Transaction.addToHistory.of(false) }
            : {}),
    });
}

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
    switchDocument(view, request, contentChanged) {
        captureEditorHistory(view, request.previousTabId);
        view.dispatch({ effects: historyCompartment.reconfigure([]) });
        try {
            if (contentChanged) dispatchEditorContent(view, request, true);
            view.dispatch({
                effects: historyCompartment.reconfigure(historyExtensionsForDocument(request)),
            });
        } catch (error) {
            _programmaticChange = false;
            if (!view.isDestroyed) {
                try {
                    view.dispatch({ effects: historyCompartment.reconfigure(history()) });
                } catch (restoreError) {
                    log.warn('Could not recover editor undo history:', restoreError);
                }
            }
            throw error;
        }
    },
    applyContent(view, request) {
        dispatchEditorContent(view, request);
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
 * document into A's editor. A different tab also swaps to that buffer's own
 * undo history, so document replacement can never be replayed across buffers.
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
    syncEditorAccessibleLabel();
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
    const foldingExtensions = language.kind === 'plain'
        ? []
        : editorFoldingExtensions(language.kind);
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

/** Toggle Markdown's typed block-guide gutter without affecting code folds. */
function setMarkdownBlockGuides(enabled) {
    markdownBlockGuidesRequested = Boolean(enabled);
    const view = getEditorView();
    if (!view || !foldingCompartment || activeFileLanguage.kind !== 'markdown') return;
    view.dispatch({
        effects: foldingCompartment.reconfigure(editorFoldingExtensions('markdown')),
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
            markdownLintRequested ? [linter(markdownDocumentLinter, { delay: 500 })] : []
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
    if (navigation.action === 'missing-return') {
        statusBar.set(`No return location for footnote: [^${navigation.label}]`);
        setTimeout(() => statusBar.clear(), 1800);
        return true;
    }

    if (navigation.action === 'definition' || navigation.action === 'create-definition') {
        footnoteReturnPositions.set(key, navigation.returnPosition);
    }
    if (navigation.action === 'create-definition') {
        view.dispatch({
            changes: { from: navigation.insertAt, insert: navigation.insert },
            selection: { anchor: navigation.target },
            scrollIntoView: true,
            userEvent: 'input',
        });
        view.focus();
        return true;
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
                    handleLinkClick(
                        decodeURI(href),
                        linkEl.textContent,
                        replaceCurrent,
                        markdownLinkEditForClick(view, position, linkEl)
                    );
                }
            }
        }
        return true;
    }

    const referenceSource = event.target.closest('.cm-reference-link-source');
    if (referenceSource) {
        const target = referenceSource.dataset.referenceTarget;
        const label = referenceSource.dataset.referenceLabel || referenceSource.textContent;
        if (target) {
            event.preventDefault();
            if (/^https?:\/\//i.test(target)) window.open(target, '_blank');
            else handleLinkClick(target, label, replaceCurrent);
            return true;
        }
    }

    const pos = position;
    if (pos === null) return;
    if (event.button === 0 && handleFootnoteNavigation(event, view, pos)) return true;
    const doc = view.state.doc, line = doc.lineAt(pos), lt = line.text, col = pos - line.from;
    const navigation = markdownEditorNavigationAtPosition(lt, col);
    if (navigation?.kind === 'link') {
        event.preventDefault();
        handleLinkClick(navigation.target, navigation.label, replaceCurrent, {
            from: line.from + navigation.destinationFrom,
            to: line.from + navigation.destinationTo,
            target: navigation.target,
        });
        return true;
    }
    if (navigation?.kind === 'hashtag') {
        event.preventDefault();
        openTab('kanban-board', 'Kanban', 'kanban', { focusCol: navigation.tag });
        return true;
    }
    const wiki = wikiLinkAtPosition(lt, col);
    if (wiki) {
        event.preventDefault();
        handleLinkClick(normalizeWikiLinkTarget(wiki.target), wiki.label, replaceCurrent);
        return true;
    }
}

function markdownLinkEditForClick(view, coordinatePosition, linkElement) {
    const positions = [];
    if (Number.isInteger(coordinatePosition)) positions.push(coordinatePosition);
    try {
        const domPosition = view.posAtDOM(linkElement, 0);
        if (Number.isInteger(domPosition) && !positions.includes(domPosition)) positions.push(domPosition);
    } catch {
        // A detached widget has no stable source position.
    }
    for (const position of positions) {
        const bounded = Math.max(0, Math.min(position, view.state.doc.length));
        const line = view.state.doc.lineAt(bounded);
        const link = markdownLinkDestinationAtPosition(line.text, bounded - line.from);
        if (link) {
            return {
                from: line.from + link.destinationFrom,
                to: line.from + link.destinationTo,
                target: link.target,
            };
        }
    }
    return null;
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

function writeVimUnnamedRegisterToSystemClipboard(text) {
    const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard;
    if (!text || typeof clipboard?.writeText !== 'function') return;
    try {
        Promise.resolve(clipboard.writeText(text)).catch(error => {
            log.debug?.('Could not synchronize the Vim register to the OS clipboard:', error);
        });
    } catch (error) {
        log.debug?.('Could not synchronize the Vim register to the OS clipboard:', error);
    }
}

function installVimClipboardControllerBridge(api) {
    const controller = api?.getRegisterController?.();
    if (!controller || vimClipboardControllers.has(controller)) return;

    const pushText = controller.pushText;
    controller.pushText = function bridgedVimRegisterPush(registerName, ...args) {
        const result = pushText.call(this, registerName, ...args);
        if (!registerName || registerName === '"') {
            writeVimUnnamedRegisterToSystemClipboard(this.unnamedRegister?.toString?.() || '');
        }
        return result;
    };
    vimClipboardControllers.add(controller);
}

async function replayVimClipboardPaste(cm, actionArgs) {
    if (actionArgs?.registerName && actionArgs.registerName !== '"') {
        for (const key of vimPasteReplayKeys(actionArgs)) {
            vimAPI.handleKey(cm, key, 'mapping');
        }
        return;
    }

    const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard;
    let systemText = '';
    if (typeof clipboard?.readText === 'function') {
        try {
            systemText = await clipboard.readText();
        } catch (_) {
            // The unnamed register remains the deterministic fallback when a
            // desktop webview denies or intermittently loses clipboard access.
        }
    }
    if (!cm?.cm6 || cm.cm6.isDestroyed) return;

    const controller = vimAPI?.getRegisterController?.();
    const register = controller?.unnamedRegister;
    if (!register) return;
    const plan = planVimClipboardPaste({
        systemText,
        internalText: register.toString(),
        internalLinewise: register.linewise,
        internalBlockwise: register.blockwise,
    });
    if (!plan.text) return;
    const linkInsertion = plan.source === 'system' && cm.state?.vim?.visualMode
        ? markdownURLPasteInsertion(cm.cm6.state, plan.text)
        : null;
    if (linkInsertion) register.setText(linkInsertion, false, false);
    else if (plan.updateRegister) register.setText(plan.text, plan.linewise, plan.blockwise);

    for (const key of vimPasteReplayKeys(actionArgs)) {
        vimAPI.handleKey(cm, key, 'mapping');
    }
}

function registerVimClipboardBridge(api) {
    if (!api) return;
    installVimClipboardControllerBridge(api);
    if (vimClipboardMappingsRegistered) return;

    api.mapCommand(vimPasteKeys.after, 'action', 'paste', {
        after: true,
        isEdit: true,
    }, { isEdit: true });
    api.mapCommand(vimPasteKeys.before, 'action', 'paste', {
        after: false,
        isEdit: true,
    }, { isEdit: true });
    api.defineAction('figaroClipboardPaste', (cm, actionArgs) => {
        void replayVimClipboardPaste(cm, actionArgs);
    });
    api.mapCommand('p', 'action', 'figaroClipboardPaste', { after: true }, {});
    api.mapCommand('P', 'action', 'figaroClipboardPaste', { after: false }, {});
    vimClipboardMappingsRegistered = true;
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
            const internal = items.some(item => Array.from(item?.types || [])
                .some(type => String(type).toLowerCase() === FIGARO_MARKDOWN_CLIPBOARD_TYPE));
            for (const item of items) {
                if (Array.from(item?.types || []).some(type =>
                    String(type).toLowerCase().startsWith('image/')
                )) return pasteClipboardItemImage(view, item);
            }

            const htmlItem = items.find(item => Array.from(item?.types || []).includes('text/html'));
            const csvItem = items.find(item => Array.from(item?.types || []).includes('text/csv'));
            const tsvItem = items.find(item => Array.from(item?.types || []).includes('text/tab-separated-values'));
            const plainItem = items.find(item => Array.from(item?.types || []).includes('text/plain'));
            const textItem = tsvItem || csvItem || plainItem;
            const mimeType = tsvItem ? 'text/tab-separated-values' : csvItem ? 'text/csv' : 'text/plain';
            const html = htmlItem ? await (await htmlItem.getType('text/html')).text() : '';
            const text = textItem ? await (await textItem.getType(mimeType)).text() : '';
            if (text && pasteMarkdownURLAsLink(view, text)) return true;
            if ((html || text) && pasteClipboardPayload(view, {
                html,
                text,
                internal,
                mimeType: html ? 'text/html' : mimeType,
                tabularMimeType: html && (tsvItem || csvItem) ? mimeType : '',
            }, {
                markdown: true,
                protectedContext: markdownRichPasteProtectedContext(view.state),
            })) return true;
        } catch (_) {
            // Keyboard paste events remain the most compatible image path in
            // embedded webviews; continue to text/legacy fallbacks here.
        }
    }
    if (typeof clipboard?.readText === 'function') {
        try {
            const text = await clipboard.readText();
            if (text && pasteMarkdownURLAsLink(view, text)) return true;
            return pasteClipboardPayload(view, { text, mimeType: 'text/plain' }, {
                markdown: activeFileLanguage.kind === 'markdown',
                protectedContext: activeFileLanguage.kind === 'markdown'
                    && markdownRichPasteProtectedContext(view.state),
            });
        } catch (_) {
            // Fall back for embedded runtimes that expose only the legacy API.
        }
    }

    view.focus?.();
    return typeof document !== 'undefined' && typeof document.execCommand === 'function' && document.execCommand('paste') === true;
}

function handleContextMenu(event, view) {
    event.preventDefault();

    const keyboardInvocation = !event.clientX && !event.clientY;
    const pos = keyboardInvocation
        ? view.state.selection.main.head
        : view.posAtCoords({ x: event.clientX, y: event.clientY });
    const caret = keyboardInvocation ? view.coordsAtPos(pos) : null;
    const menuEvent = keyboardInvocation ? {
        clientX: caret?.left || view.dom.getBoundingClientRect().left + 16,
        clientY: caret?.bottom || view.dom.getBoundingClientRect().top + 24,
    } : event;
    if (pos !== null && !shouldPreserveSelectionForContextMenu(view.state.selection, pos)) {
        view.dispatch({ selection: { anchor: pos, head: pos } });
    }

    const existing = document.querySelector('.editor-context-menu');
    if (existing) dismissContextMenu(existing, { restoreFocus: false });
    const requestId = ++contextMenuRequestId;
    const showMenu = suggestion => {
        if (requestId !== contextMenuRequestId || view.isDestroyed) return;
        showEditorContextMenu(menuEvent, view, suggestion);
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
        <div class="ui-menu-separator context-menu-separator"></div>
        <button type="button" class="ui-menu-item context-menu-item${selectionDisabledClass}" data-action="convert-table"${selectionDisabledAttribute}${hasSelection ? '' : ' disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16M15 4v16"/></svg>
            Convert selection to table…
        </button>` : '';
    const previewActions = activeTab?.path?.toLowerCase().endsWith('.md') ? `
        <div class="ui-menu-separator context-menu-separator"></div>
        <button type="button" class="ui-menu-item context-menu-item" data-action="preview-raw-text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
            Preview Raw Text
        </button>
        <button type="button" class="ui-menu-item context-menu-item" data-action="preview-pdf">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M8 15h8M8 18h6"/></svg>
            Preview PDF
        </button>` : '';

    const menu = document.createElement('div');
    menu.className = 'ui-menu context-menu editor-context-menu';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    menu.innerHTML = `
        <button type="button" class="ui-menu-item context-menu-item${selectionDisabledClass}" data-action="cut"${selectionDisabledAttribute}${hasSelection ? '' : ' disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/></svg>
            Cut
        </button>
        <button type="button" class="ui-menu-item context-menu-item${selectionDisabledClass}" data-action="copy"${selectionDisabledAttribute}${hasSelection ? '' : ' disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
        </button>
        <button type="button" class="ui-menu-item context-menu-item" data-action="paste">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            Paste
        </button>
        ${convertTableAction}
        <div class="ui-menu-separator context-menu-separator"></div>
        <button type="button" class="ui-menu-item context-menu-item" data-action="select-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
            Select All
        </button>
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

    const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) dismissContextMenu(menu, { restoreFocus: false });
    };
    configureContextMenu(menu, {
        label: 'Editor actions',
        returnFocus: view.contentDOM,
        onDismiss: () => document.removeEventListener('click', closeHandler),
    });

    menu.addEventListener('click', async (ev) => {
        const item = ev.target.closest('.context-menu-item');
        if (!item || item.classList.contains('disabled') || item.getAttribute('aria-disabled') === 'true') return;
        dismissContextMenu(menu, { restoreFocus: true });
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
        } else if (action === 'preview-raw-text') {
            try {
                await openRawTextPreview({
                    path: activeTab.path,
                    title: activeTab.title,
                    content: view.state.doc.toString(),
                });
            } catch (error) {
                log.error('Raw text preview failed:', error);
                await errorDialog('Raw text preview couldn’t open', error, 'Could not open the raw text preview.');
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

    setTimeout(() => {
        if (menu.isConnected) document.addEventListener('click', closeHandler);
    }, 0);
}

function appendSpellcheckSuggestionItems(menu, spellcheckSuggestion) {
    if (!spellcheckSuggestion) return;

    const section = document.createDocumentFragment();
    const label = document.createElement('div');
    label.className = 'ui-menu-label context-menu-label';
    label.textContent = 'Spelling suggestions';
    section.appendChild(label);

    if (spellcheckSuggestion.suggestions.length) {
        for (const suggestion of spellcheckSuggestion.suggestions) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'ui-menu-item context-menu-item context-menu-item--spelling-suggestion';
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
        empty.className = 'ui-menu-item context-menu-item context-menu-item--spelling-empty disabled';
        empty.textContent = 'No suggestions found';
        section.appendChild(empty);
    }

    const separator = document.createElement('div');
    separator.className = 'ui-menu-separator context-menu-separator';
    section.appendChild(separator);
    menu.prepend(section);
}

async function handleLinkClick(linkPath, linkText, replaceCurrent = false, linkEdit = null) {
    // Decode any percent-encoded characters (e.g., %20 → space) for file operations
    try { linkPath = decodeURI(linkPath); } catch (e) { /* decode may fail */ }
    try { linkPath = decodeURI(linkPath); } catch (e) { /* double-decode safety */ }

    if (String(linkPath || '').startsWith('#')) {
        const view = getEditorView();
        const position = view
            ? markdownHeadingPosition(view.state.doc.toString(), linkPath)
            : null;
        if (view && Number.isInteger(position)) {
            view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
            view.focus();
        } else {
            statusBar.set(`Heading not found: ${linkPath}`);
            setTimeout(() => statusBar.clear(), 1800);
        }
        return true;
    }

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
            await openLinkedNote(linkPath, r, replaceCurrent);
        } else {
            const fileName = linkPath.split('/').pop();
            const fullPath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
            let creationConfirmed = false;
            if (linkEdit) {
                const review = await reviewMissingLinkedNote({
                    tree: getState('fileTreeData'),
                    targetPath: fullPath,
                    confirm: window.confirmDialog,
                    read: path => backend().ReadFile(path),
                    replaceTarget: path => replaceMarkdownLinkTarget(getEditorView(), linkEdit, path),
                    open: (path, existing) => openLinkedNote(path, existing, replaceCurrent),
                });
                if (review === 'used-existing' || review === 'cancelled') return;
                if (review === 'stale') {
                    await errorDialog('Link changed', 'The link changed while the note choice was open.', 'Nothing was replaced. Try the link again.');
                    return;
                }
                if (review === 'unavailable') {
                    await errorDialog('Couldn’t open existing note', 'The similar note is no longer available.', 'Nothing was replaced. Refresh the file tree and try again.');
                    return;
                }
                creationConfirmed = review === 'create';
            }
            if (!creationConfirmed) {
                const msg = `The note “${fileName}” doesn’t exist yet.\n\nPath: ${fullPath}`;
                creationConfirmed = await window.confirmDialog('Create this note?', msg, false, false, {
                    icon: 'file-add',
                    confirmLabel: 'Create note',
                });
            }
            if (creationConfirmed) {
                const fpath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
                const fname = fpath.split('/').pop();
                const displayName = linkPath.endsWith('.md') ? fileName.replace('.md', '') : fileName;
                const created = await backend().CreateFile(fpath, `# ${displayName}\n\n`);
                if (!created?.success) {
                    await errorDialog('Couldn’t create note', created?.error, 'The linked note could not be created.');
                    return;
                }
                openTab(fpath, fname, 'file', { path: fpath, mtime: created.mtime || Date.now() / 1000 }, true);
                await refreshFileTree();
            }
        }
    } catch (err) { log.error('Failed to open link:', err, 'path was:', linkPath); }
}

async function openLinkedNote(path, file, replaceCurrent) {
    const tabs = getState('openTabs');
    const data = { path, mtime: file?.mtime };
    if (replaceCurrent && !tabs.find(tab => tab.id === path)) {
        await replaceCurrentFileTab(path, path.split('/').pop(), 'file', data);
    } else {
        openTab(path, path.split('/').pop(), 'file', data);
    }
}

export function replaceMarkdownLinkTarget(view, edit, existingPath) {
    if (!view || view.isDestroyed) return false;
    const change = planMarkdownLinkTargetReplacement(view.state.doc.toString(), edit, existingPath);
    if (!change) return false;
    view.dispatch({ changes: change });
    return true;
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
    if (selection) {
        v.dispatch({
            selection,
            scrollIntoView: true,
            annotations: Transaction.addToHistory.of(false),
        });
    }
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
        registerVimVisualRowMotions(Vim);
        registerVimClipboardBridge(Vim);
        view.dispatch({ effects: vimCompartment.reconfigure(vim()) });
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
                updateVimStatus(e.mode);
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
    saveCursorState, restoreCursorState, toggleVim, isVimEnabled, setVimVisualRows, setVimRevealBlocks, setImageBasePath, setReadOnly, setLineNumbers, setMarkdownBlockGuides, setMarkdownLint, setSpellcheck,
    configureEditorForFile, getEditorTabSize, normalizeWebKitShiftTab, setEditorTabSize };

import { Transaction } from '@codemirror/state';

import { activateModal, createDialogShell, createPendingChangesNotice, errorDialog } from './dialogs.js';
import { makeEditorModalResizable } from './editorModalResize.js';
import { renderLucideIcon } from './lucideIcons.js';
import {
    applyMarkdownTableEditorAction,
    createMarkdownTableEditorState,
    markdownTableEditorActionState,
    markdownTableEditorCellValue,
    markdownTableEditorSelectedCells,
    markdownTableEditorSelection,
    markdownTableEditorSpanAt,
    serializeMarkdownTableEditorState,
    tableCellAddress,
    updateMarkdownTableEditorCell,
} from './core/markdownTableEditorModel.js';

const commandGroups = [
    {
        key: 'cells',
        label: 'Cells',
        row: 'primary',
        commands: [
            { action: 'merge', label: 'Merge selection', icon: 'Combine' },
            { action: 'split', label: 'Split cell', icon: 'Split' },
        ],
    },
    {
        key: 'rows',
        label: 'Rows',
        row: 'structure',
        commands: [
            { action: 'add-row-above', label: 'Above', icon: 'BetweenHorizontalStart' },
            { action: 'add-row-below', label: 'Below', icon: 'BetweenHorizontalEnd' },
        ],
    },
    {
        key: 'columns',
        label: 'Columns',
        row: 'structure',
        commands: [
            { action: 'add-column-before', label: 'Before', icon: 'BetweenVerticalStart' },
            { action: 'add-column-after', label: 'After', icon: 'BetweenVerticalEnd' },
        ],
    },
    {
        key: 'delete',
        label: 'Delete',
        row: 'structure',
        danger: true,
        commands: [
            { action: 'delete-row', label: 'Row', icon: 'Rows3' },
            { action: 'delete-column', label: 'Column', icon: 'Columns3' },
        ],
    },
];

function setButtonContent(button, icon, label) {
    button.replaceChildren();
    const iconSlot = document.createElement('span');
    iconSlot.className = 'markdown-table-editor-button-icon';
    iconSlot.innerHTML = renderLucideIcon(icon, { size: 14 });
    iconSlot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    button.append(iconSlot, text);
}

function createControlGroup(label, className = '') {
    const group = document.createElement('div');
    group.className = `markdown-table-editor-control-group ${className}`.trim();
    const heading = document.createElement('span');
    heading.className = 'markdown-table-editor-control-label';
    heading.textContent = label;
    group.append(heading);
    return group;
}

function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(34, textarea.scrollHeight)}px`;
}

function sameCell(left, right) {
    return left?.row === right?.row && left?.col === right?.col;
}

function returnFocus(mainView, target, tableFrom) {
    setTimeout(() => {
        if (target?.isConnected) target.focus();
        else {
            const currentGuide = mainView?.dom?.querySelector?.(
                `.markdown-table-editor-guide[data-table-from="${tableFrom}"]`,
            );
            if (currentGuide) currentGuide.focus();
            else mainView?.focus?.();
        }
    }, 0);
}

/** Open a transactional, grid-first editor for one exact Markdown table. */
export function openMarkdownTableEditor(mainView, originalBlock, options = {}) {
    if (!mainView || !originalBlock) return null;
    const initialState = createMarkdownTableEditorState(originalBlock.source);
    if (!initialState.valid) {
        errorDialog('Table editor unavailable', initialState.error, 'Edit the table as Markdown and try again.');
        return null;
    }

    const { overlay } = createDialogShell({
        title: 'Table Editor',
        description: 'Edit cell content and structure. Apply writes one change to the Markdown buffer.',
        icon: 'table',
        className: 'markdown-table-editor-modal',
        content: '<div class="markdown-table-editor-workspace"></div>',
        footer: `
            <span class="markdown-table-editor-status" role="status" aria-live="polite"></span>
            <button type="button" class="ui-button custom-modal-btn markdown-table-editor-cancel">Cancel</button>
            <button type="button" class="ui-button ui-button--primary custom-modal-btn markdown-table-editor-apply">Apply</button>
        `,
    });
    const workspace = overlay.querySelector('.markdown-table-editor-workspace');
    const cancelButton = overlay.querySelector('.markdown-table-editor-cancel');
    const applyButton = overlay.querySelector('.markdown-table-editor-apply');
    const status = overlay.querySelector('.markdown-table-editor-status');
    const modalResize = makeEditorModalResizable(overlay.querySelector('.custom-modal'));
    setButtonContent(cancelButton, 'X', 'Cancel');
    setButtonContent(applyButton, 'Check', 'Apply');

    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-table-editor-toolbar';
    toolbar.setAttribute('aria-label', 'Table editing controls');
    const primaryRow = document.createElement('div');
    primaryRow.className = 'markdown-table-editor-toolbar-row markdown-table-editor-toolbar-row--primary';
    const structureRow = document.createElement('div');
    structureRow.className = 'markdown-table-editor-toolbar-row markdown-table-editor-toolbar-row--structure';
    const historyGroup = createControlGroup('History', 'markdown-table-editor-history-group');
    const undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.className = 'ui-button markdown-table-editor-undo';
    setButtonContent(undoButton, 'Undo2', 'Undo');
    const redoButton = document.createElement('button');
    redoButton.type = 'button';
    redoButton.className = 'ui-button markdown-table-editor-redo';
    setButtonContent(redoButton, 'Redo2', 'Redo');
    historyGroup.append(undoButton, redoButton);

    const commandButtons = new Map();
    for (const groupDefinition of commandGroups) {
        const group = createControlGroup(
            groupDefinition.label,
            `markdown-table-editor-command-group markdown-table-editor-${groupDefinition.key}-group`,
        );
        if (groupDefinition.danger) group.classList.add('markdown-table-editor-danger-group');
        for (const command of groupDefinition.commands) {
            const wrapper = document.createElement('span');
            wrapper.className = 'markdown-table-editor-control-wrap';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `ui-button markdown-table-editor-command markdown-table-editor-${command.action}`;
            if (groupDefinition.danger) button.classList.add('ui-button--danger-ghost');
            button.dataset.action = command.action;
            setButtonContent(button, command.icon, command.label);
            wrapper.append(button);
            group.append(wrapper);
            commandButtons.set(command.action, { button, wrapper });
        }
        (groupDefinition.row === 'primary' ? primaryRow : structureRow).append(group);
    }

    const viewGroup = createControlGroup('View', 'markdown-table-editor-view-group');
    const sourceButton = document.createElement('button');
    sourceButton.type = 'button';
    sourceButton.className = 'ui-button markdown-table-editor-source-toggle';
    setButtonContent(sourceButton, 'Eye', 'Show Markdown');
    sourceButton.setAttribute('aria-expanded', 'false');
    viewGroup.append(sourceButton);
    primaryRow.prepend(historyGroup);
    primaryRow.append(viewGroup);
    toolbar.append(primaryRow, structureRow);

    const selectionHint = document.createElement('p');
    selectionHint.className = 'markdown-table-editor-selection-hint';
    selectionHint.textContent = 'Hold Shift and click or drag across cells, or press Alt+Shift+Arrow, to select a cell range.';

    const panes = document.createElement('div');
    panes.className = 'markdown-table-editor-panes';
    const gridPane = document.createElement('section');
    gridPane.className = 'markdown-table-editor-grid-pane';
    gridPane.setAttribute('aria-label', 'Editable table grid');
    const gridScroller = document.createElement('div');
    gridScroller.className = 'markdown-table-editor-grid-scroller';
    const table = document.createElement('table');
    table.className = 'markdown-table-editor-grid';
    gridScroller.append(table);
    gridPane.append(gridScroller);

    const sourcePane = document.createElement('section');
    sourcePane.className = 'markdown-table-editor-source-pane';
    sourcePane.setAttribute('aria-label', 'Read-only Markdown source');
    sourcePane.hidden = true;
    const sourceHeading = document.createElement('h4');
    sourceHeading.textContent = 'Markdown (read-only)';
    const source = document.createElement('textarea');
    source.className = 'ui-field markdown-table-editor-source';
    source.readOnly = true;
    source.tabIndex = -1;
    source.wrap = 'off';
    source.spellcheck = false;
    source.setAttribute('aria-label', 'Read-only Markdown table source');
    sourcePane.append(sourceHeading, source);
    panes.append(gridPane, sourcePane);

    const {
        notice: discard,
        keepButton,
        discardButton,
    } = createPendingChangesNotice('table');
    discard.classList.add('markdown-table-editor-discard');
    keepButton.classList.add('markdown-table-editor-keep');
    setButtonContent(keepButton, 'PencilLine', 'Keep editing');
    discardButton.classList.add('markdown-table-editor-discard-confirm');
    setButtonContent(discardButton, 'Trash2', 'Discard');
    workspace.append(toolbar, selectionHint, panes, discard);

    let state = initialState;
    let selection = markdownTableEditorSelection({ row: 0, col: 0 });
    const undoStack = [];
    let redoStack = [];
    let sourceVisible = false;
    let lifecycle = null;
    let settled = false;

    const exactSource = () => serializeMarkdownTableEditorState(state);
    const dirty = () => exactSource() !== initialState.originalSource;

    const refreshCellClasses = () => {
        const selected = markdownTableEditorSelectedCells(selection);
        table.querySelectorAll('[data-table-row][data-table-column]').forEach(cell => {
            const row = Number(cell.dataset.tableRow);
            const col = Number(cell.dataset.tableColumn);
            cell.classList.toggle('is-active', sameCell(selection.head, { row, col }));
            cell.classList.toggle('is-selected', selected.some(candidate => sameCell(candidate, { row, col })));
        });
    };

    const refreshControls = () => {
        undoButton.disabled = undoStack.length === 0;
        redoButton.disabled = redoStack.length === 0;
        undoButton.title = undoButton.disabled ? 'No local table edit to undo' : 'Undo the last edit in this table window';
        redoButton.title = redoButton.disabled ? 'No local table edit to redo' : 'Redo the last edit in this table window';
        for (const [action, elements] of commandButtons) {
            const availability = markdownTableEditorActionState(state, selection, action);
            elements.button.disabled = !availability.enabled;
            elements.wrapper.dataset.uiTooltip = availability.reason;
        }
        const selected = markdownTableEditorSelectedCells(selection);
        status.textContent = selection.rangeActive
            ? `${selected.length} ${selected.length === 1 ? 'cell' : 'cells'} selected`
            : `Editing ${tableCellAddress(selection.head)}`;
        source.value = exactSource();
        applyButton.disabled = false;
    };

    const setSelection = (next, { focus = false } = {}) => {
        selection = next;
        refreshCellClasses();
        refreshControls();
        if (focus) {
            const target = table.querySelector(
                `[data-table-row="${selection.head.row}"][data-table-column="${selection.head.col}"] textarea`,
            );
            target?.focus();
        }
    };

    const beginShiftSelection = (event, start) => {
        event.preventDefault();
        const clickAnchor = selection.rangeActive ? selection.anchor : selection.head;
        let dragged = false;
        const cellFromTarget = target => {
            const cell = target?.closest?.('[data-table-row][data-table-column]');
            if (!cell || !table.contains(cell)) return null;
            return {
                row: Number(cell.dataset.tableRow),
                col: Number(cell.dataset.tableColumn),
            };
        };
        const stop = () => {
            table.removeEventListener('mouseover', move);
            document.removeEventListener('mouseup', stop);
            window.removeEventListener('blur', stop);
            if (!dragged) setSelection(markdownTableEditorSelection(clickAnchor, start, true));
        };
        const move = moveEvent => {
            const head = cellFromTarget(moveEvent.target);
            if (!head || sameCell(head, start)) return;
            dragged = true;
            setSelection(markdownTableEditorSelection(start, head, true));
        };
        table.addEventListener('mouseover', move);
        document.addEventListener('mouseup', stop, { once: true });
        window.addEventListener('blur', stop, { once: true });
    };

    const renderGrid = ({ focus = null } = {}) => {
        const fragment = document.createDocumentFragment();
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');
        state.rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            for (let colIndex = 0; colIndex < state.columns; colIndex += 1) {
                const span = markdownTableEditorSpanAt(state, { row: rowIndex, col: colIndex });
                if (span && (span.fromRow !== rowIndex || span.fromCol !== colIndex)) continue;
                const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
                cell.dataset.tableRow = String(rowIndex);
                cell.dataset.tableColumn = String(colIndex);
                if (span) {
                    cell.rowSpan = span.toRow - span.fromRow + 1;
                    cell.colSpan = span.toCol - span.fromCol + 1;
                    cell.classList.add('is-merged');
                }
                const textarea = document.createElement('textarea');
                textarea.className = 'markdown-table-editor-cell';
                textarea.rows = 1;
                textarea.spellcheck = true;
                textarea.value = markdownTableEditorCellValue(state, rowIndex, colIndex);
                textarea.setAttribute('aria-label', `${rowIndex === 0 ? 'Header' : 'Cell'} ${tableCellAddress({ row: rowIndex, col: colIndex })}`);
                textarea.addEventListener('focus', () => {
                    if (selection.rangeActive || !sameCell(selection.head, { row: rowIndex, col: colIndex })) {
                        setSelection(markdownTableEditorSelection({ row: rowIndex, col: colIndex }));
                    }
                });
                textarea.addEventListener('mousedown', event => {
                    if (!event.shiftKey || event.button !== 0) return;
                    beginShiftSelection(event, { row: rowIndex, col: colIndex });
                });
                textarea.addEventListener('input', () => {
                    undoStack.push(state);
                    redoStack = [];
                    state = updateMarkdownTableEditorCell(state, rowIndex, colIndex, textarea.value);
                    autoGrow(textarea);
                    refreshControls();
                });
                cell.append(textarea);
                tr.append(cell);
                setTimeout(() => autoGrow(textarea), 0);
            }
            (rowIndex === 0 ? thead : tbody).append(tr);
        });
        fragment.append(thead, tbody);
        table.replaceChildren(fragment);
        refreshCellClasses();
        refreshControls();
        if (focus) setSelection(markdownTableEditorSelection(focus), { focus: true });
    };

    const commitCommand = action => {
        const result = applyMarkdownTableEditorAction(state, selection, action);
        if (!result) return false;
        undoStack.push(state);
        redoStack = [];
        state = result.state;
        selection = result.selection;
        renderGrid({ focus: selection.head });
        return true;
    };

    const localUndo = () => {
        const previous = undoStack.pop();
        if (!previous) return false;
        redoStack.push(state);
        state = previous;
        selection = markdownTableEditorSelection({
            row: Math.min(selection.head.row, state.rows.length - 1),
            col: Math.min(selection.head.col, state.columns - 1),
        });
        renderGrid({ focus: selection.head });
        return true;
    };

    const localRedo = () => {
        const next = redoStack.pop();
        if (!next) return false;
        undoStack.push(state);
        state = next;
        selection = markdownTableEditorSelection({
            row: Math.min(selection.head.row, state.rows.length - 1),
            col: Math.min(selection.head.col, state.columns - 1),
        });
        renderGrid({ focus: selection.head });
        return true;
    };

    const finish = apply => {
        if (settled) return false;
        if (apply) {
            const current = mainView.state.sliceDoc(originalBlock.from, originalBlock.to);
            if (current !== originalBlock.source) {
                status.textContent = 'The original table changed. Close and reopen the editor.';
                status.classList.add('is-error');
                applyButton.disabled = true;
                return false;
            }
            const replacement = exactSource();
            if (replacement !== current) {
                mainView.dispatch({
                    changes: { from: originalBlock.from, to: originalBlock.to, insert: replacement },
                    selection: { anchor: originalBlock.from },
                    scrollIntoView: true,
                    annotations: Transaction.userEvent.of('input.table-editor'),
                });
            }
        }
        settled = true;
        modalResize.destroy();
        lifecycle.close(false);
        returnFocus(mainView, options.returnFocus, originalBlock.from);
        return true;
    };

    const hideDiscard = () => {
        discard.hidden = true;
        cancelButton.focus();
    };
    const requestCancel = () => {
        if (!dirty()) return finish(false);
        discard.hidden = false;
        keepButton.focus();
        return false;
    };

    commandButtons.forEach(({ button }, action) => button.addEventListener('click', () => commitCommand(action)));
    undoButton.addEventListener('click', localUndo);
    redoButton.addEventListener('click', localRedo);
    sourceButton.addEventListener('click', () => {
        sourceVisible = !sourceVisible;
        sourcePane.hidden = !sourceVisible;
        source.tabIndex = sourceVisible ? 0 : -1;
        panes.classList.toggle('has-source', sourceVisible);
        setButtonContent(sourceButton, sourceVisible ? 'EyeOff' : 'Eye', sourceVisible ? 'Hide Markdown' : 'Show Markdown');
        sourceButton.setAttribute('aria-expanded', String(sourceVisible));
    });
    cancelButton.addEventListener('click', requestCancel);
    applyButton.addEventListener('click', () => finish(true));
    keepButton.addEventListener('click', hideDiscard);
    discardButton.addEventListener('click', () => finish(false));
    gridPane.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            if (event.shiftKey) localRedo();
            else localUndo();
            return;
        }
        if (!event.altKey || !event.shiftKey || !event.key.startsWith('Arrow')) return;
        event.preventDefault();
        const delta = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1],
        }[event.key];
        if (!delta) return;
        const head = {
            row: Math.max(0, Math.min(state.rows.length - 1, selection.head.row + delta[0])),
            col: Math.max(0, Math.min(state.columns - 1, selection.head.col + delta[1])),
        };
        const anchor = selection.rangeActive ? selection.anchor : selection.head;
        setSelection(markdownTableEditorSelection(anchor, head, true));
    });

    lifecycle = activateModal(overlay, {
        initialFocus: () => table.querySelector('textarea'),
        dismissOnBackdrop: false,
        onDismiss: requestCancel,
        shouldDismissOnEscape: event => {
            event.preventDefault();
            event.stopPropagation();
            if (!discard.hidden) hideDiscard();
            else requestCancel();
            return false;
        },
    });
    renderGrid();

    return {
        overlay,
        apply: () => finish(true),
        cancel: requestCancel,
        get source() { return exactSource(); },
        get selection() { return selection; },
        get state() { return state; },
    };
}

export default openMarkdownTableEditor;

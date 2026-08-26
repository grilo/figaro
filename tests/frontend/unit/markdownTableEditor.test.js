import { openMarkdownTableEditor } from '../frontend/js/markdownTableEditor.js';

const tableSource = [
    '| Name | Count |',
    '| --- | ---: |',
    '| Alpha | 2 |',
    '| Beta | 10 |',
].join('\n');

function editorHarness(source = tableSource) {
    let documentSource = source;
    const view = {
        state: {
            sliceDoc: (from, to) => documentSource.slice(from, to),
        },
        dispatch: jest.fn(transaction => {
            const change = transaction.changes;
            documentSource = documentSource.slice(0, change.from)
                + change.insert
                + documentSource.slice(change.to);
        }),
        focus: jest.fn(),
    };
    const block = { from: 0, to: source.length, source };
    return { view, block, get source() { return documentSource; } };
}

describe('Markdown table editor modal', () => {
    beforeEach(() => {
        const iconNames = [
            'BetweenHorizontalEnd', 'BetweenHorizontalStart', 'BetweenVerticalEnd',
            'BetweenVerticalStart', 'Check', 'Columns3', 'Combine', 'Eye', 'EyeOff',
            'PencilLine', 'Redo2', 'Rows3', 'Split', 'Trash2', 'Undo2', 'X',
        ];
        window.lucide = {
            icons: Object.fromEntries(iconNames.map(name => [name, [['path', { d: 'M2 12h20' }]]])),
        };
    });

    afterEach(() => {
        document.querySelector('.custom-modal-overlay')?.remove();
        document.body.classList.remove('custom-modal-open');
        document.getElementById('app')?.removeAttribute('inert');
        delete window.lucide;
    });

    test('groups icon-labelled controls into editing and structural rows with destructive actions together', () => {
        const harness = editorHarness();
        const dialog = openMarkdownTableEditor(harness.view, harness.block);
        const rows = dialog.overlay.querySelectorAll('.markdown-table-editor-toolbar-row');
        const dangerGroup = dialog.overlay.querySelector('.markdown-table-editor-danger-group');

        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('History');
        expect(rows[0].textContent).toContain('Cells');
        expect(rows[1].textContent).toContain('Rows');
        expect(rows[1].textContent).toContain('Columns');
        expect(dangerGroup.textContent).toBe('DeleteRowColumn');
        expect(dangerGroup.querySelectorAll('.ui-button--danger-ghost')).toHaveLength(2);
        expect(dialog.overlay.querySelectorAll('.markdown-table-editor-toolbar svg').length).toBeGreaterThan(0);
        expect(dialog.overlay.querySelector('.markdown-table-editor-undo').textContent).toBe('Undo');
    });

    test('uses ordinary clicks for text editing and only enters cell-range mode while Shift is held', () => {
        const harness = editorHarness();
        const dialog = openMarkdownTableEditor(harness.view, harness.block);
        const status = dialog.overlay.querySelector('.markdown-table-editor-status');
        const second = dialog.overlay.querySelector('[aria-label="Header B1"]');

        expect(status.textContent).toBe('Editing A1');
        expect(status.textContent).not.toContain('selected');
        second.focus();
        expect(status.textContent).toBe('Editing B1');
        expect(dialog.selection.rangeActive).toBe(false);

        second.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowLeft',
            altKey: true,
            shiftKey: true,
        }));
        expect(status.textContent).toBe('2 cells selected');
        expect(dialog.selection.rangeActive).toBe(true);
    });

    test('exposes contextual merge and split controls with explanatory tooltips', () => {
        const harness = editorHarness();
        const dialog = openMarkdownTableEditor(harness.view, harness.block);
        const merge = dialog.overlay.querySelector('.markdown-table-editor-merge');
        const split = dialog.overlay.querySelector('.markdown-table-editor-split');
        const alpha = dialog.overlay.querySelector('[aria-label="Cell A2"]');
        const count = dialog.overlay.querySelector('[aria-label="Cell B2"]');

        expect(merge.disabled).toBe(true);
        expect(merge.parentElement.dataset.uiTooltip).toContain('Hold Shift');
        alpha.focus();
        count.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            shiftKey: true,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        expect(merge.disabled).toBe(false);
        merge.click();
        expect(dialog.source).toContain('<!-- figaro:table-merge A2:B2 -->');
        expect(split.disabled).toBe(false);
        split.click();
        expect(dialog.source).toBe(tableSource);
    });

    test('starts a fresh rectangular range on Shift-drag without claiming an ordinary drag', () => {
        const harness = editorHarness();
        const dialog = openMarkdownTableEditor(harness.view, harness.block);
        const status = dialog.overlay.querySelector('.markdown-table-editor-status');
        const alpha = dialog.overlay.querySelector('[aria-label="Cell A2"]');
        const last = dialog.overlay.querySelector('[aria-label="Cell B3"]');

        alpha.focus();
        const ordinaryDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
        });
        expect(alpha.dispatchEvent(ordinaryDown)).toBe(true);
        expect(ordinaryDown.defaultPrevented).toBe(false);
        last.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        expect(status.textContent).toBe('Editing A2');
        expect(dialog.selection.rangeActive).toBe(false);

        alpha.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            shiftKey: true,
        }));
        last.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        expect(status.textContent).toBe('4 cells selected');
        expect(dialog.selection).toEqual({
            anchor: { row: 1, col: 0 },
            head: { row: 2, col: 1 },
            rangeActive: true,
        });
    });

    test('keeps Markdown read-only and applies every modal edit as one buffer transaction', () => {
        const harness = editorHarness();
        const dialog = openMarkdownTableEditor(harness.view, harness.block);
        const source = dialog.overlay.querySelector('.markdown-table-editor-source');
        const sourcePane = dialog.overlay.querySelector('.markdown-table-editor-source-pane');
        const toggle = dialog.overlay.querySelector('.markdown-table-editor-source-toggle');
        const alpha = dialog.overlay.querySelector('[aria-label="Cell A2"]');

        expect(sourcePane.hidden).toBe(true);
        expect(source.readOnly).toBe(true);
        toggle.click();
        expect(sourcePane.hidden).toBe(false);
        expect(source.value).toBe(tableSource);

        alpha.value = 'Changed';
        alpha.dispatchEvent(new Event('input', { bubbles: true }));
        expect(harness.view.dispatch).not.toHaveBeenCalled();
        dialog.overlay.querySelector('.markdown-table-editor-apply').click();
        expect(harness.view.dispatch).toHaveBeenCalledTimes(1);
        expect(harness.source).toContain('| Changed | 2 |');
    });

    test('uses local Undo without touching the buffer and confirms dirty Escape cancellation', () => {
        const harness = editorHarness();
        const dialog = openMarkdownTableEditor(harness.view, harness.block);
        const alpha = dialog.overlay.querySelector('[aria-label="Cell A2"]');
        alpha.value = 'Changed';
        alpha.dispatchEvent(new Event('input', { bubbles: true }));
        dialog.overlay.querySelector('.markdown-table-editor-undo').click();
        expect(dialog.source).toBe(tableSource);
        expect(harness.view.dispatch).not.toHaveBeenCalled();

        const currentAlpha = dialog.overlay.querySelector('[aria-label="Cell A2"]');
        currentAlpha.value = 'Dirty';
        currentAlpha.dispatchEvent(new Event('input', { bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const confirmation = dialog.overlay.querySelector('.markdown-table-editor-discard');
        expect(confirmation.hidden).toBe(false);
        expect(dialog.overlay.isConnected).toBe(true);
        confirmation.querySelector('.markdown-table-editor-discard-confirm').click();
        expect(dialog.overlay.isConnected).toBe(false);
        expect(harness.view.dispatch).not.toHaveBeenCalled();
    });
});

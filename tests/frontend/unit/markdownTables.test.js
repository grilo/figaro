import {
    createEditorView,
    getEditorContent,
    initEditor,
    setEditorContent,
} from '../frontend/js/editor.js';

const tableSource = [
    'Before',
    '',
    '| Name | Count |',
    '| :--- | ---: |',
    '| Alpha | 2 |',
    '| Beta | 10 |',
    '',
    'After',
].join('\n');

function waitForEditorUpdate() {
    return new Promise(resolve => setTimeout(resolve, 40));
}

describe('codemirror-markdown-tables integration', () => {
    let view;

    beforeAll(async () => {
        await initEditor();
    });

    afterAll(() => {
        view?.destroy();
    });

    test('renders a GFM table as an interactive table without changing Markdown', async () => {
        view = createEditorView();
        setEditorContent(tableSource);
        await waitForEditorUpdate();

        const widget = view.dom.querySelector('.tbl-table-widget');
        expect(widget).not.toBeNull();
        expect(widget.classList.contains('cm-block-widget')).toBe(true);
        expect(widget.classList.contains('cm-block-widget--table')).toBe(true);
        expect(widget.classList.contains('cm-source-footprint--scroll')).toBe(true);
        expect(widget.dataset.sourceFootprint).toBe('table');
        expect(widget.dataset.sourceLines).toBe('4');
        expect(widget.style.getPropertyValue('--cm-source-footprint-height'))
            .toBe(`${view.defaultLineHeight * 4}px`);
        const deleteButton = widget.querySelector('.tbl-delete-table-button');
        expect(deleteButton).not.toBeNull();
        expect(deleteButton.classList.contains('ui-button')).toBe(true);
        expect(deleteButton.classList.contains('ui-button--danger-ghost')).toBe(true);
        expect(deleteButton.getAttribute('aria-label')).toBe('Delete table');
        expect(widget.querySelector('table.tbl-table')).not.toBeNull();
        expect(widget.querySelectorAll('thead .tbl-cell')).toHaveLength(2);
        expect(widget.querySelectorAll('tbody .tbl-table-row')).toHaveLength(2);
        expect(widget.querySelector('thead .tbl-cell:first-child').getAttribute('align')).toBe('left');
        expect(widget.querySelector('thead .tbl-cell:last-child').getAttribute('align')).toBe('right');
        expect(widget.textContent).toContain('Alpha');
        expect(widget.textContent).toContain('10');

        expect(getEditorContent()).toBe([
            'Before',
            '',
            '| Name  | Count |',
            '| :---- | ----: |',
            '| Alpha | 2     |',
            '| Beta  | 10    |',
            '',
            'After',
        ].join('\n'));
    });
});

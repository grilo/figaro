import MarkdownIt from 'markdown-it';

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
    '| **Alpha** | 2 |',
    '| Beta | 10 |',
    '',
    'After',
].join('\n');

const mergeSource = [
    '| Group | Details | Literal |',
    '| --- | --- | --- |',
    '| Alpha | first<br/>second | `<br/>` |',
    '| ^ | continued | plain |',
    '| ^ | final | plain |',
].join('\n');
const mergeDocumentSource = mergeSource + '\n\nAfter';

function waitForEditorUpdate() {
    return new Promise(resolve => setTimeout(resolve, 40));
}

describe('source-preserving GFM table preview', () => {
    let view;

    beforeAll(async () => {
        window.markdownit = jest.fn(options => new MarkdownIt(options));
        await initEditor();
    });

    afterEach(() => {
        view?.destroy();
        view = null;
    });

    afterAll(() => {
        delete window.markdownit;
    });

    test('renders a semantic table while keeping the exact Markdown source', async () => {
        view = createEditorView();
        setEditorContent(tableSource);
        await waitForEditorUpdate();

        const widget = view.dom.querySelector('.cm-block-widget--table');
        expect(widget).not.toBeNull();
        expect(widget.querySelector('.cm-live-table table')).not.toBeNull();
        expect(widget.querySelectorAll('thead th')).toHaveLength(2);
        expect(widget.querySelector('tbody td strong')?.textContent).toBe('Alpha');
        expect(widget.querySelector('thead th:last-child').getAttribute('style')).toContain('text-align:right');
        expect(widget.classList.contains('cm-source-footprint--scroll')).toBe(true);
        expect(widget.dataset.sourceFootprint).toBe('table');
        expect(widget.dataset.sourceLines).toBe('4');
        expect(widget.querySelector('.cm-editor')).toBeNull();
        expect(getEditorContent()).toBe(tableSource);

        view.dispatch({ selection: { anchor: tableSource.indexOf('Alpha') } });
        await waitForEditorUpdate();
        expect(view.dom.querySelector('.cm-block-widget--table')).toBeNull();
        expect(view.dom.querySelector('.cm-content').textContent).toContain('| **Alpha** | 2 |');

        view.dispatch({ selection: { anchor: 0 } });
        await waitForEditorUpdate();
        expect(view.dom.querySelector('.cm-block-widget--table')).not.toBeNull();
        expect(getEditorContent()).toBe(tableSource);
    });

    test('uses the shared GFM output for line breaks and vertical caret merges', async () => {
        view = createEditorView();
        setEditorContent(mergeDocumentSource);
        await waitForEditorUpdate();
        view.dispatch({ selection: { anchor: mergeDocumentSource.indexOf('After') } });
        await waitForEditorUpdate();

        const table = view.dom.querySelector('.cm-live-table table');
        expect(table).not.toBeNull();
        expect(table.querySelector('tbody tr:first-child td').rowSpan).toBe(3);
        expect(table.querySelectorAll('tbody tr:first-child td:first-child')).toHaveLength(1);
        expect(table.querySelector('tbody tr:first-child td:nth-child(2)').querySelectorAll('br')).toHaveLength(1);
        expect(table.querySelector('tbody tr:first-child td:nth-child(3)').textContent).toBe('<br/>');
        expect(table.textContent).not.toContain('^');
        expect(getEditorContent()).toBe(mergeDocumentSource);
    });
});

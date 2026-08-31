import { markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createMarkdownBlockGuidesExtension } from '../frontend/js/markdownBlockGuides.js';
import {
    createVegaLiteChartEditorStateFromTable,
    serializeVegaLiteChartFence,
} from '../frontend/js/core/vegaLiteChartEditorModel.js';

describe('Vega-Lite Chart Editor block guides', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
    });

    function createView(source, callbacks) {
        view = new EditorView({
            parent: document.body,
            state: EditorState.create({
                doc: source,
                extensions: [
                    markdownLanguage,
                    ...createMarkdownBlockGuidesExtension(callbacks),
                ],
            }),
        });
    }

    test('adds a chart conversion action to the existing Markdown table guide stack', () => {
        const source = '| Name | Count |\n| --- | ---: |\n| Alpha | 2 |';
        const openChartEditor = jest.fn();
        createView(source, {
            openTableEditor: jest.fn(),
            openChartEditor,
        });

        const stack = view.dom.querySelector('.cm-editor-block-guide-stack');
        const chart = stack.querySelector('.markdown-table-chart-guide');
        expect([...stack.children].map(control => control.textContent))
            .toEqual(['table', 'editor', 'chart', 'delete']);
        expect(chart.getAttribute('aria-label')).toBe('Convert Markdown table to Vega-Lite chart');
        chart.click();
        expect(openChartEditor).toHaveBeenCalledWith(
            view,
            expect.objectContaining({ type: 'table', from: 0, to: source.length }),
            chart,
        );
        expect(view.state.doc.toString()).toBe(source);
    });

    test('adds editor and table actions to Vega-Lite without changing the authored fence', () => {
        const tableSource = '| Name | Count |\n| --- | ---: |\n| Alpha | 2 |';
        const source = serializeVegaLiteChartFence(createVegaLiteChartEditorStateFromTable(tableSource));
        const openChartEditor = jest.fn();
        const convertChartToTable = jest.fn();
        createView(source, { openChartEditor, convertChartToTable });

        const stack = view.dom.querySelector('.cm-editor-block-guide-stack');
        const editor = stack.querySelector('.vega-lite-chart-editor-guide');
        const table = stack.querySelector('.vega-lite-chart-to-table-guide');
        expect([...stack.children].map(control => control.textContent))
            .toEqual(['vega-lite', 'editor', 'table']);
        expect(editor.getAttribute('aria-label')).toBe('Open Chart Editor for this Vega-Lite chart');
        expect(table.getAttribute('aria-label')).toBe('Convert Vega-Lite chart back to Markdown table');

        editor.click();
        table.click();
        expect(openChartEditor).toHaveBeenCalledWith(
            view,
            expect.objectContaining({ label: 'vega-lite', from: 0, to: source.length }),
            editor,
        );
        expect(convertChartToTable).toHaveBeenCalledWith(
            view,
            expect.objectContaining({ label: 'vega-lite', from: 0, to: source.length }),
            table,
        );
        expect(view.state.doc.toString()).toBe(source);
    });

    test('leaves hand-written Vega-Lite with only its normal fold guide', () => {
        const source = '```vega-lite\n{"mark":"bar"}\n```';
        createView(source, {
            openChartEditor: jest.fn(),
            convertChartToTable: jest.fn(),
        });

        const stack = view.dom.querySelector('.cm-editor-block-guide-stack');
        expect(stack).toBeNull();
        expect(view.dom.querySelector('[aria-label="Collapse vega-lite code block"]')).not.toBeNull();
        expect(view.dom.querySelector('.vega-lite-chart-editor-guide')).toBeNull();
        expect(view.dom.querySelector('.vega-lite-chart-to-table-guide')).toBeNull();
    });
});

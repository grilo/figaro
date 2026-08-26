import { EditorState } from '@codemirror/state';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';

import { createMarkdownBlockGuidesExtension } from '../frontend/js/markdownBlockGuides.js';

describe('Markdown table editor block guide', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
    });

    function createView(source, openTableEditor = jest.fn()) {
        view = new EditorView({
            parent: document.body,
            state: EditorState.create({
                doc: source,
                extensions: [
                    markdownLanguage,
                    ...createMarkdownBlockGuidesExtension({ openTableEditor }),
                ],
            }),
        });
        return openTableEditor;
    }

    test('stacks editor and delete actions below the table fold control', () => {
        const source = '| Name | Count |\n| --- | ---: |\n| Alpha | 2 |';
        const openTableEditor = createView(source);
        const stack = view.dom.querySelector('.cm-editor-block-guide-stack');
        const editor = stack.querySelector('.markdown-table-editor-guide');

        expect([...stack.children].map(control => control.textContent)).toEqual(['table', 'editor', 'delete']);
        expect(editor.getAttribute('aria-label')).toBe('Open table editor for this table');
        editor.click();
        expect(openTableEditor).toHaveBeenCalledWith(
            view,
            expect.objectContaining({ type: 'table', from: 0, to: source.length }),
            editor,
        );
        expect(view.state.doc.toString()).toBe(source);
    });

    test('deletes adjacent merge metadata with the table', () => {
        const source = [
            '| Name | Count |',
            '| --- | ---: |',
            '| Alpha | 2 |',
            '<!-- figaro:table-merge A2:B2 -->',
        ].join('\n');
        createView(source);
        view.dom.querySelector('.markdown-table-delete-guide').click();
        expect(view.state.doc.toString()).toBe('');
    });
});

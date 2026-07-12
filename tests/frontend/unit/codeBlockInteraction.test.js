import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    codeBlockField,
    collapseOnSelectionFacet,
    mouseSelectingField,
} from '../frontend/vendored/codemirror-live-markdown/index.js';

describe('code block interaction', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
    });

    test('clicking a preview enters source mode at the clicked code line', () => {
        const fence = '`'.repeat(3);
        const source = [
            '# Preview',
            '',
            fence + 'javascript',
            'const answer = 42;',
            fence,
        ].join('\n');
        const codeBlockExtensions = codeBlockField({ lineNumbers: true });
        const state = EditorState.create({
            doc: source,
            extensions: [
                collapseOnSelectionFacet.of(true),
                mouseSelectingField,
                markdownLanguage,
                ...codeBlockExtensions,
            ],
        });
        view = new EditorView({ state, parent: document.body });

        const line = view.dom.querySelector('.cm-codeblock-line[data-line-index="0"]');
        expect(line).not.toBeNull();

        line.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 0,
        }));

        expect(view.state.selection.main.anchor).toBe(source.indexOf('const answer'));
        expect(view.dom.querySelector('.cm-codeblock-widget')).toBeNull();
    });
});

import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { cursorLineDown, cursorLineUp } from '@codemirror/commands';
import { foldedRanges } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { collapseOnSelectionFacet, mouseSelectingField } from 'codemirror-live-markdown';

import { createMarkdownBlockGuidesExtension } from '../../../frontend/js/markdownBlockGuides.js';
import { createMarkdownImageField } from '../../../frontend/js/markdownImagePlugin.js';

const source = 'Before\n![Flow](flow.drawio.svg)\nAfter';

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('Draw.io image block guide', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
        document.body.innerHTML = '';
    });

    test('stacks fold and editor actions and preserves native vertical movement', async () => {
        const openDrawioEditor = jest.fn(async () => true);
        view = new EditorView({
            parent: document.body,
            state: EditorState.create({
                doc: source,
                selection: { anchor: 0 },
                extensions: [
                    markdown(),
                    collapseOnSelectionFacet.of(true),
                    mouseSelectingField,
                    createMarkdownImageField({
                        loadImage: async src => ({ loaded: true, src }),
                        drawioTarget: () => ({ path: 'flow.drawio.svg', title: 'flow.drawio.svg' }),
                    }),
                    ...createMarkdownBlockGuidesExtension({ openDrawioEditor }),
                ],
            }),
        });
        await settle();

        const stack = view.dom.querySelector('.cm-editor-block-guide-stack');
        const foldButton = stack.querySelector('[aria-label="Collapse Draw.io image"]');
        const editorButton = stack.querySelector('.drawio-editor-guide');
        expect(stack.children).toHaveLength(2);
        expect(foldButton.textContent).toBe('drawio');
        expect(editorButton.textContent).toBe('editor');
        expect(editorButton.getAttribute('aria-label')).toBe('Open Draw.io editor for this diagram');

        editorButton.click();
        expect(editorButton.disabled).toBe(true);
        expect(editorButton.getAttribute('aria-busy')).toBe('true');
        await settle();
        expect(openDrawioEditor).toHaveBeenCalledWith(view, expect.objectContaining({
            label: 'drawio',
            type: 'drawio',
            from: source.indexOf('![Flow]'),
        }));
        expect(editorButton.disabled).toBe(false);
        expect(editorButton.hasAttribute('aria-busy')).toBe(false);
        expect(view.state.doc.toString()).toBe(source);

        foldButton.click();
        expect(foldedRanges(view.state).size).toBeGreaterThan(0);
        expect(view.dom.querySelector('.cm-image-widget')).toBeNull();
        expect(view.dom.querySelector('.drawio-editor-guide')).toBeNull();
        view.dom.querySelector('[aria-label="Expand Draw.io image"]').click();
        await settle();
        expect(foldedRanges(view.state).size).toBe(0);
        expect(view.dom.querySelector('.cm-image-widget img')).not.toBeNull();

        view.dispatch({ selection: { anchor: source.indexOf('Before') } });
        expect(cursorLineDown(view)).toBe(true);
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
        expect(cursorLineUp(view)).toBe(true);
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1);
    });
});

import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { cursorLineDown, cursorLineUp } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { collapseOnSelectionFacet, mouseSelectingField } from 'codemirror-live-markdown';

import { createMarkdownBlockGuidesExtension } from '../../../frontend/js/markdownBlockGuides.js';
import {
    createMarkdownImageField,
    resetMarkdownImageSize,
} from '../../../frontend/js/markdownImagePlugin.js';

const source = 'Before\n![Portrait|190x121](portrait.png)\nAfter';

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('Markdown image block guide', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
        document.body.innerHTML = '';
    });

    test('collapses the complete sized footprint and restores intrinsic geometry through the image guide', async () => {
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
                        loadImage: async src => ({
                            loaded: true,
                            src,
                            width: 240,
                            height: 153,
                        }),
                    }),
                    ...createMarkdownBlockGuidesExtension({
                        resetImageSize: (editor, guide) => (
                            resetMarkdownImageSize(editor, guide.from, guide.to)
                        ),
                    }),
                ],
            }),
        });
        await settle();

        const stack = view.dom.querySelector('.cm-editor-block-guide-stack');
        const fold = stack.querySelector('[aria-label="Collapse image"]');
        const original = stack.querySelector('.markdown-image-original-guide');
        expect(fold.textContent).toBe('image');
        expect(original.textContent).toBe('original size');
        expect(original.disabled).toBe(false);

        fold.click();
        await settle();
        expect(view.dom.querySelector('.cm-image-widget')).toBeNull();
        expect(view.dom.querySelector('.cm-image-source-placeholder')).toBeNull();
        expect(view.dom.querySelector('.cm-foldPlaceholder')).not.toBeNull();

        view.dom.querySelector('[aria-label="Expand image"]').click();
        await settle();
        expect(view.dom.querySelector('.cm-image-resize-frame')).not.toBeNull();

        view.dom.querySelector('.markdown-image-original-guide').click();
        await settle();
        expect(view.state.doc.toString()).toBe('Before\n![Portrait](portrait.png)\nAfter');
        expect(view.dom.querySelector('.cm-image-resize-frame').style.width).toBe('240px');
        expect(view.dom.querySelector('.cm-image-resize-frame').style.height).toBe('153px');
        expect(view.dom.querySelector('.markdown-image-original-guide').disabled).toBe(true);

        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        expect(cursorLineDown(view)).toBe(true);
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
        expect(cursorLineUp(view)).toBe(true);
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1);
    });
});

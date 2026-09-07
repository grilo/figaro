import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { createMarkdownBlockGuidesExtension } from '../../../frontend/js/markdownBlockGuides.js';
import { createBlockControlVisibilityExtension } from '../../../frontend/js/blockControlVisibility.js';

test('hovered diagram controls retain their reveal state when typing remaps CodeMirror gutter markers', () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const visibility = createBlockControlVisibilityExtension(ViewPlugin);
    const view = new EditorView({ parent, state: EditorState.create({
        doc: 'Before\n\n```mermaid\nflowchart TD\nA --> B\n```\n\nAfter',
        extensions: [markdownLanguage, createMarkdownBlockGuidesExtension({ openMermaidEditor() {} }), visibility],
    }) });
    try {
        let measure;
        view.requestMeasure = value => { if (value?.key === view.plugin(visibility)) measure = value; };
        const control = parent.querySelector('.mermaid-editor-guide');
        const owner = control.closest('.cm-gutterElement');
        owner.getBoundingClientRect = () => ({ left: 50, right: 95, top: 100, bottom: 200 });
        view.contentDOM.getBoundingClientRect = () => ({ left: 100, right: 700 });
        view.coordsAtPos = () => null;
        view.dom.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 150 }));
        measure.write(measure.read(view));
        const revealed = () => owner.hasAttribute('data-block-control-relevant');
        expect(revealed()).toBe(true);
        const priorFrom = control.dataset.mermaidFrom;
        view.dispatch({ changes: { from: 0, insert: 'Typing ' }, userEvent: 'input.type' });
        const remapped = parent.querySelector('.mermaid-editor-guide');
        expect(remapped.dataset.mermaidFrom).not.toBe(priorFrom);
        expect(remapped.closest('.cm-gutterElement')).toBe(owner);
        // Assert before the next measurement can restore a flag lost by CodeMirror.
        expect(revealed()).toBe(true);
        view.dom.dispatchEvent(new MouseEvent('pointerleave'));
        measure.write(measure.read(view));
        expect(revealed()).toBe(false);
    } finally { view.destroy(); parent.remove(); }
});

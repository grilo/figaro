import { EditorState, StateField } from '@codemirror/state';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { foldedRanges } from '@codemirror/language';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import { createDiagramField } from '../../../frontend/js/liveDiagramPlugin.js';
import { synchronizeEditorBlockActionLayout } from '../../../frontend/js/editorBlockActionLayout.js';
import { createMarkdownBlockGuidesExtension } from '../../../frontend/js/markdownBlockGuides.js';

describe('Mermaid Editor block guide', () => {
    let view;

    beforeEach(() => {
        window.mermaid = {
            initialize: jest.fn(),
            render: jest.fn().mockResolvedValue({ svg: '<svg></svg>' }),
        };
    });

    afterEach(() => {
        view?.destroy();
        view = null;
        delete window.mermaid;
    });

    function createView(source, openMermaidEditor = jest.fn()) {
        const mouseSelectingField = StateField.define({ create: () => false, update: value => value });
        const diagramField = createDiagramField(
            StateField,
            EditorView,
            Decoration,
            WidgetType,
            (state, from, to) => state.selection.ranges.some(range => range.from <= to && range.to >= from),
            mouseSelectingField,
        );
        view = new EditorView({
            parent: document.body,
            state: EditorState.create({
                doc: source,
                extensions: [
                    markdownLanguage,
                    mouseSelectingField,
                    diagramField,
                    ...createMarkdownBlockGuidesExtension({ openMermaidEditor }),
                ],
            }),
        });
        return openMermaidEditor;
    }

    test('stacks a named editor action beneath the Mermaid fold control in source and rendered states', () => {
        const source = 'Before\n```mermaid\nflowchart TD\n  A --> B\n```\nAfter';
        const openMermaidEditor = createView(source);

        const stack = view.dom.querySelector('.cm-markdownBlockGutter .cm-editor-block-guide-stack');
        const foldButton = stack.querySelector('[aria-label="Collapse mermaid code block"]');
        const editorButton = stack.querySelector('.mermaid-editor-guide');
        expect(stack.children).toHaveLength(2);
        expect(foldButton.textContent).toBe('mermaid');
        expect(editorButton.textContent).toBe('editor');
        expect(editorButton.getAttribute('aria-label')).toBe('Open Mermaid Editor for this diagram');
        expect(view.dom.querySelector('.cm-gutters-after')).toBeNull();

        editorButton.click();
        expect(openMermaidEditor).toHaveBeenCalledWith(view, expect.objectContaining({
            label: 'mermaid',
            from: source.indexOf('```mermaid'),
            to: source.lastIndexOf('```') + 3,
        }));
        expect(foldedRanges(view.state).size).toBe(0);
        expect(view.state.doc.toString()).toBe(source);

        foldButton.click();
        expect(foldedRanges(view.state).size).toBeGreaterThan(0);
        expect(view.dom.querySelector('.mermaid-editor-guide')).toBeNull();
        view.dom.querySelector('[aria-label="Expand mermaid code block"]').click();
        expect(foldedRanges(view.state).size).toBe(0);
        expect(view.dom.querySelectorAll('.mermaid-editor-guide')).toHaveLength(1);

        view.dispatch({ selection: { anchor: source.indexOf('flowchart') } });
        expect(view.dom.querySelector('.cm-live-diagram')).toBeNull();
        expect(view.dom.querySelectorAll('.mermaid-editor-guide')).toHaveLength(1);
    });

    test('publishes the measured writing-column offset and stable width for the left helper rail', () => {
        createView('# Heading\n```mermaid\nflowchart TD\n  A --> B\n```');
        const beforeRail = view.scrollDOM.querySelector('.cm-editorHelperRail-before');
        view.contentDOM.style.paddingLeft = '24px';
        view.contentDOM.getBoundingClientRect = () => ({ left: 200, right: 900 });
        beforeRail.style.transform = 'matrix(1, 0, 0, 1, 10, -16)';
        beforeRail.getBoundingClientRect = () => ({ right: 100, width: 80 });

        synchronizeEditorBlockActionLayout(view, 1000);

        expect(view.dom.style.getPropertyValue('--editor-block-before-rail-offset')).toBe('130px');
        expect(view.dom.style.getPropertyValue('--editor-block-before-rail-width')).toBe('80px');
        expect(view.dom.style.getPropertyValue('--editor-block-after-rail-offset')).toBe('');
        expect(view.dom.style.getPropertyValue('--editor-block-after-rail-width')).toBe('');
    });

    test('does not add an editor action for Vega or ordinary code fences', () => {
        createView('```vega\n{}\n```\n```js\nconst x = 1\n```');
        expect(view.dom.querySelector('.mermaid-editor-guide')).toBeNull();
    });

    test('does not replace or remap source selections around the diagram', () => {
        const source = 'Before\n```mermaid\nflowchart TD\n  A --> B\n```\nAfter';
        createView(source);
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2);
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2);
    });
});

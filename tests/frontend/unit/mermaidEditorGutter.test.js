import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import { createDiagramField, scanDiagramFences } from '../../../frontend/js/liveDiagramPlugin.js';
import {
    buildMermaidEditorGuides,
    createMermaidEditorGutterExtension,
} from '../../../frontend/js/mermaidEditorGutter.js';

describe('Mermaid Editor gutter', () => {
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

    function createView(source, openEditor = jest.fn(), renderWidgets = true) {
        const mouseSelectingField = StateField.define({ create: () => false, update: value => value });
        const diagramField = renderWidgets
            ? createDiagramField(
                StateField,
                EditorView,
                Decoration,
                WidgetType,
                (state, from, to) => state.selection.ranges.some(range => range.from <= to && range.to >= from),
                mouseSelectingField,
            )
            : StateField.define({
                create: state => ({ blocks: scanDiagramFences(state.doc) }),
                update: (value, transaction) => transaction.docChanged
                    ? { blocks: scanDiagramFences(transaction.state.doc) }
                    : value,
            });
        view = new EditorView({
            parent: document.body,
            state: EditorState.create({
                doc: source,
                extensions: [
                    mouseSelectingField,
                    diagramField,
                    ...createMermaidEditorGutterExtension({ diagramField, openEditor }),
                ],
            }),
        });
        return { diagramField, openEditor };
    }

    test('shows one named right-side action for each Mermaid block, including rendered widgets', () => {
        const source = 'Before\n```mermaid\nflowchart TD\n  A --> B\n```\nAfter';
        const { diagramField, openEditor } = createView(source);
        const guides = buildMermaidEditorGuides(view.state, diagramField);
        expect(guides).toHaveLength(1);
        expect(guides[0]).toMatchObject({
            rawCode: 'flowchart TD\n  A --> B',
            contentFrom: source.indexOf('flowchart'),
            contentTo: source.lastIndexOf('```'),
        });

        const button = view.dom.querySelector('.cm-gutters-after .mermaid-editor-guide');
        expect(button).not.toBeNull();
        expect(view.dom.style.getPropertyValue('--mermaid-editor-viewport-width')).toBe('0px');
        expect(view.scrollDOM.classList.contains('cm-mermaid-editor-stacked')).toBe(true);
        expect(button.textContent).toBe('Mermaid Editor');
        expect(button.getAttribute('aria-label')).toBe('Open Mermaid Editor for this diagram');
        button.click();
        expect(openEditor).toHaveBeenCalledWith(view, expect.objectContaining({ rawCode: 'flowchart TD\n  A --> B' }));

        view.dispatch({ selection: { anchor: source.indexOf('flowchart') } });
        expect(view.dom.querySelector('.cm-live-diagram')).toBeNull();
        expect(view.dom.querySelectorAll('.mermaid-editor-guide')).toHaveLength(1);
    });

    test('does not add an action for Vega or ordinary code fences', () => {
        createView('```vega\n{}\n```\n```js\nconst x = 1\n```');
        expect(view.dom.querySelector('.mermaid-editor-guide')).toBeNull();
    });

    test('does not replace or remap source selections around the diagram', () => {
        const source = 'Before\n```mermaid\nflowchart TD\n  A --> B\n```\nAfter';
        createView(source, jest.fn(), false);
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2);
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2);
    });
});

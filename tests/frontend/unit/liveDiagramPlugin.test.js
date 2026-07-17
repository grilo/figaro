import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    codeBlockField,
    collapseOnSelectionFacet,
    mouseSelectingField,
    shouldShowSource,
} from '../frontend/vendored/codemirror-live-markdown/index.js';
import { createDiagramField, diagramLanguages, scanDiagramFences } from '../frontend/js/liveDiagramPlugin.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function decorationsIn(state, field) {
    const decorations = [];
    const value = state.field(field);
    // Diagram state also keeps source ranges so cursor-only transactions can
    // avoid reparsing the entire document. The decoration set remains the
    // observable rendering output of the field.
    (value.decorations || value).between(0, state.doc.length, (from, to, decoration) => {
        decorations.push({ from, to, decoration });
    });
    return decorations;
}

describe('live diagram preview', () => {
    let view;

    beforeEach(() => {
        window.mermaid = {
            initialize: jest.fn(),
            render: jest.fn().mockResolvedValue({ svg: '<svg data-diagram="mermaid"></svg>' }),
        };
    });

    afterEach(() => {
        view?.destroy();
        view = null;
        delete window.mermaid;
    });

    test('owns diagram fences while the standard code preview renders other fences', async () => {
        const fence = '`'.repeat(3);
        const source = [
            '# Preview',
            '',
            fence + 'mermaid',
            'flowchart TD',
            '  A --> B',
            fence,
            '',
            fence + 'javascript',
            'const value = 1;',
            fence,
        ].join('\n');

        const diagramField = createDiagramField(
            StateField,
            EditorView,
            Decoration,
            WidgetType,
            shouldShowSource,
            mouseSelectingField,
        );
        const codeBlockExtensions = codeBlockField({
            lineNumbers: true,
            skipLanguages: diagramLanguages,
        });
        const state = EditorState.create({
            doc: source,
            extensions: [
                collapseOnSelectionFacet.of(true),
                mouseSelectingField,
                markdownLanguage,
                ...codeBlockExtensions,
                diagramField,
            ],
        });
        view = new EditorView({ state, parent: document.body });

        const diagramDecorations = decorationsIn(view.state, diagramField);
        const codeBlockDecorations = decorationsIn(view.state, codeBlockExtensions[0]);
        expect(diagramDecorations).toHaveLength(1);
        expect(codeBlockDecorations).toHaveLength(1);

        const diagramDOM = diagramDecorations[0].decoration.widget.toDOM();
        document.body.appendChild(diagramDOM);
        await flush();

        expect(diagramDOM.classList.contains('cm-block-widget')).toBe(true);
        expect(diagramDOM.classList.contains('cm-block-widget--diagram')).toBe(true);
        expect(diagramDOM.querySelectorAll('svg')).toHaveLength(1);
        expect(window.mermaid.render).toHaveBeenCalled();

        view.dispatch({ selection: { anchor: source.indexOf('flowchart') } });
        expect(decorationsIn(view.state, diagramField)).toHaveLength(0);

        view.dispatch({ selection: { anchor: 0 } });
        expect(decorationsIn(view.state, diagramField)).toHaveLength(1);
    });

    test('recovers a shorter diagram closer without swallowing later diagrams', () => {
        const fence = '`'.repeat(3);
        const longerFence = '`'.repeat(6);
        const source = [
            '# Preview',
            '',
            fence + 'mermaid',
            'flowchart TD',
            '  A --> B',
            fence,
            '',
            longerFence + 'mermaid',
            'classDiagram',
            '  class Note',
            fence,
            '',
            fence + 'mermaid',
            'flowchart TD',
            '  C --> D',
            fence,
        ].join('\n');

        const rawState = EditorState.create({ doc: source });
        const blocks = scanDiagramFences(rawState.doc);
        expect(blocks).toHaveLength(3);
        expect(blocks.map(block => block.recoveredFence)).toEqual([false, true, false]);
        expect(blocks[2].code).toContain('C --> D');

        const diagramField = createDiagramField(
            StateField,
            EditorView,
            Decoration,
            WidgetType,
            shouldShowSource,
            mouseSelectingField,
        );
        const codeBlockExtensions = codeBlockField({
            lineNumbers: true,
            skipLanguages: diagramLanguages,
        });
        const state = EditorState.create({
            doc: source,
            extensions: [
                collapseOnSelectionFacet.of(true),
                mouseSelectingField,
                markdownLanguage,
                ...codeBlockExtensions,
                diagramField,
            ],
        });
        view = new EditorView({ state, parent: document.body });

        expect(decorationsIn(view.state, diagramField)).toHaveLength(3);
        // CodeMirror sees the malformed six-backtick block as one large
        // Mermaid fence, which the standard code preview skips. The diagram
        // scanner owns the recovered, non-overlapping ranges instead.
        expect(decorationsIn(view.state, codeBlockExtensions[0])).toHaveLength(0);
    });

    test('keeps diagram state stable for ordinary cursor movement and reveals source on entry', () => {
        const fence = '`'.repeat(3);
        const source = [
            'Introduction',
            '',
            fence + 'mermaid',
            'flowchart TD',
            '  A --> B',
            fence,
            '',
            'Conclusion',
        ].join('\n');
        const diagramField = createDiagramField(
            StateField,
            EditorView,
            Decoration,
            WidgetType,
            shouldShowSource,
            mouseSelectingField,
        );
        view = new EditorView({
            state: EditorState.create({
                doc: source,
                extensions: [collapseOnSelectionFacet.of(true), mouseSelectingField, diagramField],
            }),
            parent: document.body,
        });

        const initial = view.state.field(diagramField);
        view.dispatch({ selection: { anchor: view.state.doc.line(8).from } });
        expect(view.state.field(diagramField)).toBe(initial);
        expect(decorationsIn(view.state, diagramField)).toHaveLength(1);

        view.dispatch({ selection: { anchor: source.indexOf('flowchart') } });
        expect(view.state.field(diagramField)).not.toBe(initial);
        expect(decorationsIn(view.state, diagramField)).toHaveLength(0);

        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        expect(decorationsIn(view.state, diagramField)).toHaveLength(1);
    });
});

import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { codeFolding, foldEffect, unfoldEffect } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    codeBlockField,
    collapseOnSelectionFacet,
    mouseSelectingField,
    shouldShowSource,
} from '../frontend/vendored/codemirror-live-markdown/index.js';
import { createDiagramField, diagramLanguages, scanDiagramFences } from '../frontend/js/liveDiagramPlugin.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 500));

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
        delete window.vegaEmbed;
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
        expect(diagramDOM.classList.contains('cm-block-widget--mermaid')).toBe(true);
        expect(diagramDOM.classList.contains('cm-source-footprint')).toBe(true);
        expect(diagramDOM.classList.contains('cm-source-footprint--graphic')).toBe(true);
        expect(diagramDOM.dataset.sourceFootprint).toBe('mermaid');
        expect(diagramDOM.dataset.sourceLines).toBe('4');
        expect(diagramDOM.querySelectorAll('svg')).toHaveLength(1);
        expect(window.mermaid.render).toHaveBeenCalled();

        view.dispatch({ selection: { anchor: source.indexOf('flowchart') } });
        expect(decorationsIn(view.state, diagramField)).toHaveLength(0);

        view.dispatch({ selection: { anchor: 0 } });
        expect(decorationsIn(view.state, diagramField)).toHaveLength(1);
    });

    test('applies the same graphic source footprint to Vega and Vega-Lite fences', async () => {
        window.vegaEmbed = jest.fn().mockResolvedValue({
            view: {
                toSVG: jest.fn().mockResolvedValue('<svg data-diagram="vega"></svg>'),
                finalize: jest.fn(),
            },
        });
        const fence = '`'.repeat(3);
        const source = [
            fence + 'vega',
            '{}',
            fence,
            '',
            fence + 'vega-lite',
            '{}',
            fence,
            '',
            'After',
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
                selection: { anchor: source.length },
                extensions: [collapseOnSelectionFacet.of(true), mouseSelectingField, diagramField],
            }),
            parent: document.body,
        });

        const roots = decorationsIn(view.state, diagramField).map(item => item.decoration.widget.toDOM(view));
        roots.forEach(root => document.body.append(root));
        await flush();
        await flush();

        expect(roots.map(root => root.dataset.sourceFootprint)).toEqual(['vega', 'vega-lite']);
        expect(roots.map(root => root.dataset.sourceLines)).toEqual(['3', '3']);
        expect(roots.every(root => root.classList.contains('cm-source-footprint--graphic'))).toBe(true);
        expect(roots.every(root => root.querySelector('svg'))).toBe(true);
    });

    test('shows a recoverable error without sending unsafe YAML frontmatter to Mermaid', async () => {
        const fence = '`'.repeat(3);
        const source = [
            '# Preview',
            '',
            fence + 'mermaid',
            '---',
            'config: !!omap',
            '- dangerous: value',
            '---',
            'flowchart TD',
            '  A --> B',
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
        view = new EditorView({
            state: EditorState.create({
                doc: source,
                extensions: [collapseOnSelectionFacet.of(true), mouseSelectingField, diagramField],
            }),
            parent: document.body,
        });

        const diagramDOM = decorationsIn(view.state, diagramField)[0].decoration.widget.toDOM();
        document.body.appendChild(diagramDOM);
        await flush();

        expect(diagramDOM.querySelector('.cm-live-diagram-error')?.textContent)
            .toBe('Unable to render mermaid diagram');
        expect(window.mermaid.render).not.toHaveBeenCalled();
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
        expect(blocks.map(block => block.sourceLines)).toEqual([4, 4, 4]);
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

    test('yields a rendered Mermaid replacement to a native fold and restores it on unfold', () => {
        const fence = '`'.repeat(3);
        const source = [
            fence + 'mermaid',
            'flowchart TD',
            '  A --> B',
            fence,
            'after',
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
                selection: { anchor: source.length },
                extensions: [
                    collapseOnSelectionFacet.of(true),
                    mouseSelectingField,
                    codeFolding(),
                    markdownLanguage,
                    diagramField,
                ],
            }),
            parent: document.body,
        });
        const foldRange = {
            from: view.state.doc.line(1).to,
            to: view.state.doc.line(4).to,
        };

        expect(decorationsIn(view.state, diagramField)).toHaveLength(1);
        expect(view.dom.querySelector('.cm-live-diagram')).not.toBeNull();
        view.dispatch({ effects: foldEffect.of(foldRange) });

        expect(decorationsIn(view.state, diagramField)).toHaveLength(0);
        expect(view.dom.querySelector('.cm-live-diagram')).toBeNull();
        expect(view.dom.querySelector('.cm-foldPlaceholder')).not.toBeNull();
        expect(view.state.doc.toString()).toBe(source);

        view.dispatch({ effects: unfoldEffect.of(foldRange) });

        expect(view.dom.querySelector('.cm-foldPlaceholder')).toBeNull();
        expect(decorationsIn(view.state, diagramField)).toHaveLength(1);
        expect(view.dom.querySelector('.cm-live-diagram')).not.toBeNull();
    });
});

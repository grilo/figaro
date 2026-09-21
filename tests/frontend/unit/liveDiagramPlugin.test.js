import { history, undo } from '@codemirror/commands';
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
import {
    createVegaLiteChartEditorStateFromTable,
    serializeVegaLiteChartFence,
} from '../frontend/js/core/vegaLiteChartEditorModel.js';
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

    function mountPreview(language = 'vega-lite') {
        const diagramField = createDiagramField(StateField, EditorView, Decoration, WidgetType,
            () => false, mouseSelectingField);
        view = new EditorView({ state: EditorState.create({
            doc: ['Before', '', '```' + language,
                language === 'mermaid' ? 'flowchart TD\n A --> B' : '{"width":"container","mark":"bar"}',
                '```', '', 'After'].join('\n'),
            extensions: [markdownLanguage, mouseSelectingField, diagramField],
        }), parent: document.body });
        return view.dom.querySelector('.cm-live-diagram-view');
    }

    function mountSourcePreview(language, code, second = false) {
        const fence = '```' + language + '\n' + code + '\n```';
        const source = ['Before', '', fence, '', 'After', ...(second ? ['', fence, '', 'End'] : [])].join('\n');
        const field = createDiagramField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField);
        view = new EditorView({ state: EditorState.create({ doc: source,
            extensions: [markdownLanguage, collapseOnSelectionFacet.of(true), mouseSelectingField, field],
        }), parent: document.body });
        return { source, inside: source.indexOf(code),
            reveal: () => view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf(code) } }),
            restore: () => view.dispatch({ selection: { anchor: 0 } }),
        };
    }

    test.each(['mermaid', 'vega-lite'])('prepared %s previews retain their SVG and local IDs across repeated source entry and mapped edits', async language => {
        jest.useFakeTimers();
        window.mermaid.render.mockImplementation(async id => ({ svg: `<svg id="${id}"><use href="#${id}"/></svg>` }));
        window.vegaEmbed = jest.fn().mockResolvedValue({ view: { toSVG: async () => '<svg id="local"><use href="#local"/></svg>', finalize() {} } });
        try {
            const fixture = mountSourcePreview(language, language === 'mermaid' ? 'flowchart LR; A-->B' : '{"mark":"bar"}', true);
            await jest.advanceTimersByTimeAsync(350);
            const originals = [...view.dom.querySelectorAll('.cm-live-diagram-view svg')];
            expect(originals).toHaveLength(2);
            expect(originals[0].id).not.toBe(originals[1].id);
            const render = language === 'mermaid' ? window.mermaid.render : window.vegaEmbed;
            expect(render).toHaveBeenCalledTimes(1);
            for (let i = 0; i < 8; i++) {
                fixture.reveal();
                expect(originals[0].isConnected).toBe(false);
                expect(originals[1].isConnected).toBe(true);
                fixture.restore();
                // Flush mount microtasks without advancing the quiet-time delay.
                await jest.advanceTimersByTimeAsync(0);
                expect([...view.dom.querySelectorAll('.cm-live-diagram-view svg')]).toEqual(originals);
                expect(originals[0].querySelector('use').getAttribute('href')).toBe('#' + originals[0].id);
            }
            view.dispatch({ changes: { from: 0, insert: 'Mapped ' } });
            fixture.reveal(); fixture.restore(); await jest.advanceTimersByTimeAsync(0);
            expect([...view.dom.querySelectorAll('.cm-live-diagram-view svg')]).toEqual(originals);
            fixture.reveal(); fixture.restore(); fixture.reveal();
            await jest.advanceTimersByTimeAsync(0);
            expect(originals[0].isConnected).toBe(false);
            fixture.restore(); await jest.advanceTimersByTimeAsync(0);
            expect([...view.dom.querySelectorAll('.cm-live-diagram-view svg')]).toEqual(originals);
            expect(render).toHaveBeenCalledTimes(1);
            expect(view.state.doc.toString()).toBe('Mapped ' + fixture.source);
        } finally { view.destroy(); jest.useRealTimers(); }
    });

    test('prepared Mermaid output invalidates while revealed for theme, font, source and renderer changes', async () => {
        jest.useFakeTimers();
        const fonts = new EventTarget(); fonts.status = 'loaded';
        const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
        Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
        try {
            const fixture = mountSourcePreview('mermaid', 'flowchart LR; A-->B');
            await jest.advanceTimersByTimeAsync(200);
            for (const invalidate of [
                () => document.documentElement.style.setProperty('--text-color', '#f03212'),
                () => fonts.dispatchEvent(new Event('loadingdone')),
                () => { window.mermaid = { initialize: jest.fn(), render: jest.fn().mockResolvedValue({ svg: '<svg data-engine="new"/>' }) }; },
            ]) {
                const previous = view.dom.querySelector('.cm-live-diagram-view svg');
                fixture.reveal(); invalidate(); fixture.restore(); await jest.advanceTimersByTimeAsync(0);
                expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBeNull();
                await jest.advanceTimersByTimeAsync(200);
                expect(view.dom.querySelector('.cm-live-diagram-view svg')).not.toBe(previous);
            }
            fixture.reveal();
            view.dispatch({ changes: { from: fixture.inside, to: fixture.inside + 'flowchart LR; A-->B'.length, insert: 'flowchart LR; A-->C' } });
            fixture.restore(); await jest.advanceTimersByTimeAsync(0);
            expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBeNull();
            await jest.advanceTimersByTimeAsync(200);
            expect(window.mermaid.render.mock.calls.at(-1)[1]).toContain('A-->C');
        } finally {
            view.destroy(); jest.useRealTimers(); document.documentElement.style.removeProperty('--text-color');
            if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts); else delete document.fonts;
        }
    });

    test('prepared Mermaid SVG restoration stays out of held-key bursts and resumes without generation after quiet', async () => {
        jest.useFakeTimers();
        try {
            const fixture = mountSourcePreview('mermaid', 'flowchart LR; A-->B');
            await jest.advanceTimersByTimeAsync(200);
            const graphic = view.dom.querySelector('.cm-live-diagram-view svg');
            fixture.reveal();
            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true, bubbles: true }));
            fixture.restore(); await jest.advanceTimersByTimeAsync(0);
            for (let i = 0; i < 8; i++) {
                view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true, bubbles: true }));
                await jest.advanceTimersByTimeAsync(33);
                expect(graphic.isConnected).toBe(false);
            }
            await jest.advanceTimersByTimeAsync(150);
            expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBe(graphic);
            expect(window.mermaid.render).toHaveBeenCalledTimes(1);
            fixture.reveal();
            Object.defineProperty(view, 'composing', { configurable: true, writable: true, value: true });
            fixture.restore(); await jest.advanceTimersByTimeAsync(300);
            expect(graphic.isConnected).toBe(false);
            view.composing = false; await jest.advanceTimersByTimeAsync(200);
            expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBe(graphic);
        } finally { view.destroy(); jest.useRealTimers(); }
    });

    test('prepared responsive Vega output checks connected width and external data remains on the render path', async () => {
        jest.useFakeTimers();
        let width = 500;
        const widths = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
        window.vegaEmbed = jest.fn().mockResolvedValue({ view: { toSVG: async () => '<svg viewBox="0 0 40 30"/>', finalize() {} } });
        try {
            const fixture = mountSourcePreview('vega-lite', '{"width":"container","mark":"bar"}');
            await jest.advanceTimersByTimeAsync(200);
            fixture.reveal(); width = 700; fixture.restore(); await jest.advanceTimersByTimeAsync(0);
            expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBeNull();
            await jest.advanceTimersByTimeAsync(200);
            expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
            expect(window.vegaEmbed.mock.calls.at(-1)[0].style.width).toBe('700px');
            const ready = view.dom.querySelector('.cm-live-diagram-view svg');
            fixture.reveal();
            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true, bubbles: true }));
            fixture.restore(); await jest.advanceTimersByTimeAsync(0);
            expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBe(ready);
            expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
            fixture.reveal();
            Object.defineProperty(view, 'composing', { configurable: true, writable: true, value: true });
            fixture.restore(); await jest.advanceTimersByTimeAsync(300);
            expect(ready.isConnected).toBe(false);
            view.composing = false; await jest.advanceTimersByTimeAsync(200);
            expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBe(ready);
            expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
            view.destroy();
            const external = mountSourcePreview('vega-lite', '{"data":{"url":"data.csv"},"mark":"bar"}');
            await jest.advanceTimersByTimeAsync(200);
            external.reveal(); external.restore(); await jest.advanceTimersByTimeAsync(0);
            expect(view.dom.querySelector('.cm-live-diagram-view svg')).toBeNull();
            await jest.advanceTimersByTimeAsync(200);
            expect(window.vegaEmbed).toHaveBeenCalledTimes(4);
        } finally { view.destroy(); widths.mockRestore(); jest.useRealTimers(); }
    });

    test('diagram adapter postpones pending rendering during repeated key input and releases it after quiet', async () => {
        jest.useFakeTimers();
        window.vegaEmbed = jest.fn().mockResolvedValue({ view: {
            toSVG: async () => '<svg viewBox="0 0 40 30"/>', finalize() {},
        } });
        try {
            const container = mountPreview();
            for (let i = 0; i < 15; i++) {
                if (i < 7) view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
                else view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' });
                await jest.advanceTimersByTimeAsync(33);
            }
            expect(window.vegaEmbed).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(150);
            expect(window.vegaEmbed).toHaveBeenCalledTimes(1);
            expect(container.querySelector('svg')).not.toBeNull();
        } finally { view.destroy(); jest.useRealTimers(); }
    });

    test('Vega preview rejects late output after appearance/width changes and disconnects observation on destroy', async () => {
        jest.useFakeTimers();
        let finishOld;
        window.vegaEmbed = jest.fn().mockImplementationOnce(() => new Promise(resolve => {
            finishOld = () => resolve({ view: { toSVG: async () => '<svg data-version="old" viewBox="0 0 40 30"/>', finalize() {} } });
        })).mockResolvedValue({ view: { toSVG: async () => '<svg data-version="new" viewBox="0 0 40 30"/>', finalize() {} } });
        const resizeCallbacks = [];
        const observer = jest.spyOn(window, 'ResizeObserver').mockImplementation(callback => ({
            observe: element => { if (element.classList?.contains('cm-live-diagram-view')) resizeCallbacks.push(callback); },
            disconnect: jest.fn(),
        }));
        try {
            const container = mountPreview();
            Object.defineProperty(container, 'clientWidth', { configurable: true, value: 700 });
            await jest.advanceTimersByTimeAsync(150);
            expect(window.vegaEmbed).toHaveBeenCalledTimes(1);
            document.dispatchEvent(new CustomEvent('figaro:appearance-changed'));
            Object.defineProperty(container, 'clientWidth', { configurable: true, value: 800 });
            resizeCallbacks[0]();
            finishOld(); await jest.advanceTimersByTimeAsync(50);
            expect(container.querySelector('[data-version="old"]')).toBeNull();
            await jest.advanceTimersByTimeAsync(150);
            expect(container.querySelector('[data-version="new"]')).not.toBeNull();
            expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
            expect(window.vegaEmbed.mock.calls[1][0].style.width).toBe('800px');
            view.destroy();
            document.dispatchEvent(new CustomEvent('figaro:appearance-changed'));
            await jest.advanceTimersByTimeAsync(500);
            expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
        } finally { observer.mockRestore(); jest.useRealTimers(); }
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
        expect(diagramDOM.classList.contains('cm-block-widget--application-mermaid')).toBe(true);
        expect(diagramDOM.classList.contains('cm-source-footprint')).toBe(true);
        expect(diagramDOM.classList.contains('cm-source-footprint--graphic')).toBe(true);
        expect(diagramDOM.dataset.sourceFootprint).toBe('mermaid');
        expect(diagramDOM.dataset.sourceLines).toBe('4');
        expect(diagramDOM.querySelectorAll('svg')).toHaveLength(1);
        expect(window.mermaid.render).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining("theme: 'base'"),
        );

        view.dispatch({ selection: { anchor: source.indexOf('flowchart') } });
        expect(decorationsIn(view.state, diagramField)).toHaveLength(4);
        expect(view.dom.querySelector('.cm-mermaid-diagram-source-placeholder')).not.toBeNull();

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

    test('resizes a managed chart only on pointer release as one undoable buffer transaction', () => {
        window.vegaEmbed = jest.fn().mockResolvedValue({
            view: {
                toSVG: jest.fn().mockResolvedValue('<svg viewBox="0 0 640 340"></svg>'),
                finalize: jest.fn(),
            },
        });
        const table = '| Month | Revenue |\n| --- | ---: |\n| Jan | 42 |';
        const chartState = createVegaLiteChartEditorStateFromTable(table);
        const fence = serializeVegaLiteChartFence(chartState);
        const source = `${fence}\nAfter`;
        let resizeTransactions = 0;
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
                    history(),
                    collapseOnSelectionFacet.of(true),
                    mouseSelectingField,
                    diagramField,
                    EditorView.updateListener.of(update => {
                        resizeTransactions += update.transactions.filter(transaction => (
                            transaction.isUserEvent('chart.resize')
                        )).length;
                    }),
                ],
            }),
            parent: document.body,
        });

        const root = view.dom.querySelector('.cm-block-widget--figaro-chart');
        const handle = root.querySelector('.cm-vega-lite-chart-resize-handle');
        expect(root.dataset.figaroChartHeight).toBe('340');
        expect(handle.dataset.uiTooltip).toBe('Resize chart vertically');

        handle.dispatchEvent(new MouseEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientY: 200,
        }));
        handle.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 280 }));
        expect(root.dataset.figaroChartHeight).toBe('420');
        expect(root.querySelector('.cm-vega-lite-chart-resize-readout').textContent).toBe('420px high');
        expect(handle.hasAttribute('data-ui-tooltip')).toBe(false);
        expect(view.state.doc.toString()).toBe(source);
        expect(resizeTransactions).toBe(0);

        handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 280 }));
        expect(resizeTransactions).toBe(1);
        expect(scanDiagramFences(view.state.doc)[0].rawCode).toContain('"height":420');
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(source);
        expect(undo(view)).toBe(false);
    });

    test('gives Mermaid the same bottom vertical resize contract and commits only on release', () => {
        const source = ['Before', '```mermaid', 'flowchart TD', '  A --> B', '```', 'After'].join('\n');
        let resizeTransactions = 0;
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
                    history(),
                    collapseOnSelectionFacet.of(true),
                    mouseSelectingField,
                    diagramField,
                    EditorView.updateListener.of(update => {
                        resizeTransactions += update.transactions.filter(transaction => (
                            transaction.isUserEvent('diagram.resize')
                        )).length;
                    }),
                ],
            }),
            parent: document.body,
        });

        const root = view.dom.querySelector('.cm-block-widget--resizable-mermaid');
        const handle = root.querySelector('.cm-mermaid-diagram-resize-handle');
        expect(root.dataset.figaroDiagramHeight).toBe('300');
        expect(root.hasAttribute('data-figaro-chart-height')).toBe(false);
        expect(handle.dataset.uiTooltip).toBe('Resize Mermaid diagram vertically');

        handle.dispatchEvent(new MouseEvent('pointerdown', {
            bubbles: true, cancelable: true, button: 0, clientY: 200,
        }));
        handle.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 280 }));
        expect(root.dataset.figaroDiagramHeight).toBe('380');
        expect(root.querySelector('.cm-diagram-resize-readout').textContent).toBe('380px high');
        expect(view.state.doc.toString()).toBe(source);
        expect(resizeTransactions).toBe(0);

        handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 280 }));
        expect(resizeTransactions).toBe(1);
        expect(scanDiagramFences(view.state.doc)[0].rawCode).toContain('%% figaro:height 380');
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(source);
        expect(undo(view)).toBe(false);
    });

    test('cancels a chart resize and reserves its authored height while source is revealed', () => {
        window.vegaEmbed = jest.fn().mockResolvedValue({
            view: {
                toSVG: jest.fn().mockResolvedValue('<svg viewBox="0 0 640 340"></svg>'),
                finalize: jest.fn(),
            },
        });
        const table = '| Month | Revenue |\n| --- | ---: |\n| Jan | 42 |';
        const fence = serializeVegaLiteChartFence(createVegaLiteChartEditorStateFromTable(table));
        const source = `${fence}\nAfter`;
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

        const root = view.dom.querySelector('.cm-block-widget--figaro-chart');
        const handle = root.querySelector('.cm-vega-lite-chart-resize-handle');
        handle.dispatchEvent(new MouseEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientY: 100,
        }));
        handle.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 240 }));
        handle.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true, clientY: 240 }));
        expect(view.state.doc.toString()).toBe(source);
        expect(root.dataset.figaroChartHeight).toBe('340');
        expect(handle.dataset.uiTooltip).toBe('Resize chart vertically');

        view.dispatch({ selection: { anchor: source.indexOf('"height"') } });
        const placeholder = view.dom.querySelector('.cm-vega-lite-chart-source-placeholder');
        expect(view.dom.querySelector('.cm-block-widget--figaro-chart')).toBeNull();
        expect(placeholder).not.toBeNull();
        expect(view.dom.querySelectorAll('.cm-vega-lite-chart-source-line')).toHaveLength(3);
        expect(placeholder.style.getPropertyValue('--cm-diagram-source-height'))
            .toBe('calc(384px - 2lh)');
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
        expect(decorationsIn(view.state, diagramField)).toHaveLength(4);
        expect(view.dom.querySelector('.cm-mermaid-diagram-source-placeholder')).not.toBeNull();

        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        expect(decorationsIn(view.state, diagramField)).toHaveLength(1);
    });

    test('navigation inside revealed source reuses parsed fences and decorations without scanning document text', () => {
        const source = ['Before', '', '```mermaid', 'flowchart TD', ' A --> B', ' B --> C', '```', '', 'After'].join('\n');
        const field = createDiagramField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField);
        view = new EditorView({ state: EditorState.create({
            doc: source,
            extensions: [collapseOnSelectionFacet.of(true), mouseSelectingField, field],
        }), parent: document.body });
        const blocks = view.state.field(field).blocks;
        const read = jest.spyOn(view.state.doc, 'toString');
        try {
            const from = source.indexOf('flowchart');
            view.dispatch({ selection: { anchor: from } });
            const revealed = view.state.field(field);
            expect(revealed.blocks).toBe(blocks);
            for (const head of [from + 1, from + 3, from + 5, from + 3, from + 1]) {
                view.dispatch({ selection: { anchor: head } });
                expect(view.state.field(field)).toBe(revealed);
            }
            view.dispatch({ selection: { anchor: source.length } });
            expect(view.state.field(field).blocks).toBe(blocks);
            expect(view.dom.querySelector('.cm-live-diagram-view')).not.toBeNull();
            expect(read).not.toHaveBeenCalled();
        } finally { read.mockRestore(); }
        view.dispatch({ changes: { from: source.indexOf('A --> B'), to: source.indexOf('A --> B') + 7, insert: 'A --> D' } });
        expect(view.state.field(field).blocks).not.toBe(blocks);
        expect(view.state.field(field).blocks[0].code).toContain('A --> D');
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

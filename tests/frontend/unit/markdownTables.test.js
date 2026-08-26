import MarkdownIt from 'markdown-it';
import { EditorSelection } from '@codemirror/state';

import {
    renderedTableCellMouseSelection,
    tablePreviewOwnsEvent,
} from '../frontend/js/liveMarkdownTablePlugin.js';

import {
    createEditorView,
    getEditorContent,
    initEditor,
    setEditorContent,
} from '../frontend/js/editor.js';

const tableSource = [
    'Before',
    '',
    '| Name | Count |',
    '| :--- | ---: |',
    '| **Alpha** | 2 |',
    '| Beta | 10 |',
    '',
    'After',
].join('\n');

const mergeSource = [
    '| Group | Details | Literal |',
    '| --- | --- | --- |',
    '| Alpha | first<br/>second | `<br/>` |',
    '| ^ | continued | plain |',
    '| ^ | final | plain |',
].join('\n');
const mergeDocumentSource = mergeSource + '\n\nAfter';
const rangeMergeSource = [
    'Before',
    '',
    '| Group | Q1 | Q2 |',
    '| --- | ---: | ---: |',
    '| North<br>10<br>12 | | |',
    '| South | 8 | 9 |',
    '<!-- figaro:table-merge A2:C2 -->',
    '',
    'After',
].join('\n');

function waitForEditorUpdate() {
    return new Promise(resolve => setTimeout(resolve, 40));
}

describe('source-preserving GFM table preview', () => {
    let view;

    beforeAll(async () => {
        window.markdownit = jest.fn(options => new MarkdownIt(options));
        await initEditor();
    });

    afterEach(() => {
        document.querySelector('.editor-context-menu')?.remove();
        view?.destroy();
        view = null;
    });

    afterAll(() => {
        delete window.markdownit;
    });

    test('renders a semantic table while keeping the exact Markdown source', async () => {
        view = createEditorView();
        setEditorContent(tableSource);
        await waitForEditorUpdate();

        const widget = view.dom.querySelector('.cm-block-widget--table');
        expect(widget).not.toBeNull();
        expect(widget.querySelector('.cm-live-table table')).not.toBeNull();
        expect(widget.querySelectorAll('thead th')).toHaveLength(2);
        expect(widget.querySelector('tbody td strong')?.textContent).toBe('Alpha');
        expect(widget.querySelector('thead th:last-child').getAttribute('style')).toContain('text-align:right');
        expect(widget.classList.contains('cm-source-footprint--scroll')).toBe(true);
        expect(widget.dataset.sourceFootprint).toBe('table');
        expect(widget.dataset.sourceLines).toBe('4');
        expect(widget.querySelector('.cm-editor')).toBeNull();
        expect(getEditorContent()).toBe(tableSource);

        view.dispatch({ selection: { anchor: tableSource.indexOf('Alpha') } });
        await waitForEditorUpdate();
        expect(view.dom.querySelector('.cm-block-widget--table')).toBeNull();
        expect(view.dom.querySelector('.cm-content').textContent).toContain('| **Alpha** | 2 |');

        view.dispatch({ selection: { anchor: 0 } });
        await waitForEditorUpdate();
        expect(view.dom.querySelector('.cm-block-widget--table')).not.toBeNull();
        expect(getEditorContent()).toBe(tableSource);
    });

    test('places a primary rendered-cell click at that cell source position', async () => {
        view = createEditorView();
        setEditorContent(tableSource);
        await waitForEditorUpdate();

        const cell = view.dom.querySelector('.cm-live-table tbody tr:last-child td:last-child');
        expect(cell.dataset.figaroSourceRow).toBe('3');
        expect(cell.dataset.figaroSourceColumn).toBe('1');
        cell.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 90,
            clientY: 90,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        await waitForEditorUpdate();

        expect(view.state.selection.main.anchor).toBe(tableSource.indexOf('10'));
        expect(view.state.selection.main.head).toBe(tableSource.indexOf('10'));
        expect(view.dom.querySelector('.cm-block-widget--table')).toBeNull();
        expect(getEditorContent()).toBe(tableSource);
    });

    test('extends a drag that starts in a rendered cell from that source position', async () => {
        view = createEditorView();
        setEditorContent(tableSource);
        await waitForEditorUpdate();

        const cell = view.dom.querySelector('.cm-live-table tbody tr:last-child td:last-child');
        const origin = { button: 0, target: cell, clientX: 90, clientY: 90 };
        const fakeView = {
            state: { sliceDoc: (from, to) => tableSource.slice(from, to) },
            posAtCoords: jest.fn(() => tableSource.indexOf('After')),
        };
        const style = renderedTableCellMouseSelection(fakeView, origin, EditorSelection);
        const initial = style.get(origin).main;
        const dragged = style.get({ clientX: 180, clientY: 180 }).main;

        expect(initial.anchor).toBe(tableSource.indexOf('10'));
        expect(initial.head).toBe(tableSource.indexOf('10'));
        expect(dragged.anchor).toBe(tableSource.indexOf('10'));
        expect(dragged.head).toBe(tableSource.indexOf('After'));
        expect(fakeView.posAtCoords).toHaveBeenCalledWith({ x: 180, y: 180 });
        expect(renderedTableCellMouseSelection(fakeView, { ...origin, shiftKey: true }, EditorSelection))
            .toBeNull();
    });

    test('uses the shared GFM output for line breaks and vertical caret merges', async () => {
        view = createEditorView();
        setEditorContent(mergeDocumentSource);
        await waitForEditorUpdate();
        view.dispatch({ selection: { anchor: mergeDocumentSource.indexOf('After') } });
        await waitForEditorUpdate();

        const table = view.dom.querySelector('.cm-live-table table');
        expect(table).not.toBeNull();
        expect(table.querySelector('tbody tr:first-child td').rowSpan).toBe(3);
        expect(table.querySelectorAll('tbody tr:first-child td:first-child')).toHaveLength(1);
        expect(table.querySelector('tbody tr:first-child td:nth-child(2)').querySelectorAll('br')).toHaveLength(1);
        expect(table.querySelector('tbody tr:first-child td:nth-child(3)').textContent).toBe('<br/>');
        expect(table.textContent).not.toContain('^');
        expect(getEditorContent()).toBe(mergeDocumentSource);
    });

    test('renders editor-created rectangular merges without exposing private metadata', async () => {
        view = createEditorView();
        setEditorContent(rangeMergeSource);
        await waitForEditorUpdate();

        const widget = view.dom.querySelector('.cm-block-widget--table');
        const anchor = widget.querySelector('tbody tr:first-child td');
        expect(anchor.rowSpan).toBe(1);
        expect(anchor.colSpan).toBe(3);
        expect(anchor.dataset.figaroTableMerge).toBe('range');
        expect(widget.querySelector('tbody tr:first-child').cells).toHaveLength(1);
        expect(widget.textContent).not.toContain('figaro:table-merge');
        expect(getEditorContent()).toBe(rangeMergeSource);

        anchor.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 60,
            clientY: 60,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        await waitForEditorUpdate();
        expect(view.dom.querySelector('.cm-block-widget--table')).toBeNull();
        expect(view.state.selection.main.head).toBe(rangeMergeSource.indexOf('North'));
    });

    test('keeps scroll gestures and scrollbar presses inside the rendered preview', () => {
        const surface = document.createElement('div');
        surface.className = 'cm-live-table';
        const table = document.createElement('table');
        const cell = document.createElement('td');
        table.append(cell);
        surface.append(table);
        const root = document.createElement('div');
        root.className = 'cm-block-widget--table';
        root.append(surface);
        Object.defineProperties(surface, {
            clientHeight: { configurable: true, value: 80 },
            clientWidth: { configurable: true, value: 120 },
            scrollHeight: { configurable: true, value: 220 },
            scrollWidth: { configurable: true, value: 120 },
        });
        surface.getBoundingClientRect = () => ({
            top: 0, left: 0, right: 130, bottom: 90, width: 130, height: 90,
        });

        expect(tablePreviewOwnsEvent({ type: 'wheel', target: cell })).toBe(true);
        expect(tablePreviewOwnsEvent({ type: 'touchstart', target: cell })).toBe(true);
        expect(tablePreviewOwnsEvent({ type: 'pointerdown', pointerType: 'touch', target: cell })).toBe(true);
        expect(tablePreviewOwnsEvent({ type: 'mousedown', target: surface })).toBe(true);
        expect(tablePreviewOwnsEvent({ type: 'mousedown', target: root })).toBe(true);
        expect(tablePreviewOwnsEvent({ type: 'mousedown', target: cell, clientX: 127, clientY: 30 })).toBe(true);
        expect(tablePreviewOwnsEvent({ type: 'mousedown', target: cell, clientX: 60, clientY: 30 })).toBe(false);
        expect(tablePreviewOwnsEvent({ type: 'mousedown', target: cell })).toBe(false);
        expect(tablePreviewOwnsEvent({ type: 'mousedown', target: document.body })).toBe(false);
    });

    test('keeps the ordinary editor menu on table content without structural table commands', async () => {
        view = createEditorView();
        setEditorContent(tableSource);
        await waitForEditorUpdate();

        const cell = view.dom.querySelector('.cm-live-table tbody td:first-child');
        expect(cell.dataset.figaroSourceRow).toBe('2');
        expect(cell.dataset.figaroSourceColumn).toBe('0');
        cell.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 80,
            clientY: 80,
        }));
        await waitForEditorUpdate();

        const menu = document.querySelector('.editor-context-menu');
        expect(menu).not.toBeNull();
        expect(menu.getAttribute('aria-label')).toBe('Editor actions');
        expect(menu.querySelector('[data-action^="table-"]')).toBeNull();
        expect(getEditorContent()).toBe(tableSource);
    });
});

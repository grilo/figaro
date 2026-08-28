import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeFolding, foldEffect, unfoldEffect } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    codeBlockField,
    collapseOnSelectionFacet,
    mouseSelectingField,
} from '../frontend/vendored/codemirror-live-markdown/index.js';
import { codeBlockScrollbarGuardExtension } from '../frontend/js/codeBlockInteraction.js';
import { codeBlockScrollbarAxis } from '../frontend/js/core/codeBlockInteractionModel.js';

describe('code block scrollbar hit testing', () => {
    const box = {
        rect: { top: 10, right: 210, bottom: 130, left: 10 },
        clientWidth: 180,
        clientHeight: 100,
        offsetWidth: 200,
        offsetHeight: 120,
        scrollWidth: 360,
        scrollHeight: 300,
        borderTop: 1,
        borderRight: 1,
        borderBottom: 1,
        borderLeft: 1,
    };

    test('distinguishes vertical and horizontal tracks from code content', () => {
        expect(codeBlockScrollbarAxis({ ...box, clientX: 205, clientY: 60 })).toBe('vertical');
        expect(codeBlockScrollbarAxis({ ...box, clientX: 80, clientY: 125 })).toBe('horizontal');
        expect(codeBlockScrollbarAxis({ ...box, clientX: 80, clientY: 60 })).toBeNull();
    });

    test('supports overlay scrollbars without claiming an edge that cannot scroll', () => {
        expect(codeBlockScrollbarAxis({
            ...box,
            offsetWidth: box.clientWidth + 2,
            clientX: 205,
            clientY: 60,
        })).toBe('vertical');
        expect(codeBlockScrollbarAxis({
            ...box,
            scrollHeight: box.clientHeight,
            clientX: 205,
            clientY: 60,
        })).toBeNull();
    });
});

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
                codeBlockScrollbarGuardExtension,
            ],
        });
        view = new EditorView({ state, parent: document.body });

        const line = view.dom.querySelector('.cm-codeblock-line[data-line-index="0"]');
        expect(line).not.toBeNull();
        const footprint = view.dom.querySelector('.cm-codeblock-widget');
        expect(footprint.classList.contains('cm-codeblock-line-numbers')).toBe(true);
        expect(footprint.querySelectorAll('.cm-codeblock-fence')).toHaveLength(2);
        expect(footprint.classList.contains('cm-source-footprint--scroll')).toBe(true);
        expect(footprint.dataset.sourceFootprint).toBe('code');
        expect(footprint.dataset.sourceLines).toBe('3');
        expect(footprint.style.getPropertyValue('--cm-source-footprint-height'))
            .toBe(`${view.defaultLineHeight * 3}px`);

        line.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 0,
        }));

        expect(view.state.selection.main.anchor).toBe(source.indexOf('const answer'));
        expect(view.dom.querySelector('.cm-codeblock-widget')).toBeNull();
    });

    test('keeps a native scrollbar press inside the rendered preview', async () => {
        const fence = '`'.repeat(3);
        const source = [
            fence + 'javascript',
            'const answer = 42;',
            fence,
            'after',
        ].join('\n');
        const state = EditorState.create({
            doc: source,
            selection: { anchor: source.length },
            extensions: [
                collapseOnSelectionFacet.of(true),
                mouseSelectingField,
                markdownLanguage,
                ...codeBlockField({ lineNumbers: true }),
                codeBlockScrollbarGuardExtension,
            ],
        });
        view = new EditorView({ state, parent: document.body });
        const widget = view.dom.querySelector('.cm-codeblock-widget');
        widget.getBoundingClientRect = () => ({
            top: 0,
            right: 200,
            bottom: 100,
            left: 0,
            width: 200,
            height: 100,
        });
        Object.defineProperties(widget, {
            clientWidth: { configurable: true, value: 180 },
            clientHeight: { configurable: true, value: 80 },
            offsetWidth: { configurable: true, value: 200 },
            offsetHeight: { configurable: true, value: 100 },
            scrollWidth: { configurable: true, value: 180 },
            scrollHeight: { configurable: true, value: 240 },
        });
        const selectionBefore = view.state.selection.main.anchor;
        const event = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 196,
            clientY: 50,
        });

        widget.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(view.state.selection.main.anchor).toBe(selectionBefore);
        expect(view.dom.querySelector('.cm-codeblock-widget')).toBe(widget);

        // Browsers may briefly project the native pointer position into the
        // contenteditable selection before the scrollbar press finishes.
        view.dispatch({ selection: { anchor: source.indexOf('const answer') } });
        expect(view.dom.querySelector('.cm-codeblock-widget')).toBeNull();
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(view.state.selection.main.anchor).toBe(selectionBefore);
        expect(view.dom.querySelector('.cm-codeblock-widget')).not.toBeNull();
    });

    test('yields the rendered preview to a native fold and restores it on unfold', () => {
        const fence = '`'.repeat(3);
        const source = [
            fence + 'yaml',
            'enabled: true',
            fence,
            'after',
        ].join('\n');
        const state = EditorState.create({
            doc: source,
            selection: { anchor: source.length },
            extensions: [
                collapseOnSelectionFacet.of(true),
                mouseSelectingField,
                codeFolding(),
                markdownLanguage,
                ...codeBlockField({ lineNumbers: true }),
                codeBlockScrollbarGuardExtension,
            ],
        });
        view = new EditorView({ state, parent: document.body });
        const foldRange = {
            from: view.state.doc.line(1).to,
            to: view.state.doc.line(3).to,
        };

        expect(view.dom.querySelector('.cm-codeblock-widget')).not.toBeNull();
        view.dispatch({ effects: foldEffect.of(foldRange) });

        expect(view.dom.querySelector('.cm-codeblock-widget')).toBeNull();
        expect(view.dom.querySelector('.cm-foldPlaceholder')).not.toBeNull();
        expect(view.state.doc.toString()).toBe(source);

        view.dispatch({ effects: unfoldEffect.of(foldRange) });
        expect(view.dom.querySelector('.cm-foldPlaceholder')).toBeNull();
        expect(view.dom.querySelector('.cm-codeblock-widget')).not.toBeNull();
    });
});

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeFolding, foldEffect, unfoldEffect } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    codeBlockField,
    collapseOnSelectionFacet,
    mouseSelectingField,
} from '../frontend/vendored/codemirror-live-markdown/index.js';

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
            ],
        });
        view = new EditorView({ state, parent: document.body });

        const line = view.dom.querySelector('.cm-codeblock-line[data-line-index="0"]');
        expect(line).not.toBeNull();
        const footprint = view.dom.querySelector('.cm-codeblock-widget');
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

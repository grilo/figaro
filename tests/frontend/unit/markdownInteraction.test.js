describe('markdown editor interactions', () => {
    let view;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="editor-container"></div>
            <span id="status-text"></span>
            <span id="stats-count"></span>
            <span id="backlink-count"></span>
        `;
    });

    afterEach(() => {
        view?.destroy();
        document.body.innerHTML = '';
    });

    test('styles plain blockquotes and navigates a footnote there and back', async () => {
        const { createEditorView, initEditor } = await import('../frontend/js/editor.js');
        await initEditor();
        view = createEditorView();

        const source = [
            '> First quoted line.',
            '> Second quoted line.',
            '',
            'Read the source[^note].',
            '',
            '[^note]: The destination.',
        ].join('\n');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(view.dom.querySelectorAll('.cm-line.cm-blockquote-line')).toHaveLength(2);

        const referencePosition = source.indexOf('[^note]');
        const definitionPosition = source.lastIndexOf('[^note]');
        const footnotes = view.dom.querySelectorAll('.cm-footnote');
        expect(footnotes).toHaveLength(2);

        view.posAtCoords = jest.fn(() => referencePosition + 2);
        footnotes[0].dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
        }));
        expect(view.state.selection.main.anchor).toBe(definitionPosition);

        view.posAtCoords = jest.fn(() => definitionPosition + 2);
        footnotes[1].dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
        }));
        expect(view.state.selection.main.anchor).toBe(referencePosition);
    });
});

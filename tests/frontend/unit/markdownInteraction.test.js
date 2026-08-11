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

    test('navigates rendered and raw fragment links without opening Kanban or creating a note', async () => {
        const { createEditorView, initEditor } = await import('../frontend/js/editor.js');
        const { getState, setState } = await import('../frontend/js/state.js');
        const tab = { id: 'fragment.md', path: 'fragment.md', title: 'fragment.md', type: 'file' };
        setState('openTabs', [tab]);
        setState('activeTabId', tab.id);
        window.go.desktop.App.ReadFile.mockClear();
        window.go.desktop.App.CreateFile.mockClear();
        const confirmDialog = jest.fn().mockResolvedValue(true);
        window.confirmDialog = confirmDialog;

        await initEditor();
        view = createEditorView();
        const source = '# As This\n\n[such](#as-this)\n\n#todo';
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: source },
            selection: { anchor: 0 },
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const widget = view.dom.querySelector('.cm-link-widget');
        expect(widget?.textContent).toBe('such');
        view.posAtCoords = jest.fn(() => source.indexOf('such') + 1);
        widget.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
        }));
        expect(view.state.selection.main.anchor).toBe(0);

        const rawLinkPosition = source.indexOf('#as-this') + 2;
        view.dispatch({ selection: { anchor: rawLinkPosition } });
        await new Promise(resolve => setTimeout(resolve, 0));
        view.posAtCoords = jest.fn(() => rawLinkPosition);
        view.contentDOM.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
        }));

        expect(view.state.selection.main.anchor).toBe(0);
        expect(getState('openTabs')).toEqual([tab]);
        expect(window.go.desktop.App.ReadFile).not.toHaveBeenCalled();
        expect(window.go.desktop.App.CreateFile).not.toHaveBeenCalled();
        expect(confirmDialog).not.toHaveBeenCalled();
    });
});

describe('date shortcuts in the Markdown editor', () => {
    test('@to shows ordered shortcuts and markdown anchors are not Kanban tags', async () => {
        document.body.innerHTML = `
            <div id="editor-container"></div>
            <span id="status-text"></span>
            <span id="stats-count"></span>
            <span id="backlink-count"></span>
        `;

        const { currentCompletions, selectedCompletionIndex } = await import('@codemirror/autocomplete');
        const { createEditorView, initEditor } = await import('../frontend/js/editor.js');
        await initEditor();
        const view = createEditorView();

        try {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: '@to' },
                selection: { anchor: 3 },
                userEvent: 'input.type',
            });
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(currentCompletions(view.state).map(option => option.label)).toEqual(['today', 'tomorrow']);
            expect(selectedCompletionIndex(view.state)).toBe(0);
            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Tab', bubbles: true, cancelable: true,
            }));
            expect(view.state.doc.toString()).toMatch(/^\[\d{4}-\d{2}-\d{2}\]\(\d{4}-\d{2}-\d{2}\.md\)$/);

            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: '[Guide](#link) #todo ' },
            });
            await new Promise(resolve => setTimeout(resolve, 0));
            const hashtags = view.dom.querySelectorAll('.cm-hashtag');
            expect(hashtags).toHaveLength(1);
            expect(hashtags[0].dataset.tag).toBe('todo');

            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: '#urgent #bad #abcd #112233 #11223344 #ffffff-topic',
                },
            });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(Array.from(view.dom.querySelectorAll('.cm-hashtag')).map(element => element.dataset.tag)).toEqual([
                'urgent',
                'ffffff-topic',
            ]);
            expect(view.dom.querySelectorAll('.cm-hex-color-picker')).toHaveLength(4);
        } finally {
            view.destroy();
        }
    });
});

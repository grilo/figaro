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

    test('hashtag completion keeps prose quiet and offers the shared due-date picker for an unchecked task', async () => {
        document.body.innerHTML = `
            <div id="editor-container"></div>
            <span id="status-text"></span>
            <span id="stats-count"></span>
            <span id="backlink-count"></span>
        `;
        const { closeCompletion, currentCompletions } = await import('@codemirror/autocomplete');
        const { createEditorView, initEditor } = await import('../frontend/js/editor.js');
        const { setState } = await import('../frontend/js/state.js');
        setState('kanbanCompletionColumns', ['urgent']);
        await initEditor();
        const view = createEditorView();

        try {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: 'A long paragraph #ur' },
                selection: { anchor: 'A long paragraph #ur'.length },
                userEvent: 'input.type',
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(currentCompletions(view.state).map(option => option.label)).toEqual(['#urgent']);

            closeCompletion(view);
            const inlineCode = '`example #ur `';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: inlineCode },
                selection: { anchor: inlineCode.indexOf(' ') + 4 },
                userEvent: 'input.type',
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(currentCompletions(view.state)).toEqual([]);

            const frontmatter = '---\ntags: #ur\n---';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: frontmatter },
                selection: { anchor: frontmatter.indexOf('\n---') },
                userEvent: 'input.type',
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(currentCompletions(view.state)).toEqual([]);

            const task = '- [ ] Prepare release #todo';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: task },
                selection: { anchor: task.length },
                userEvent: 'input.type',
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(currentCompletions(view.state).map(option => option.label)).toEqual([
                '#todo', 'Add due date…', 'Due today', 'Due tomorrow',
            ]);

            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'ArrowDown', bubbles: true, cancelable: true,
            }));
            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', bubbles: true, cancelable: true,
            }));
            await new Promise(resolve => setTimeout(resolve, 0));
            const picker = document.querySelector('.ui-date-picker');
            expect(picker).not.toBeNull();
            picker.querySelector('[data-date-picker-value]').click();
            await Promise.resolve();
            expect(view.state.doc.toString()).toMatch(
                /^- \[ \] Prepare release #todo \[due \d{4}-\d{2}-\d{2}\]\(\d{4}-\d{2}-\d{2}\.md\)$/
            );
        } finally {
            view.destroy();
        }
    });
});

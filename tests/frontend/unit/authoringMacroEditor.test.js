describe('structured authoring macros in the Markdown editor', () => {
    test('accepts structured macros and opens the sibling Draw.io name prompt through CodeMirror completion', async () => {
        document.body.innerHTML = `
            <main id="app"><div id="editor-container"></div></main>
            <span id="status-text"></span>
            <span id="stats-count"></span>
            <span id="backlink-count"></span>
        `;
        const { currentCompletions } = await import('@codemirror/autocomplete');
        const { scanDiagramFences } = await import('../../../frontend/js/liveDiagramPlugin.js');
        const { scanMarkdownTables } = await import('../../../frontend/js/liveMarkdownTablePlugin.js');
        const { setState } = await import('../../../frontend/js/state.js');
        await import('../../../frontend/js/app.js');
        const {
            createEditorView,
            initEditor,
            setEditorContent,
        } = await import('../../../frontend/js/editor.js');
        const tab = {
            id: 'notes/plan.md',
            path: 'notes/plan.md',
            title: 'plan.md',
            type: 'file',
        };
        setState('openTabs', [tab]);
        setState('activeTabId', tab.id);
        await initEditor();
        const view = createEditorView();
        setEditorContent('', tab.id);
        await new Promise(resolve => setTimeout(resolve, 0));

        const typeMacro = async source => {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: source },
                selection: { anchor: source.length },
                userEvent: 'input.type',
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(currentCompletions(view.state).map(option => option.label)).toEqual([source.slice(1)]);
            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Tab', bubbles: true, cancelable: true,
            }));
            await new Promise(resolve => setTimeout(resolve, 0));
        };

        try {
            await typeMacro('@todo');
            expect(view.state.doc.toString()).toBe('- [ ] ');
            expect(view.state.selection.main.head).toBe(6);

            await typeMacro('@due');
            const picker = document.querySelector('.ui-date-picker[aria-label="Choose due date"]');
            expect(picker).not.toBeNull();
            picker.querySelector('[data-date-picker-day]').click();
            await Promise.resolve();
            expect(view.state.doc.toString()).toMatch(
                /^\[due \d{4}-\d{2}-\d{2}\]\(\d{4}-\d{2}-\d{2}\.md\)$/,
            );

            await typeMacro('@table');
            expect(scanMarkdownTables(view.state)).toHaveLength(1);
            expect(document.querySelector('.markdown-table-editor-modal')).not.toBeNull();
            document.querySelector('.markdown-table-editor-cancel').click();

            await typeMacro('@mermaid');
            expect(scanDiagramFences(view.state.doc)).toHaveLength(1);
            expect(document.querySelector('.mermaid-editor-modal')).not.toBeNull();
            document.querySelector('.mermaid-editor-cancel').click();

            await typeMacro('@drawio');
            const drawioPrompt = document.querySelector('.custom-modal-overlay');
            expect(drawioPrompt.querySelector('.custom-modal-input').value).toBe('diagram1');
            expect(drawioPrompt.querySelector('.custom-modal-context code').textContent).toBe('notes/');
            expect(drawioPrompt.querySelector('.custom-modal-help').textContent)
                .toBe('The .drawio.svg extension is added automatically.');
            drawioPrompt.querySelector('.custom-modal-btn-cancel').click();
            expect(view.state.doc.toString()).toBe('@drawio');

            const fencedMacro = '```text\n@todo\n```';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: fencedMacro },
                selection: { anchor: fencedMacro.indexOf('\n```') },
                userEvent: 'input.type',
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(currentCompletions(view.state)).toEqual([]);
        } finally {
            setState('openTabs', []);
            setState('activeTabId', null);
            document.querySelector('.custom-modal-overlay')?.remove();
            document.querySelector('.ui-date-picker')?.remove();
            document.body.classList.remove('custom-modal-open');
            view.destroy();
        }
    });
});

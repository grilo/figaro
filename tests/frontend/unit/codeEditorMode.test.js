describe('Code file editor mode', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="editor-container"></div>
            <span id="file-type"></span>
            <span id="cursor-position"></span>
            <span id="word-count"></span>
            <span id="char-count"></span>
            <span id="reading-time"></span>
        `;
    });

    test('uses a syntax-highlighted code mode while preserving Vim and the shared view', async () => {
        const { initEditor, createEditorView, configureEditorForFile, toggleVim } = await import('../frontend/js/editor.js');
        const { syntaxTree, getIndentUnit } = await import('@codemirror/language');
        const { indentMore } = await import('@codemirror/commands');
        await initEditor();
        const view = createEditorView();

        await expect(configureEditorForFile('themes/_print.css')).resolves.toBe(true);
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: '/* ![not-a-markdown-image](x.png) */\n.note {\n    color: rebeccapurple;\n}' },
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(view.dom.classList.contains('cm-code-file')).toBe(true);
        expect(view.dom.dataset.fileLanguage).toBe('code');
        expect(document.getElementById('file-type').textContent).toBe('CSS');
        expect(syntaxTree(view.state).topNode.name).toBe('StyleSheet');
        expect(view.dom.querySelector('.cm-link-widget')).toBeNull();
        expect(view.dom.querySelector('.cm-indent-markers')).not.toBeNull();
        expect(getIndentUnit(view.state)).toBe(2);
        expect(view.state.tabSize).toBe(2);
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        expect(indentMore(view)).toBe(true);
        expect(view.state.doc.line(2).text).toMatch(/^ {2}\.note/);
        await toggleVim(true);

        const before = view;
        await configureEditorForFile('main.go');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'package main' } });

        expect(view).toBe(before);
        expect(view.dom.classList.contains('cm-code-file')).toBe(true);
        expect(view.state.doc.toString()).toBe('package main');
    });
});

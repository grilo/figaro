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

        expect(view.dom.querySelector('.cm-markdownBlockGutter')).not.toBeNull();

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
        expect(view.dom.querySelector('.cm-foldGutter')).not.toBeNull();
        expect(getIndentUnit(view.state)).toBe(4);
        expect(view.state.tabSize).toBe(4);
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        expect(indentMore(view)).toBe(true);
        expect(view.state.doc.line(2).text).toMatch(/^ {4}\.note/);
        await toggleVim(true);

        const before = view;
        await configureEditorForFile('main.go');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'package main' } });

        expect(view).toBe(before);
        expect(view.dom.classList.contains('cm-code-file')).toBe(true);
        expect(view.state.doc.toString()).toBe('package main');

        await expect(configureEditorForFile('notes/example.md')).resolves.toBe(true);
        expect(view.dom.querySelector('.cm-markdownBlockGutter')).not.toBeNull();
    });

    test('shares a changed tab size between normal indentation, Vim >, Markdown fences, and code files', async () => {
        const {
            configureEditorForFile,
            getEditorView,
            setEditorTabSize,
            toggleVim,
        } = await import('../frontend/js/editor.js');
        const { indentMore } = await import('@codemirror/commands');
        const { getIndentUnit } = await import('@codemirror/language');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const view = getEditorView();

        setEditorTabSize(6);
        await configureEditorForFile('notes/indent.md');
        const fence = '```js\nconst value = 1;\n```';
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: fence },
            selection: { anchor: fence.indexOf('const') },
        });
        expect(view.state.tabSize).toBe(6);
        expect(getIndentUnit(view.state)).toBe(6);
        expect(indentMore(view)).toBe(true);
        expect(view.state.doc.line(2).text).toBe('      const value = 1;');

        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: fence },
            selection: { anchor: fence.indexOf('const') },
        });
        await toggleVim(true);
        Vim.handleKey(getCM(view), '>', 'user');
        Vim.handleKey(getCM(view), '>', 'user');
        expect(view.state.doc.line(2).text).toBe('      const value = 1;');

        await configureEditorForFile('main.go');
        expect(view.state.tabSize).toBe(6);
        expect(getIndentUnit(view.state)).toBe(6);

        await toggleVim(false);
        setEditorTabSize(4);
        await configureEditorForFile('notes/example.md');
    });

    test('folds Markdown heading sections from the gutter and exposes an accessible control', async () => {
        const { initEditor, createEditorView, configureEditorForFile, setMarkdownBlockGuides } = await import('../frontend/js/editor.js');
        const { foldedRanges } = await import('@codemirror/language');
        await initEditor();
        const view = createEditorView();
        await configureEditorForFile('notes/roadmap.md');
        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: '# Roadmap\nOverview\n## Goals\nGoal body\n# Archive\nArchived body',
            },
            selection: { anchor: 0 },
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const controls = [...view.dom.querySelectorAll('.ui-editor-block-guide')];
        const expanded = controls.find(control => control.textContent === 'h2');
        expect(controls.length).toBeGreaterThanOrEqual(3);
        expect(expanded.tagName).toBe('BUTTON');
        expect(expanded.getAttribute('aria-label')).toBe('Collapse h2 Goals section');
        expect(expanded.getAttribute('aria-expanded')).toBe('true');
        expect(expanded.closest('.cm-markdownBlockGutter').getAttribute('aria-label')).toBe('Markdown block controls');
        expect(expanded.closest('.cm-markdownBlockGutter').classList.contains('cm-editorHelperRail')).toBe(true);
        expect(expanded.closest('.cm-markdownBlockGutter').classList.contains('cm-editorHelperRail-before')).toBe(true);
        expect(view.dom.querySelector('.cm-markdownBlockGuideSpacer').textContent).toHaveLength(16);
        expect(expanded.closest('.cm-gutters').hasAttribute('aria-hidden')).toBe(false);

        expanded.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(view.dom.querySelector('.cm-foldPlaceholder')).not.toBeNull();
        expect(foldedRanges(view.state).size).toBeGreaterThan(0);
        const collapsed = [...view.dom.querySelectorAll(
            '.ui-editor-block-guide[aria-expanded="false"]',
        )].find(control => control.textContent === 'h2');
        expect(collapsed).not.toBeNull();
        expect(collapsed.getAttribute('aria-label')).toBe('Expand h2 Goals section');

        collapsed.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(view.dom.querySelector('.cm-foldPlaceholder')).toBeNull();
        expect(foldedRanges(view.state).size).toBe(0);

        setMarkdownBlockGuides(false);
        expect(view.dom.querySelector('.cm-markdownBlockGutter')).toBeNull();
        expect(view.state.doc.toString()).toContain('## Goals');
        setMarkdownBlockGuides(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(view.dom.querySelector('.cm-markdownBlockGutter')).not.toBeNull();
    });
});

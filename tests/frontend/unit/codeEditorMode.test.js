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

        // Markdown and source files share the same deliberately styled fold
        // control, while their language services continue to own the ranges.
        expect(view.dom.querySelector('.cm-foldGutter')).not.toBeNull();

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

        await expect(configureEditorForFile('notes/example.md')).resolves.toBe(true);
        expect(view.dom.querySelector('.cm-foldGutter')).not.toBeNull();
    });

    test('folds Markdown heading sections from the gutter and exposes an accessible control', async () => {
        const { initEditor, createEditorView, configureEditorForFile } = await import('../frontend/js/editor.js');
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

        const controls = [...view.dom.querySelectorAll('.ui-editor-fold-control')];
        const expanded = controls.find(control => control.getAttribute('aria-expanded') === 'true');
        expect(controls.length).toBeGreaterThanOrEqual(3);
        expect(expanded.tagName).toBe('BUTTON');
        expect(expanded.getAttribute('aria-label')).toBe('Collapse heading section');
        expect(expanded.getAttribute('aria-expanded')).toBe('true');
        expect(expanded.closest('.cm-foldGutter').getAttribute('aria-label')).toBe('Section folding');
        expect(expanded.closest('.cm-gutters').hasAttribute('aria-hidden')).toBe(false);

        expanded.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(view.dom.querySelector('.cm-foldPlaceholder')).not.toBeNull();
        expect(foldedRanges(view.state).size).toBeGreaterThan(0);
        const collapsed = [...view.dom.querySelectorAll(
            '.ui-editor-fold-control[aria-expanded="false"]',
        )].at(-1);
        expect(collapsed).not.toBeNull();
        expect(collapsed.getAttribute('aria-label')).toBe('Expand heading section');

        collapsed.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(view.dom.querySelector('.cm-foldPlaceholder')).toBeNull();
        expect(foldedRanges(view.state).size).toBe(0);
    });
});

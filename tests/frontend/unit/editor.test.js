/**
 * Tests for editor.js - CodeMirror 6 integration
 * These tests catch initialization errors that would cause unhandled promise rejections
 */

describe('Editor Module - CodeMirror Initialization', () => {
    async function configureTaskWorkspace() {
        const { configureEditorWorkspace } = await import('../frontend/js/editor.js');
        const { getState, setState } = await import('../frontend/js/state.js');
        const updateTab = (tabId, patch) => {
            let updated = null;
            setState('openTabs', (getState('openTabs') || []).map(tab => {
                if (tab.id !== tabId) return tab;
                updated = { ...tab, ...patch };
                return updated;
            }));
            return updated;
        };
        const ports = {
            getActiveTab: () => (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId')),
            closeTab: jest.fn(), confirm: jest.fn().mockResolvedValue(true), markTabDirty: jest.fn(), openFile: jest.fn(),
            openPDFPreview: jest.fn(), openRawTextPreview: jest.fn(), openTab: jest.fn(),
            refreshFileTree: jest.fn(),
            recordTabContent: jest.fn((tabId, generation, content) => Boolean(updateTab(tabId, { _content: content, _editGeneration: generation }))),
            recordTabCursor: jest.fn((tabId, cursorState) => Boolean(updateTab(tabId, { cursorState }))),
            recordTabEdit: jest.fn(tabId => {
                const tab = (getState('openTabs') || []).find(candidate => candidate.id === tabId);
                return tab ? updateTab(tabId, {
                    dirty: true,
                    _editGeneration: (tab._editGeneration || 0) + 1,
                }) : null;
            }),
            replaceActiveFileTab: jest.fn(),
            saveActiveFile: jest.fn(), saveFileSnapshot: jest.fn().mockResolvedValue({ success: true }), switchTab: jest.fn(),
        };
        configureEditorWorkspace(ports);
        return ports;
    }

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('Module Loading Safety', () => {
        test('builds a document-specific accessible editor name independently from window identity', async () => {
            const { editorAccessibleLabel } = await import('../frontend/js/editor.js');

            expect(editorAccessibleLabel({
                language: { kind: 'markdown', label: 'Markdown' },
                tab: { title: 'Project brief.md', path: 'Projects/Project brief.md' },
            })).toBe('Markdown editor — Project brief.md');
            expect(editorAccessibleLabel({
                language: { kind: 'code', label: 'JavaScript' },
                tab: { title: 'build.js', path: 'scripts/build.js' },
            })).toBe('JavaScript editor — build.js');
        });

        test('initializes the statically imported indentation markers for native webviews', async () => {
            const { initEditor } = await import('../frontend/js/editor.js');

            await expect(initEditor()).resolves.toBeUndefined();
        });
    });

    describe('No-Editor Guard Tests', () => {
        test('editor functions should handle missing editor gracefully', async () => {
            const { getEditorContent, setEditorContent, focusEditor, saveCursorState, restoreCursorState } = await import('../frontend/js/editor.js');
            
            expect(getEditorContent()).toBe('');
            expect(() => setEditorContent('# Test')).not.toThrow();
            expect(() => focusEditor()).not.toThrow();
            expect(saveCursorState('test-tab')).toBeNull();
            expect(() => restoreCursorState('test-tab', null)).not.toThrow();
            expect(() => restoreCursorState('test-tab', undefined)).not.toThrow();
        });
    });

    test.each([['existing note', false], ['new note and tree refresh', true]])('rendered linked-note clicks wire %s through workspace adapters', async (_scenario, create) => {
        document.body.innerHTML = '<div id="editor-container"></div>';
        const ports = await configureTaskWorkspace();
        const { setState } = await import('../frontend/js/state.js');
        setState('openTabs', []);
        setState('fileTreeData', []);
        const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
        await initEditor();
        const view = createEditorView();
        window.go.desktop.App.ReadFile.mockResolvedValueOnce(create ? null : { content: '# Target', mtime: 7 });
        if (create) window.go.desktop.App.CreateFile.mockResolvedValueOnce({ success: true, mtime: 7 });
        try {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Above\n\n[a link]\n\nBelow\n\n[a link]: notes/Target.md' }, selection: { anchor: 0 } });
            const link = view.dom.querySelector('.cm-reference-link-widget');
            expect(link).not.toBeNull();
            link.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            if (create) {
                expect(window.go.desktop.App.CreateFile).toHaveBeenCalledWith('notes/Target.md', '# Target\n\n');
                expect(ports.openTab).toHaveBeenCalledWith('notes/Target.md', 'Target.md', 'file', { path: 'notes/Target.md', mtime: 7 }, true);
                expect(ports.refreshFileTree).toHaveBeenCalledTimes(1);
                expect(ports.openTab.mock.invocationCallOrder[0]).toBeLessThan(ports.refreshFileTree.mock.invocationCallOrder[0]);
            } else {
                expect(ports.replaceActiveFileTab).toHaveBeenCalledWith('notes/Target.md', 'Target.md', 'file', { path: 'notes/Target.md', mtime: 7 });
                expect(ports.refreshFileTree).not.toHaveBeenCalled();
            }
        } finally { view.destroy(); }
    });

    test('protects literal Markdown contexts from rich-paste conversion', async () => {
        const { EditorState } = await import('@codemirror/state');
        const { markdownLanguage } = await import('@codemirror/lang-markdown');
        const { markdownRichPasteProtectedContext } = await import('../frontend/js/editor.js');
        const source = [
            '---',
            'title: Note',
            '---',
            '',
            'Plain prose with `inline code` and [a link](https://example.com).',
            '',
            '```js',
            'const value = 1;',
            '```',
        ].join('\n');
        const protectedAt = position => markdownRichPasteProtectedContext(EditorState.create({
            doc: source,
            selection: { anchor: position },
            extensions: [markdownLanguage],
        }));

        expect(protectedAt(source.indexOf('title'))).toBe(true);
        expect(protectedAt(source.indexOf('inline code') + 2)).toBe(true);
        expect(protectedAt(source.indexOf('https://'))).toBe(true);
        expect(protectedAt(source.indexOf('const value'))).toBe(true);
        expect(protectedAt(source.indexOf('Plain prose') + 2)).toBe(false);
    });

    test('treats code, raw HTML, URLs and frontmatter as literal text for source-rewriting conveniences', async () => {
        const { EditorState } = await import('@codemirror/state');
        const { markdownLanguage } = await import('@codemirror/lang-markdown');
        const { markdownLiteralContextAt } = await import('../frontend/js/editor.js');
        const source = [
            '---',
            'pattern: "[^a]"',
            '---',
            '',
            'Prose with a note.[^1] and `[^b]` inline.',
            '',
            '```js',
            'const re = /[^c]+/;',
            '```',
            '',
            '[^1]: The definition.',
        ].join('\n');
        const state = EditorState.create({ doc: source, extensions: [markdownLanguage] });
        const literalAt = needle => markdownLiteralContextAt(state, source.indexOf(needle) + 2);

        expect(literalAt('[^a]')).toBe(true);
        expect(literalAt('[^b]')).toBe(true);
        expect(literalAt('[^c]')).toBe(true);
        expect(literalAt('[^1] and')).toBe(false);
        expect(literalAt('[^1]: The')).toBe(false);
    });

    test('finds the rendered block beside the cursor line exactly as a whole-note scan would', async () => {
        const { EditorState } = await import('@codemirror/state');
        const { ensureSyntaxTree } = await import('@codemirror/language');
        const { markdownLanguage } = await import('@codemirror/lang-markdown');
        const { adjacentVimRenderedBlock, vimRenderedBlockRanges } = await import('../frontend/js/editor.js');
        const source = [
            '---', 'title: Note', '---', 'Intro paragraph.', '```js', 'const a = 1;', '```', 'Between blocks.',
            '| A | B |', '| - | - |', '| 1 | 2 |', '', '> quote', '    indented code', 'Tail.',
        ].join('\n');
        const base = EditorState.create({ doc: source, extensions: [markdownLanguage] });
        ensureSyntaxTree(base, source.length, 5000);
        const all = vimRenderedBlockRanges(base);
        expect(all.map(range => range.kind)).toEqual(expect.arrayContaining(['source', 'table']));

        for (let number = 1; number <= base.doc.lines; number += 1) {
            const state = base.update({ selection: { anchor: base.doc.line(number).from } }).state;
            for (const forward of [true, false]) {
                const expected = all.find(range => {
                    const fromLine = state.doc.lineAt(range.from).number;
                    const toLine = state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
                    return forward ? fromLine === number + 1 : toLine === number - 1;
                }) || null;
                expect(adjacentVimRenderedBlock({ state }, forward)).toEqual(expected);
            }
        }
        // From "Intro paragraph." the fence below is entered; from "Tail." nothing is below.
        const intro = base.update({ selection: { anchor: source.indexOf('Intro') } }).state;
        expect(adjacentVimRenderedBlock({ state: intro }, true)).toMatchObject({ kind: 'source', from: source.indexOf('```js') });
        expect(adjacentVimRenderedBlock({ state: intro }, false)).toMatchObject({ frontmatter: true });
        const tail = base.update({ selection: { anchor: source.indexOf('Tail.') } }).state;
        expect(adjacentVimRenderedBlock({ state: tail }, true)).toBeNull();
    });

    test('delegates Windows printable and dead-key input to the native editor', async () => {
        const { initEditor, createEditorView, toggleVim } = await import('../frontend/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const platformDescriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
        const restorePlatform = () => {
            if (platformDescriptor) {
                Object.defineProperty(navigator, 'platform', platformDescriptor);
            } else {
                delete navigator.platform;
            }
        };

        document.body.innerHTML = `
            <div id="editor-container"></div>
            <div id="editor-search-bar" style="display:none">
                <input id="editor-search-input" />
                <span id="editor-search-counter"></span>
                <button id="editor-search-prev"></button>
                <button id="editor-search-next"></button>
                <button id="editor-search-close"></button>
            </div>
            <span id="status-text"></span>
            <span id="stats-count"></span>
            <span id="backlink-count"></span>
        `;

        try {
            await initEditor();
            const view = createEditorView();
            expect(view).not.toBeNull();

            const dispatchKey = ({ key, code, altGraph = false }) => {
                const event = new KeyboardEvent('keydown', {
                    key,
                    code,
                    bubbles: true,
                    cancelable: true,
                });
                if (altGraph) {
                    Object.defineProperty(event, 'getModifierState', {
                        configurable: true,
                        value: modifier => modifier === 'AltGraph',
                    });
                }
                view.contentDOM.dispatchEvent(event);
                return event;
            };
            const regularBacktick = dispatchKey({ key: '`', code: 'BracketLeft' });
            const regularTildeDeadKey = dispatchKey({ key: 'Dead', code: 'Digit4', altGraph: true });
            const regularBracketDeadKey = dispatchKey({ key: 'Dead', code: 'BracketLeft' });

            expect(regularBacktick.defaultPrevented).toBe(false);
            expect(regularTildeDeadKey.defaultPrevented).toBe(false);
            expect(regularBracketDeadKey.defaultPrevented).toBe(false);
            expect(view.state.doc.toString()).toBe('');

            await toggleVim(true);
            Vim.handleKey(getCM(view), 'i', 'user');
            const vimBacktick = dispatchKey({ key: '`', code: 'BracketLeft' });
            const vimTildeDeadKey = dispatchKey({ key: 'Dead', code: 'Digit4', altGraph: true });

            expect(vimBacktick.defaultPrevented).toBe(false);
            expect(vimTildeDeadKey.defaultPrevented).toBe(false);
            expect(view.state.doc.toString()).toBe('');
            await toggleVim(false);
        } finally {
            restorePlatform();
            document.body.innerHTML = '';
        }
    });

    test('keeps a selection when its own context menu is opened', async () => {
        const { shouldPreserveSelectionForContextMenu } = await import('../frontend/js/editor.js');

        expect(shouldPreserveSelectionForContextMenu({ main: { from: 4, to: 12 } }, 8)).toBe(true);
        expect(shouldPreserveSelectionForContextMenu({ main: { from: 4, to: 12 } }, 13)).toBe(false);
        expect(shouldPreserveSelectionForContextMenu({ main: { from: 4, to: 4 } }, 4)).toBe(false);
    });

    test('calculates a hanging indent for wrapped Markdown list items', async () => {
        const { markdownListHangingIndentAttributes } = await import('../frontend/js/markdownIndentation.js');

        expect(markdownListHangingIndentAttributes('- An item')).toEqual({
            class: 'cm-markdown-list-item',
            style: '--cm-list-hanging-indent: 2ch; --cm-list-hanging-outdent: -2ch;',
        });
        expect(markdownListHangingIndentAttributes('    12. Nested item')).toEqual({
            class: 'cm-markdown-list-item',
            style: '--cm-list-hanging-indent: 8ch; --cm-list-hanging-outdent: -8ch;',
        });
        expect(markdownListHangingIndentAttributes('\t- Nested item', { tabSize: 8 })).toEqual({
            class: 'cm-markdown-list-item',
            style: '--cm-list-hanging-indent: 10ch; --cm-list-hanging-outdent: -10ch;',
        });
        expect(markdownListHangingIndentAttributes('Not a list')).toBeNull();
    });

    test('calculates active and passive hanging indents for wrapped blockquotes', async () => {
        const { markdownBlockquoteHangingIndentAttributes } = await import('../frontend/js/markdownIndentation.js');

        expect(markdownBlockquoteHangingIndentAttributes('> A quote')).toEqual({
            class: 'cm-blockquote-line',
            style: '--cm-blockquote-hanging-indent: 1ch; --cm-blockquote-hanging-outdent: -1ch;',
        });
        expect(markdownBlockquoteHangingIndentAttributes('> A quote', {
            markerVisible: true,
        })).toEqual({
            class: 'cm-blockquote-line',
            style: '--cm-blockquote-hanging-indent: 2ch; --cm-blockquote-hanging-outdent: -2ch;',
        });
        expect(markdownBlockquoteHangingIndentAttributes('  > > Nested quote')).toEqual({
            class: 'cm-blockquote-line',
            style: '--cm-blockquote-hanging-indent: 4ch; --cm-blockquote-hanging-outdent: -4ch;',
        });
        expect(markdownBlockquoteHangingIndentAttributes('\t> Quote', { tabSize: 8 })).toEqual({
            class: 'cm-blockquote-line',
            style: '--cm-blockquote-hanging-indent: 9ch; --cm-blockquote-hanging-outdent: -9ch;',
        });
        expect(markdownBlockquoteHangingIndentAttributes('Not a quote')).toBeNull();
    });

    test('resolves conventional wikilink targets independently from their aliases', async () => {
		const { normalizeWikiLinkTarget, wikiLinkAtPosition } = await import('../frontend/js/editor.js');
		const line = 'See [[notes/Guide Note.md#start|Readable guide]] now';
		expect(wikiLinkAtPosition(line, 12)).toEqual({
			target: 'notes/Guide Note.md#start',
			label: 'Readable guide',
		});
		expect(normalizeWikiLinkTarget('notes/Guide%20Note#start')).toBe('notes/Guide Note.md');
	});

    test('reuses a short-lived file read for repeated link hover previews', async () => {
        const { fetchLinkPreviewFile, invalidateLinkPreviewCache } = await import('../frontend/js/editor.js');
        invalidateLinkPreviewCache();
        window.go.desktop.App.ReadFile.mockResolvedValueOnce({ content: '# Linked note', path: 'notes/linked.md' });

        const [first, second] = await Promise.all([
            fetchLinkPreviewFile('notes/linked.md'),
            fetchLinkPreviewFile('notes/linked.md'),
        ]);

        expect(first).toEqual(second);
        expect(window.go.desktop.App.ReadFile).toHaveBeenCalledTimes(1);
        invalidateLinkPreviewCache('notes/linked.md');
        await fetchLinkPreviewFile('notes/linked.md');
        expect(window.go.desktop.App.ReadFile).toHaveBeenCalledTimes(2);
    });

    test('normalizes WebKitGTK Unidentified Shift+Tab for CodeMirror key handling', async () => {
        const { normalizeWebKitShiftTab } = await import('../frontend/js/editor.js');
        const target = document.createElement('div');
        const normalizedEvents = [];
        let handled = false;
        target.addEventListener('keydown', event => {
            normalizedEvents.push({
                key: event.key,
                code: event.code,
                shiftKey: event.shiftKey,
            });
            if (event.key === 'Unidentified') handled = normalizeWebKitShiftTab(event);
        });
        const event = new KeyboardEvent('keydown', {
            key: 'Unidentified',
            code: 'Tab',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        target.dispatchEvent(event);

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(normalizedEvents).toEqual([
            { key: 'Unidentified', code: 'Tab', shiftKey: true },
            { key: 'Tab', code: 'Tab', shiftKey: true },
        ]);
    });

    test('copies the selected editor-state text through the Clipboard API', async () => {
        const { copyEditorSelection } = await import('../frontend/js/editor.js');
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });

        try {
            const view = {
                state: {
                    selection: { main: { from: 6, to: 10 } },
                    sliceDoc: jest.fn(() => 'copy'),
                },
            };

            await expect(copyEditorSelection(view)).resolves.toBe(true);
            expect(view.state.sliceDoc).toHaveBeenCalledWith(6, 10);
            expect(writeText).toHaveBeenCalledWith('copy');
        } finally {
            if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
            else delete navigator.clipboard;
        }
    });

    describe('Editor View Creation', () => {
        test('createEditorView should return null when container missing', async () => {
            const { createEditorView } = await import('../frontend/js/editor.js');
            const result = createEditorView();
            expect(result).toBeNull();
        });
    });

    describe('Full Editor Initialization (catches missing exports)', () => {
        beforeEach(() => {
            // Create the exact DOM structure createEditorView expects
            document.body.innerHTML = `
                <div id="editor-container"></div>
                <div id="editor-search-bar" style="display:none">
                    <input id="editor-search-input" />
                    <span id="editor-search-counter"></span>
                    <button id="editor-search-prev"></button>
                    <button id="editor-search-next"></button>
                    <button id="editor-search-close"></button>
                </div>
                <span id="status-text"></span>
                <span id="stats-count"></span>
                <span id="backlink-count"></span>
            `;
        });

        afterEach(() => {
            // Clean up editor view to avoid leaks
            document.body.innerHTML = '';
        });

        test('createEditorView should create an EditorView when initialized', async () => {
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');

            // Track unhandled rejections
            const rejections = [];
            const rejectionHandler = (event) => {
                rejections.push(event.reason);
                event.preventDefault();
            };
            window.addEventListener('unhandledrejection', rejectionHandler);

            try {
                // This loads all CodeMirror modules
                await initEditor();

                // This creates the editor - would throw if any imported symbol is undefined
                const view = createEditorView();

                expect(view).not.toBeNull();
                expect(view).toBeDefined();
                // Verify it's a real EditorView by checking key properties
                expect(view.state).toBeDefined();
                expect(view.dom).toBeDefined();
                // Verify the editor DOM has expected CM6 structure
                expect(view.dom.classList.contains('cm-editor')).toBe(true);
                // Verify we can dispatch a transaction (editor is functional)
                view.dispatch({ changes: { from: 0, insert: 'test' } });
                expect(view.state.doc.toString()).toBe('test');
            } finally {
                window.removeEventListener('unhandledrejection', rejectionHandler);
            }

            // If any unhandled rejections occurred, fail the test
            if (rejections.length > 0) {
                throw new Error(`Unhandled promise rejections: ${rejections.map(r => r.message || r).join(', ')}`);
            }
        });

        test('editor should accept typing (dispatch transactions)', async () => {
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');

            await initEditor();
            const view = createEditorView();

            expect(view).not.toBeNull();

            // Reset content (previous test may have left content in module-level editorView)
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: '' }
            });

            // Simulate typing by dispatching a transaction
            view.dispatch({
                changes: { from: 0, insert: '# Hello World\n\nType something here.' }
            });

            const content = view.state.doc.toString();
            expect(content).toBe('# Hello World\n\nType something here.');
        });

        test('renders task checkboxes as named source-backed controls for pointer and keyboard clicks', async () => {
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');

            await initEditor();
            const view = createEditorView();
            const source = 'Above\n- [ ] Review **release** notes\nBelow';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: source },
                selection: { anchor: source.length },
            });
            await new Promise(resolve => setTimeout(resolve, 0));

            let checkbox = view.dom.querySelector('.cm-task-checkbox');
            expect(checkbox).not.toBeNull();
            expect(checkbox.getAttribute('aria-label')).toBe('Mark “Review release notes” complete');
            expect(checkbox.closest('.cm-task-checkbox-hitbox')).not.toBeNull();

            checkbox.focus();
            checkbox.click();
            await new Promise(resolve => requestAnimationFrame(resolve));
            expect(view.state.doc.toString()).toBe('Above\n- [x] Review **release** notes\nBelow');
            checkbox = view.dom.querySelector('.cm-task-checkbox');
            expect(checkbox.getAttribute('aria-label')).toBe('Mark “Review release notes” incomplete');
            expect(document.activeElement).toBe(checkbox);

            checkbox.closest('.cm-task-checkbox-hitbox').dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                detail: 1,
            }));
            expect(view.state.doc.toString()).toBe(source);
        });

        test('opens task Kanban suggestions and Calendar actions from approved helper-rail buttons', async () => {
            await configureTaskWorkspace();
            const {
                acceptCompletion,
                currentCompletions,
                setSelectedCompletion,
            } = await import('@codemirror/autocomplete');
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            const { getState, setState } = await import('../frontend/js/state.js');
            setState('kanbanCompletionColumns', ['urgent']);
            const tab = { id: 'tasks.md', path: 'tasks.md', title: 'tasks.md', type: 'file', dirty: false };
            setState('openTabs', [tab]);
            setState('activeTabId', tab.id);

            await initEditor();
            const view = createEditorView();
            // jsdom gives gutter elements zero geometry, so keep the exercised
            // task on the first line; the browser regression owns real line mapping.
            const source = '- [ ] Ship release\nBelow';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: source },
                selection: { anchor: source.length },
            });
            await new Promise(resolve => setTimeout(resolve, 0));

            let taskActions = view.dom.querySelector('.cm-task-action-guide');
            const kanban = taskActions.querySelector('.cm-task-kanban-action');
            const calendar = taskActions.querySelector('.cm-task-calendar-action');
            expect(taskActions.getAttribute('role')).toBe('group');
            expect(kanban.classList.contains('ui-icon-button--small')).toBe(true);
            expect(kanban.getAttribute('aria-label')).toBe('Assign task to Kanban column');
            expect(kanban.getAttribute('aria-haspopup')).toBe('listbox');
            expect(calendar.classList.contains('ui-icon-button--small')).toBe(true);
            expect(calendar.getAttribute('aria-label')).toBe('Task due date');
            expect(calendar.getAttribute('aria-haspopup')).toBe('dialog');

            calendar.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                detail: 1,
            }));
            await new Promise(resolve => setTimeout(resolve, 0));
            const picker = document.querySelector('.ui-date-picker');
            expect(picker.getAttribute('aria-label')).toBe('Task due date');
            picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(view.state.doc.toString()).toBe(source);

            taskActions = view.dom.querySelector('.cm-task-action-guide');
            taskActions.querySelector('.cm-task-kanban-action').dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                detail: 1,
            }));
            await new Promise(resolve => setTimeout(resolve, 100));
            const completions = currentCompletions(view.state);
            expect(completions.map(option => option.label)).toEqual(['#todo', '#wip', '#done', '#urgent']);
            expect(document.querySelector('.cm-tooltip-autocomplete')).not.toBeNull();
            view.dispatch({ effects: setSelectedCompletion(3) });
            expect(acceptCompletion(view)).toBe(true);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(view.state.doc.line(1).text).toBe(
                '- [ ] Ship release #urgent',
            );
            expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1);
            expect(view.state.selection.main.head).toBe(view.state.doc.line(1).to);
            expect(view.dom.querySelector('.cm-task-calendar-action').getAttribute('aria-label'))
                .toBe('Task due date');
            // Reopening the same rail choice replaces a sole tag, not a second
            // hidden board membership. Each choice still uses the normal list.
            view.dom.querySelector('.cm-task-kanban-action').click();
            await new Promise(resolve => setTimeout(resolve, 100));
            view.dispatch({ effects: setSelectedCompletion(1) });
            expect(acceptCompletion(view)).toBe(true);
            expect(view.state.doc.line(1).text).toBe('- [ ] Ship release #wip');
            const { undo } = await import('@codemirror/commands');
            expect(undo(view)).toBe(true);
            expect(view.state.doc.line(1).text).toBe('- [ ] Ship release #urgent');
        });

        test('external changes that touch no image keep rendered previews mounted', async () => {
            await configureTaskWorkspace();
            const { initEditor, createEditorView, setEditorContent } = await import('../frontend/js/editor.js');
            const { setState } = await import('../frontend/js/state.js');
            const note = { id: 'note.md', path: 'note.md', type: 'file' };
            setState('openTabs', [note]); setState('activeTabId', note.id);
            await initEditor();
            const view = createEditorView();
            await setEditorContent('Intro\n\n![One](one.png)\n\nOutro', note.id);
            await new Promise(resolve => setTimeout(resolve, 0));
            view.dispatch({ selection: { anchor: 0 } });
            const image = () => view.dom.querySelector('.cm-image-widget');
            const original = image();
            expect(original).not.toBeNull();
            const refreshed = changedPaths => document.dispatchEvent(new CustomEvent('vault-file-tree-refreshed', { detail: { tree: [], changedPaths } }));
            refreshed(['Other/notes.md', 'Other/~$lock.docx']);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(image()).toBe(original);
            refreshed(['one.png']);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(image()).not.toBe(original);
        });

        test('task Calendar handoff refuses a different active note even with identical source', async () => {
            await configureTaskWorkspace();
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            const { setState } = await import('../frontend/js/state.js');
            const first = { id: 'first.md', path: 'first.md', type: 'file' };
            const second = { id: 'second.md', path: 'second.md', type: 'file' };
            setState('openTabs', [first, second]); setState('activeTabId', first.id);
            await initEditor();
            const view = createEditorView();
            const source = '- [ ] Shared title #todo';
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source }, selection: { anchor: source.length } });
            await new Promise(resolve => setTimeout(resolve, 0));
            const clickAction = () => view.dom.querySelector('.cm-task-calendar-action').dispatchEvent(new MouseEvent('click', {
                bubbles: true, cancelable: true, detail: 1,
            }));
            let resolveDates;
            window.go.desktop.App.GetTaskSchedules.mockImplementationOnce(() => new Promise(resolve => { resolveDates = resolve; }));
            clickAction();
            setState('activeTabId', second.id);
            resolveDates([]); await new Promise(resolve => setTimeout(resolve, 0));
            expect(document.querySelector('.ui-date-picker')).toBeNull();
            setState('activeTabId', first.id);
            clickAction(); await new Promise(resolve => setTimeout(resolve, 0));
            const picker = document.querySelector('.ui-date-picker');
            expect(picker).not.toBeNull();
            setState('activeTabId', second.id);
            picker.querySelector('[data-date-picker-day]').click();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(window.go.desktop.App.SetTaskDueDate).not.toHaveBeenCalled();
            expect(view.state.doc.toString()).toBe(source);
        });

        test.each(['markdown', 'wikilink'])('the checklist Calendar writes a %s date link, saves exact source, and preserves one-step undo', async style => {
            const ports = await configureTaskWorkspace();
            window.go.desktop.App.SetTaskDueDate.mockResolvedValue({ success: true });
            const linkStyle = await import('../frontend/js/linkStyle.js');
            const preference = jest.spyOn(linkStyle, 'getLinkStylePreference').mockReturnValue(style);
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            const { setState } = await import('../frontend/js/state.js');
            const { undo, redo } = await import('@codemirror/commands');
            const tab = { id: 'tasks.md', path: 'tasks.md', type: 'file' };
            setState('openTabs', [tab]); setState('activeTabId', tab.id);
            await initEditor();
            const view = createEditorView();
            const source = '- [ ] Ship [[2026-01-01]] #todo\nBelow';
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source }, selection: { anchor: source.length } });
            await new Promise(resolve => setTimeout(resolve, 0));
            try {
                view.dom.querySelector('.cm-task-calendar-action').click();
                await new Promise(resolve => setTimeout(resolve, 0));
                const day = document.querySelector('.ui-date-picker [data-date-picker-day]');
                const date = day.dataset.datePickerDay;
                const link = style === 'wikilink' ? `[[${date}]]` : `[${date}](${date}.md)`;
                day.click();
                await new Promise(resolve => setTimeout(resolve, 0));
                const updated = `- [ ] Ship ${link} #todo\nBelow`;
                expect(view.state.doc.toString()).toBe(updated);
                expect(ports.saveFileSnapshot).toHaveBeenCalledWith(tab, updated, { failurePrompt: 'always' });
                expect(window.go.desktop.App.SetTaskDueDate).toHaveBeenCalledWith(
                    { file: tab.path, line: 1, source: updated.split('\n')[0] }, date,
                );
                expect(view.hasFocus).toBe(true);
                expect(undo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe(source);
                expect(redo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe(updated);
                await new Promise(resolve => setTimeout(resolve, 0));
                view.dom.querySelector('.cm-task-calendar-action').click();
                await new Promise(resolve => setTimeout(resolve, 0));
                document.querySelectorAll('.ui-date-picker [data-date-picker-day]')[1].click();
                await new Promise(resolve => setTimeout(resolve, 0));
                expect(view.state.doc.toString()).not.toBe(updated);
                expect(undo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe(updated);
                view.dispatch({ selection: { anchor: view.state.doc.length } });
                await new Promise(resolve => setTimeout(resolve, 0));
                const rendered = view.dom.querySelector(style === 'wikilink' ? '.cm-wikilink-widget' : '.cm-link-widget');
                expect(rendered?.textContent).toContain(date);
            } finally {
                preference.mockRestore(); view.destroy();
            }
        });

        test('mounts a requested Properties body selection in the real CodeMirror document', async () => {
            const { setState } = await import('../frontend/js/state.js');
            const { initEditor, createEditorView, setEditorContent } = await import('../frontend/js/editor.js');
            const source = '---\ntitle: Report\n---\n# Body';
            const bodyStart = source.indexOf('# Body');
            const tab = {
                id: 'properties-body.md',
                path: 'properties-body.md',
                title: 'Properties body',
                type: 'file',
            };

            setState('openTabs', [tab]);
            setState('activeTabId', tab.id);
            await initEditor();
            const view = createEditorView();
            setEditorContent(source, tab.id, { anchor: bodyStart, head: bodyStart });
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(view.state.doc.toString()).toBe(source);
            expect(view.state.selection.main.anchor).toBe(bodyStart);
            expect(view.state.selection.main.head).toBe(bodyStart);
            expect(view.dom.querySelector('.cm-frontmatter')).not.toBeNull();

            setState('openTabs', []);
            setState('activeTabId', null);
        });

        test('keeps undo history inside the active file buffer while delayed session saves complete', async () => {
            window.go.desktop.App.SaveSession.mockResolvedValue({ success: true });
            const { redo, redoDepth, undo, undoDepth } = await import('@codemirror/commands');
            const { setState } = await import('../frontend/js/state.js');
            const {
                initEditor,
                createEditorView,
                getEditorDocumentTabId,
                setEditorContent,
            } = await import('../frontend/js/editor.js');

            await configureTaskWorkspace();
            await initEditor();
            jest.useFakeTimers();
            const view = createEditorView();
            try {
                const fileTabs = ['first.md', 'second.md', 'third.md'].map(id => ({
                    id,
                    path: id,
                    title: id,
                    type: 'file',
                }));
                setState('openTabs', fileTabs);
                const mount = async (tabId, content) => {
                    setState('activeTabId', tabId);
                    setEditorContent(content, tabId);
                    await jest.advanceTimersByTimeAsync(0);
                    expect(getEditorDocumentTabId()).toBe(tabId);
                };

                await mount('first.md', 'First buffer');
                view.dispatch({ changes: { from: view.state.doc.length, insert: ' edit' } });
                expect(undoDepth(view.state)).toBe(1);

                // Cursor movement stays in memory: no delayed session write.
                const writes = window.go.desktop.App.SaveSession.mock.calls.length;
                view.dispatch({ selection: { anchor: view.state.doc.length } });
                await jest.advanceTimersByTimeAsync(350);
                expect(window.go.desktop.App.SaveSession).toHaveBeenCalledTimes(writes);

                await mount('second.md', 'Second buffer');
                expect(undo(view)).toBe(false);
                expect(redo(view)).toBe(false);
                expect(view.state.doc.toString()).toBe('Second buffer');

                view.dispatch({ changes: { from: view.state.doc.length, insert: ' edit' } });
                expect(undo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe('Second buffer');
                expect(redoDepth(view.state)).toBe(1);

                // Ownership still needs a fresh history boundary when the next
                // buffer happens to contain exactly the same source text.
                await mount('third.md', 'Second buffer');
                expect(undo(view)).toBe(false);
                expect(redo(view)).toBe(false);
                expect(view.state.doc.toString()).toBe('Second buffer');

                // Returning to the unchanged first buffer restores only its own
                // history, never an event captured from the intervening buffers.
                await mount('first.md', 'First buffer edit');
                expect(undo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe('First buffer');
                expect(redo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe('First buffer edit');

                // A changed external snapshot invalidates that tab's saved
                // history instead of applying old positions to new source.
                await mount('second.md', 'Externally changed second buffer');
                expect(undo(view)).toBe(false);
                expect(redo(view)).toBe(false);
                expect(view.state.doc.toString()).toBe('Externally changed second buffer');
            } finally {
                view.destroy();
                jest.clearAllTimers();
                jest.useRealTimers();
                setState('openTabs', []);
                setState('activeTabId', null);
            }
        });

        test('mounts a CRLF source whose requested selection lies past the CodeMirror document', async () => {
            const { setState } = await import('../frontend/js/state.js');
            const { initEditor, createEditorView, getEditorDocumentTabId, setEditorContent } = await import('../frontend/js/editor.js');
            const source = '---\r\ntitle: x\r\ntags: a\r\n---\r\n';
            const tab = { id: 'crlf.md', path: 'crlf.md', title: 'crlf.md', type: 'file' };

            setState('openTabs', [tab]);
            setState('activeTabId', tab.id);
            await initEditor();
            const view = createEditorView();
            // 29 addresses the raw source; CodeMirror keeps 25 characters.
            await expect(setEditorContent(source, tab.id, { anchor: source.length, head: source.length })).resolves.toBe(true);

            expect(view.state.doc.toString()).toBe('---\ntitle: x\ntags: a\n---\n');
            expect(view.state.selection.main.head).toBe(view.state.doc.length);
            expect(getEditorDocumentTabId()).toBe(tab.id);

            setState('openTabs', []);
            setState('activeTabId', null);
        });

        test('records edits against a note whose tab ID changed with its path', async () => {
            const { setState, getState } = await import('../frontend/js/state.js');
            const {
                initEditor, createEditorView, getEditorDocumentTabId, renameEditorDocumentTab, setEditorContent,
            } = await import('../frontend/js/editor.js');
            const ports = await configureTaskWorkspace();
            await initEditor();
            const view = createEditorView();

            setState('openTabs', [{ id: 'notes/a.md', path: 'notes/a.md', title: 'a.md', type: 'file' }]);
            setState('activeTabId', 'notes/a.md');
            await setEditorContent('original text', 'notes/a.md');

            // What a rename does: the same buffer continues under a new ID.
            setState('openTabs', [{ id: 'notes/b.md', path: 'notes/b.md', title: 'b.md', type: 'file' }]);
            expect(renameEditorDocumentTab('notes/a.md', 'notes/b.md')).toBe(true);
            setState('activeTabId', 'notes/b.md');
            ports.recordTabEdit.mockClear();

            view.dispatch({ changes: { from: 0, insert: 'typed after rename ' }, userEvent: 'input.type' });

            expect(getEditorDocumentTabId()).toBe('notes/b.md');
            expect(ports.recordTabEdit).toHaveBeenCalledWith('notes/b.md', expect.anything());
            expect(getState('openTabs')[0]).toEqual(expect.objectContaining({ id: 'notes/b.md', dirty: true }));

            setState('openTabs', []);
            setState('activeTabId', null);
        });

        test('a staged large Markdown mount never exposes or accepts edits to half a note', async () => {
            const { undoDepth } = await import('@codemirror/commands');
            const { setState } = await import('../frontend/js/state.js');
            const {
                initEditor, createEditorView, getEditorBufferContent, getEditorContent, getEditorDocumentTabId, setEditorContent,
            } = await import('../frontend/js/editor.js');
            const ports = await configureTaskWorkspace();
            await initEditor();
            jest.useFakeTimers();
            const view = createEditorView();
            const paragraph = `${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12)}\n\n`;
            const source = `# Large\n\n${paragraph.repeat(Math.ceil((300 * 1024) / paragraph.length))}`;
            try {
                setState('openTabs', [
                    { id: 'large.md', path: 'large.md', title: 'large.md', type: 'file' },
                    { id: 'kanban', title: 'Kanban', type: 'kanban' },
                ]);
                setState('activeTabId', 'large.md');
                const mounted = setEditorContent(source, 'large.md');
                await jest.advanceTimersByTimeAsync(0);
                await expect(mounted).resolves.toBe(true);

                // Only the leading chunk is in CodeMirror until the next frame…
                expect(getEditorDocumentTabId()).toBe('large.md');
                expect(view.state.doc.length).toBeLessThan(source.length);
                // …but every reader already sees the whole note,
                expect(getEditorContent()).toBe(source);
                expect(getEditorBufferContent()).toBe(source);
                // and an authored change cannot land on the half document.
                const prefix = view.state.doc;
                ports.recordTabEdit.mockClear();
                view.dispatch({ changes: { from: 0, insert: 'k' }, userEvent: 'input.type' });
                expect(view.state.doc).toBe(prefix);
                expect(ports.recordTabEdit).not.toHaveBeenCalled();

                // Leaving for a workspace panel does not abandon the tail.
                setState('activeTabId', 'kanban');
                await jest.advanceTimersByTimeAsync(50);
                expect(view.state.doc.toString()).toBe(source);
                expect(undoDepth(view.state)).toBe(0);

                view.dispatch({ changes: { from: 0, insert: 'k' }, userEvent: 'input.type' });
                expect(view.state.doc.length).toBe(source.length + 1);
                expect(ports.recordTabEdit).toHaveBeenCalledWith('large.md', expect.anything());
            } finally {
                view.destroy();
                jest.clearAllTimers();
                jest.useRealTimers();
                setState('openTabs', []);
                setState('activeTabId', null);
            }
        });

        test('a revision preview never becomes the note: saves, edits and undo keep the displaced text', async () => {
            const { redo, undo, undoDepth } = await import('@codemirror/commands');
            const { setState } = await import('../frontend/js/state.js');
            const {
                initEditor, createEditorView, closeEditorPreview, editorPreviewLiveContent, getEditorBufferContent,
                getEditorContent, setEditorContent, showEditorPreview,
            } = await import('../frontend/js/editor.js');
            const ports = await configureTaskWorkspace();
            await initEditor();
            const view = createEditorView();
            try {
                setState('openTabs', [{ id: 'note.md', path: 'note.md', title: 'note.md', type: 'file' }]);
                setState('activeTabId', 'note.md');
                await setEditorContent('Live text', 'note.md');
                view.dispatch({ changes: { from: view.state.doc.length, insert: ' edit' }, selection: { anchor: 4 } });
                expect(undoDepth(view.state)).toBe(1);
                expect(editorPreviewLiveContent('note.md')).toBeNull();

                expect(showEditorPreview('Old revision')).toBe(true);
                expect(view.state.doc.toString()).toBe('Old revision');
                expect(view.state.readOnly).toBe(true);
                expect(getEditorContent()).toBe('Old revision');
                // Every save and snapshot still answers with the unsaved text.
                expect(getEditorBufferContent()).toBe('Live text edit');
                expect(editorPreviewLiveContent('note.md')).toBe('Live text edit');
                expect(editorPreviewLiveContent('other.md')).toBeNull();

                // A rendered checkbox, a properties widget or a lens fix dispatches
                // directly; none of them may turn the revision into a dirty buffer.
                ports.recordTabEdit.mockClear();
                view.dispatch({ changes: { from: 0, to: 1, insert: 'x' }, userEvent: 'input.task-checkbox' });
                expect(view.state.doc.toString()).toBe('Old revision');
                expect(ports.recordTabEdit).not.toHaveBeenCalled();
                expect(undo(view)).toBe(false);

                // A second revision replaces the first without losing the stash.
                expect(showEditorPreview('Older revision')).toBe(true);
                expect(getEditorBufferContent()).toBe('Live text edit');

                expect(closeEditorPreview()).toBe(true);
                expect(view.state.doc.toString()).toBe('Live text edit');
                expect(view.state.readOnly).toBe(false);
                expect(view.state.selection.main.anchor).toBe(4);
                expect(editorPreviewLiveContent('note.md')).toBeNull();
                expect(getEditorBufferContent()).toBe('Live text edit');
                // Undo steps back through the author's own edit, not the preview.
                expect(undoDepth(view.state)).toBe(1);
                expect(undo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe('Live text');
                expect(redo(view)).toBe(true);
                expect(view.state.doc.toString()).toBe('Live text edit');

                // Restoring a revision mounts it as the note with a fresh history.
                expect(showEditorPreview('Old revision')).toBe(true);
                expect(closeEditorPreview({ content: 'Old revision' })).toBe(true);
                expect(view.state.doc.toString()).toBe('Old revision');
                expect(view.state.readOnly).toBe(false);
                expect(undo(view)).toBe(false);
                expect(closeEditorPreview()).toBe(false);
            } finally {
                closeEditorPreview();
                setState('openTabs', []);
                setState('activeTabId', null);
            }
        });

        test('a preview whose tab lost the editor only releases the read-only state', async () => {
            const { setState } = await import('../frontend/js/state.js');
            const {
                initEditor, createEditorView, closeEditorPreview, getEditorBufferContent, setEditorContent, showEditorPreview,
            } = await import('../frontend/js/editor.js');
            await configureTaskWorkspace();
            await initEditor();
            const view = createEditorView();
            try {
                setState('openTabs', [
                    { id: 'note.md', path: 'note.md', title: 'note.md', type: 'file' },
                    { id: 'other.md', path: 'other.md', title: 'other.md', type: 'file' },
                ]);
                setState('activeTabId', 'note.md');
                await setEditorContent('Live text', 'note.md');
                expect(showEditorPreview('Old revision')).toBe(true);

                // Another note is mounted while the preview is still registered.
                setState('activeTabId', 'other.md');
                await setEditorContent('Other note', 'other.md');
                expect(getEditorBufferContent()).toBe('Other note');

                expect(closeEditorPreview()).toBe(false);
                expect(view.state.doc.toString()).toBe('Other note');
                expect(view.state.readOnly).toBe(false);
                view.dispatch({ changes: { from: 0, insert: 'x' } });
                expect(view.state.doc.toString()).toBe('xOther note');
            } finally {
                closeEditorPreview();
                setState('openTabs', []);
                setState('activeTabId', null);
            }
        });

        test('a click on a negated character class in code does not create a footnote definition', async () => {
            const { setState } = await import('../frontend/js/state.js');
            const { initEditor, createEditorView, handleFootnoteNavigation, setEditorContent } = await import('../frontend/js/editor.js');
            await configureTaskWorkspace();
            await initEditor();
            const view = createEditorView();
            const source = 'Regex:\n\n```js\nconst re = /[^a-z]+/;\n```\n\nSee the note.[^1]\n';
            setState('openTabs', [{ id: 'regex.md', path: 'regex.md', title: 'regex.md', type: 'file' }]);
            setState('activeTabId', 'regex.md');
            await setEditorContent(source, 'regex.md');
            const event = { preventDefault: jest.fn() };

            expect(handleFootnoteNavigation(event, view, source.indexOf('[^a-z]') + 2)).toBe(false);
            expect(view.state.doc.toString()).toBe(source);
            expect(event.preventDefault).not.toHaveBeenCalled();

            // A real reference in prose still gets its missing definition.
            expect(handleFootnoteNavigation(event, view, source.indexOf('[^1]') + 2)).toBe(true);
            expect(view.state.doc.toString()).toContain('[^1]: ');

            setState('openTabs', []);
            setState('activeTabId', null);
        });

        test('completes an empty link only where the author typed Markdown', async () => {
            const { setState } = await import('../frontend/js/state.js');
            const { initEditor, createEditorView, setEditorContent } = await import('../frontend/js/editor.js');
            await configureTaskWorkspace();
            await initEditor();
            const view = createEditorView();
            const source = 'Prose \n\n```js\ncall \n```\n';
            setState('openTabs', [{ id: 'notes/code.md', path: 'notes/code.md', title: 'code.md', type: 'file' }]);
            setState('activeTabId', 'notes/code.md');
            await setEditorContent(source, 'notes/code.md');
            const type = async (needle, text, userEvent = 'input.type') => {
                const at = view.state.doc.toString().indexOf(needle) + needle.length;
                view.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length }, userEvent });
                await Promise.resolve();
            };

            // Code keeps what was typed.
            await type('call ', 'handlers[name]()');
            expect(view.state.doc.toString()).toContain('call handlers[name]()');
            // Text that was not typed (an undo, a programmatic insert) is left alone.
            await type('Prose ', '[Later]()', 'undo');
            expect(view.state.doc.toString()).toContain('Prose [Later]()');
            // Typing the same in prose completes the link beside the note.
            await type('[Later]()', ' [Plan]()');
            expect(view.state.doc.toString()).toContain('[Plan](notes/Plan.md)');
            expect(view.state.doc.toString()).toContain('call handlers[name]()');

            setState('openTabs', []);
            setState('activeTabId', null);
        });

        test('opens and closes the native find panel', async () => {
            const { initEditor, createEditorView, openEditorSearch, closeSearchPanel } = await import('../frontend/js/editor.js');
            window.go.desktop.App.SaveSession.mockResolvedValue({ success: true });

            await initEditor();
            const view = createEditorView();
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: 'Find this phrase. Find it again.' }
            });

            expect(openEditorSearch()).toBe(true);
            const panel = view.dom.querySelector('.cm-panel.cm-search');
            expect(panel).not.toBeNull();
            expect(panel.querySelector('input[name="search"]')).not.toBeNull();
            expect(panel.querySelector('input[name="replace"]')).not.toBeNull();
            expect([...panel.querySelectorAll(':scope > button[name]')]
                .map(button => button.name)).toEqual([
                'next', 'prev', 'select', 'replace', 'replaceAll', 'close',
            ]);
            expect([...panel.querySelectorAll(':scope > label input[name]')]
                .map(input => input.name)).toEqual(['case', 're', 'word']);
            const search = panel.querySelector('input[name="search"]');
            search.value = 'Find';
            search.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 30));
            const resultStatus = panel.querySelector('.cm-search-match-status');
            expect(resultStatus).not.toBeNull();
            expect(resultStatus.classList.contains('sr-only')).toBe(true);
            expect(resultStatus.getAttribute('role')).toBe('status');
            expect(resultStatus.getAttribute('aria-live')).toBe('polite');
            expect(resultStatus.textContent).toMatch(/1 of 2 matches|2 matches/);

            search.value = 'missing';
            search.dispatchEvent(new KeyboardEvent('keyup', { key: 'g', bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 30));
            expect(resultStatus.textContent).toBe('No matches');

            expect(closeSearchPanel()).toBe(true);
            expect(view.dom.querySelector('.cm-panel.cm-search')).toBeNull();

            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'f',
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
            }));
            expect(view.dom.querySelector('.cm-panel.cm-search')).not.toBeNull();
            expect(closeSearchPanel()).toBe(true);
        });

        test('opens a semantic editor menu at the caret and restores focus on Escape', async () => {
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            window.go.desktop.App.SaveSession.mockResolvedValue({ success: true });

            await initEditor();
            const view = createEditorView();
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Context menu text' } });
            view.contentDOM.focus();
            view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 0,
                clientY: 0,
            }));
            await new Promise(resolve => setTimeout(resolve, 0));

            const menu = document.querySelector('.editor-context-menu');
            expect(menu.getAttribute('role')).toBe('menu');
            expect(menu.getAttribute('aria-label')).toBe('Editor actions');
            expect([...menu.querySelectorAll('[role="menuitem"]')]
                .every(item => item instanceof HTMLButtonElement)).toBe(true);
            expect(document.activeElement.dataset.action).toBe('paste');

            menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
            expect(document.activeElement.dataset.action).toBe('select-all');
            menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

            expect(document.querySelector('.editor-context-menu')).toBeNull();
            expect(document.activeElement).toBe(view.contentDOM);
        });

        test('contains an unexpected vertical jump to the adjacent source line', async () => {
            const { EditorState } = await import('@codemirror/state');
            const { adjacentLinePositionForUnexpectedVerticalSkip } = await import('../frontend/js/editor.js');
            const state = EditorState.create({ doc: 'one\ntwo\nthree\nfour\nfive' });

            expect(adjacentLinePositionForUnexpectedVerticalSkip(
                state.doc,
                state.doc.line(4).to,
                state.doc.line(1).to,
                false
            )).toBe(state.doc.line(3).from + state.doc.line(4).length);
            expect(adjacentLinePositionForUnexpectedVerticalSkip(
                state.doc,
                state.doc.line(2).from + 1,
                state.doc.line(5).from,
                true
            )).toBe(state.doc.line(3).from + 1);
            expect(adjacentLinePositionForUnexpectedVerticalSkip(
                state.doc,
                state.doc.line(4).from,
                state.doc.line(3).from,
                false
            )).toBeNull();
        });

        test('coalesces vertical key bursts and reconciles after paint without a third coordinate pass', async () => {
            const { initEditor, requestVerticalViewportMeasure } = await import('../frontend/js/editor.js');
            await initEditor();

            let deferredMeasure = null;
            const requestMeasure = jest.fn();
            const view = {
                state: {
                    selection: { main: { head: 10 } },
                    facet: jest.fn(() => []),
                },
                scrollDOM: {
                    scrollTop: 100,
                    getBoundingClientRect: () => ({ top: 0, bottom: 200 }),
                },
                coordsAtPos: jest.fn(() => ({
                    top: 180 - (view.scrollDOM.scrollTop - 100),
                    bottom: 220 - (view.scrollDOM.scrollTop - 100),
                })),
                requestMeasure,
                win: {
                    requestAnimationFrame: jest.fn(callback => {
                        deferredMeasure = callback;
                        return 1;
                    }),
                },
            };

            expect(requestVerticalViewportMeasure(view)).toBe(true);
            expect(requestMeasure).toHaveBeenCalledTimes(1);
            expect(requestMeasure.mock.calls[0][0]).toEqual(expect.objectContaining({
                key: expect.any(Object),
                read: expect.any(Function),
                write: expect.any(Function),
            }));

            for (let repeat = 0; repeat < 20; repeat++) requestVerticalViewportMeasure(view);
            expect(view.win.requestAnimationFrame).toHaveBeenCalledTimes(1);
            expect(requestMeasure).toHaveBeenCalledTimes(1);

            const request = requestMeasure.mock.calls[0][0];
            expect(request.read(view)).toBe(25);
            request.write(25, view);
            expect(view.scrollDOM.scrollTop).toBe(125);

            deferredMeasure();
            expect(requestMeasure).toHaveBeenCalledTimes(3);
            expect(view.coordsAtPos).toHaveBeenCalledTimes(2);
            expect(requestMeasure.mock.calls[2]).toEqual([]);
            expect(requestVerticalViewportMeasure(view)).toBe(true);
            expect(view.win.requestAnimationFrame).toHaveBeenCalledTimes(2);
            view.isDestroyed = true;
            deferredMeasure();
            expect(view.coordsAtPos).toHaveBeenCalledTimes(2);
        });

        test('repairs a bad engine cursor result after normal vertical movement', async () => {
            const { EditorSelection, EditorState, Transaction } = await import('@codemirror/state');
            const { initEditor, moveCursorVerticallySafely } = await import('../frontend/js/editor.js');
            await initEditor();

            let state = EditorState.create({
                doc: 'one\ntwo\nthree\nfour\nfive',
                selection: { anchor: 18 },
            });
            const view = {
                get state() { return state; },
                moveVertically: jest.fn(() => EditorSelection.cursor(state.doc.line(1).to)),
                moveToLineBoundary: jest.fn(range => range),
                dispatch: transaction => {
                    state = transaction instanceof Transaction
                        ? transaction.state
                        : state.update(transaction).state;
                },
            };

            expect(moveCursorVerticallySafely(view, false)).toBe(true);
            expect(view.moveVertically).toHaveBeenCalledTimes(1);
            expect(state.doc.lineAt(state.selection.main.head).number).toBe(3);
            expect(state.selection.main.head - state.doc.line(3).from).toBe(4);
        });

        test('moves to the adjacent source line when the engine reports a stalled visual row', async () => {
            const { EditorSelection, EditorState, Transaction } = await import('@codemirror/state');
            const { initEditor, moveCursorVerticallySafely } = await import('../frontend/js/editor.js');
            await initEditor();

            let state = EditorState.create({
                doc: 'one\ntwo\nthree',
                selection: { anchor: 5 },
            });
            const view = {
                get state() { return state; },
                moveVertically: jest.fn(() => EditorSelection.cursor(state.selection.main.head)),
                moveToLineBoundary: jest.fn(range => range),
                dispatch: transaction => {
                    state = transaction instanceof Transaction
                        ? transaction.state
                        : state.update(transaction).state;
                },
            };

            expect(moveCursorVerticallySafely(view, true)).toBe(true);
            expect(view.moveVertically).toHaveBeenCalledTimes(1);
            expect(state.selection.main.head).toBe(state.doc.line(3).from + 1);
        });

        test('consumes Arrow movement at the first and last document positions', async () => {
            const { EditorSelection, EditorState, Transaction } = await import('@codemirror/state');
            const { initEditor, moveCursorVerticallySafely } = await import('../frontend/js/editor.js');
            await initEditor();

            let state = EditorState.create({
                doc: 'one\ntwo\nthree',
                selection: { anchor: 13 },
            });
            const view = {
                get state() { return state; },
                moveVertically: jest.fn(() => EditorSelection.cursor(0)),
                moveToLineBoundary: jest.fn(),
                dispatch: transaction => {
                    state = transaction instanceof Transaction
                        ? transaction.state
                        : state.update(transaction).state;
                },
            };

            expect(moveCursorVerticallySafely(view, true)).toBe(true);
            expect(view.moveVertically).not.toHaveBeenCalled();
            expect(state.selection.main.head).toBe(state.doc.length);

            state = state.update({ selection: { anchor: 0 } }).state;
            expect(moveCursorVerticallySafely(view, false)).toBe(true);
            expect(view.moveVertically).not.toHaveBeenCalled();
            expect(state.selection.main.head).toBe(0);
        });

        test('clamps a wrong-direction engine wrap to the requested edge', async () => {
            const { EditorSelection, EditorState, Transaction } = await import('@codemirror/state');
            const { initEditor, moveCursorVerticallySafely } = await import('../frontend/js/editor.js');
            await initEditor();

            let state = EditorState.create({
                doc: 'one\ntwo\nthree',
                selection: { anchor: 11 },
            });
            const view = {
                get state() { return state; },
                moveVertically: jest.fn(() => EditorSelection.cursor(1)),
                moveToLineBoundary: jest.fn(),
                dispatch: transaction => {
                    state = transaction instanceof Transaction
                        ? transaction.state
                        : state.update(transaction).state;
                },
            };

            expect(moveCursorVerticallySafely(view, true)).toBe(true);
            expect(state.selection.main.head).toBe(state.doc.length);
        });

        test('handles wheel overscroll at both viewport boundaries', async () => {
            const { handleVerticalBoundaryWheel, initEditor } = await import('../frontend/js/editor.js');
            await initEditor();

            const scrollDOM = {
                scrollTop: 900,
                scrollHeight: 1000,
                clientHeight: 100,
            };
            const view = { scrollDOM, defaultLineHeight: 20 };

            expect(handleVerticalBoundaryWheel({ deltaY: 1, deltaMode: 1 }, view)).toBe(true);
            expect(scrollDOM.scrollTop).toBe(900);

            scrollDOM.scrollTop = 0;
            expect(handleVerticalBoundaryWheel({ deltaY: -1, deltaMode: 1 }, view)).toBe(true);
            expect(scrollDOM.scrollTop).toBe(0);

            scrollDOM.scrollTop = 400;
            expect(handleVerticalBoundaryWheel({ deltaY: 1, deltaMode: 1 }, view)).toBe(false);
            expect(scrollDOM.scrollTop).toBe(400);
        });

    });
});

describe('UI Smoke Tests — editor initialization and rendering', () => {
        beforeEach(() => {
            document.body.innerHTML = '';
        });

        test('initEditor + createEditorView completes without errors', async () => {
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            document.body.innerHTML = '<div id="editor-container"></div>';
            const errors = [];
            const onError = (e) => { errors.push(e); e.preventDefault(); };
            window.addEventListener('error', onError);
            try {
                await initEditor();
                const view = createEditorView();
                expect(view).not.toBeNull();
                expect(view.dom).toBeDefined();
                expect(view.state).toBeDefined();
                expect(errors).toEqual([]);
            } finally {
                window.removeEventListener('error', onError);
            }
        });

        test('editor renders markdown link [text](url) as .cm-link-widget', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            window.go.desktop.App.SaveSession.mockResolvedValue({ success: true });
            await initEditor();
            const view = createEditorView();
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Click [here](test-file.md).' } });
            await new Promise(r => setTimeout(r, 100));
            expect(view.dom.querySelectorAll('.cm-link-widget').length).toBe(1);
        });

        test('keeps an unresolved bare bracket label as non-widget editor text', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            await initEditor();
            const view = createEditorView();
            const source = 'Above\n\n[a link]\n\nBelow';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: source },
                selection: { anchor: 0 },
            });
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(view.dom.querySelector('.cm-unresolved-reference')?.textContent).toBe('[a link]');
            expect(view.dom.querySelector('.cm-reference-link-widget')).toBeNull();
        });

        test('renders a defined shortcut reference as a navigable link widget', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            await initEditor();
            const view = createEditorView();
            const source = 'Above\n\n[a link]\n\nBelow\n\n[a link]: notes/Target.md';
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: source },
                selection: { anchor: 0 },
            });
            await new Promise(resolve => setTimeout(resolve, 0));

            const widget = view.dom.querySelector('.cm-reference-link-widget');
            expect(widget?.textContent).toBe('a link');
            expect(widget?.getAttribute('href')).toBe('notes/Target.md');
        });

        test('reference links reuse definitions for cursor and ordinary prose edits but invalidate structural changes', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            const links = await import('../frontend/js/core/noteLinks.js');
            const scan = jest.spyOn(links, 'markdownReferenceDefinitions');
            await initEditor(); const view = createEditorView();
            const source = 'Above\n\n[a link]\n\nBelow\n\n[a link]: notes/Target.md';
            try {
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
                const initial = scan.mock.calls.length;
                view.dispatch({ selection: { anchor: 1 } });
                view.dispatch({ selection: { anchor: source.length } });
                view.dispatch({ changes: { from: 1, insert: 'text' } });
                expect(scan).toHaveBeenCalledTimes(initial);
                const target = view.state.doc.toString().indexOf('Target');
                view.dispatch({ changes: { from: target, to: target + 6, insert: 'Other' }, selection: { anchor: 0 } });
                expect(scan).toHaveBeenCalledTimes(initial + 1);
                expect(view.dom.querySelector('.cm-reference-link-widget')?.getAttribute('href')).toBe('notes/Other.md');
                view.dispatch({ changes: { from: 0, insert: '```\n' } });
                expect(scan).toHaveBeenCalledTimes(initial + 2);
                expect(view.dom.querySelector('.cm-reference-link-widget')).toBeNull();
            } finally { view.destroy(); scan.mockRestore(); }
        });

        test('rewrites only a clicked Markdown destination as a normal dirty editor change', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView, replaceMarkdownLinkTarget, setEditorContent } = await import('../frontend/js/editor.js');
            const { getState, setState } = await import('../frontend/js/state.js');
            const tab = { id: 'notes/current.md', path: 'notes/current.md', title: 'current.md', type: 'file', dirty: false };
            setState('openTabs', [tab]);
            setState('activeTabId', tab.id);
            await initEditor();
            const view = createEditorView();
            const source = 'See [Inner Source](notes/Inner%20Source.md) today.';
            setEditorContent(source, tab.id);
            await new Promise(resolve => setTimeout(resolve, 0));
            tab.dirty = false;

            expect(replaceMarkdownLinkTarget(view, {
                from: 19,
                to: 42,
                target: 'notes/Inner%20Source.md',
            }, 'notes/InnerSource.md')).toBe(true);

            expect(view.state.doc.toString()).toBe('See [Inner Source](notes/InnerSource.md) today.');
            expect(getState('openTabs').find(candidate => candidate.id === tab.id).dirty).toBe(true);
            expect(replaceMarkdownLinkTarget(view, {
                from: 19,
                to: 42,
                target: 'notes/Inner%20Source.md',
            }, 'notes/Other.md')).toBe(false);
        });

        test('editor renders wiki link [[target]] as .cm-wikilink-widget', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            await initEditor();
            const view = createEditorView();
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'See [[my-note]].' } });
            await new Promise(r => setTimeout(r, 100));
            expect(view.dom.querySelectorAll('.cm-wikilink-widget').length).toBe(1);
        });

		test('editor renders a conventional target-first wikilink using its alias', async () => {
			document.body.innerHTML = '<div id="editor-container"></div>';
			const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
			await initEditor();
			const view = createEditorView();
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'See [[notes/Welcome.md|Welcome]].' } });
			await new Promise(r => setTimeout(r, 100));
			const widget = view.dom.querySelector('.cm-wikilink-widget');
			expect(widget).not.toBeNull();
			expect(widget.textContent).toBe('Welcome');
		});

        test('editor survives multiple content dispatches', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
            await initEditor();
            const view = createEditorView();
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '[a](x.md)' } });
            await new Promise(r => setTimeout(r, 50));
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '[[wiki]]' } });
            await new Promise(r => setTimeout(r, 50));
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'plain text' } });
            await new Promise(r => setTimeout(r, 50));
            expect(view.state.doc.length).toBeGreaterThan(0);
        });

        test('CodeMirror modules load without errors', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor } = await import('../frontend/js/editor.js');
            const errors = [];
            const onError = (e) => { errors.push(e); e.preventDefault(); };
            window.addEventListener('error', onError);
            try {
                await initEditor();
            } finally {
                window.removeEventListener('error', onError);
            }
            expect(errors.length).toBe(0);
        });
});

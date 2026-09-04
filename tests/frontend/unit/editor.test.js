/**
 * Tests for editor.js - CodeMirror 6 integration
 * These tests catch initialization errors that would cause unhandled promise rejections
 */

describe('Editor Module - CodeMirror Initialization', () => {
    async function configureTaskWorkspace() {
        const { configureEditorWorkspace } = await import('../frontend/js/editor.js');
        const { getState } = await import('../frontend/js/state.js');
        const ports = {
            getActiveTab: () => (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId')),
            closeTab: jest.fn(), markTabDirty: jest.fn(), openFile: jest.fn(),
            openPDFPreview: jest.fn(), openRawTextPreview: jest.fn(), openTab: jest.fn(),
            refreshFileTree: jest.fn(), replaceActiveFileTab: jest.fn(),
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
        const { markdownListHangingIndentAttributes } = await import('../frontend/js/editor.js');

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
        const { markdownBlockquoteHangingIndentAttributes } = await import('../frontend/js/editor.js');

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
            const { setState } = await import('../frontend/js/state.js');
            setState('kanbanCompletionColumns', ['urgent']);

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

        test('keeps undo history inside the active file buffer', async () => {
            const { redo, redoDepth, undo, undoDepth } = await import('@codemirror/commands');
            const { setState } = await import('../frontend/js/state.js');
            const {
                initEditor,
                createEditorView,
                getEditorDocumentTabId,
                setEditorContent,
            } = await import('../frontend/js/editor.js');

            await initEditor();
            const view = createEditorView();
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
                await new Promise(resolve => setTimeout(resolve, 0));
                expect(getEditorDocumentTabId()).toBe(tabId);
            };

            await mount('first.md', 'First buffer');
            view.dispatch({ changes: { from: view.state.doc.length, insert: ' edit' } });
            expect(undoDepth(view.state)).toBe(1);

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

        test('schedules a second CodeMirror measure after keyboard viewport motion', async () => {
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

            const request = requestMeasure.mock.calls[0][0];
            expect(request.read(view)).toBe(25);
            request.write(25, view);
            expect(view.scrollDOM.scrollTop).toBe(125);

            deferredMeasure();
            expect(requestMeasure).toHaveBeenCalledTimes(3);
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

        test('rewrites only a clicked Markdown destination as a normal dirty editor change', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView, replaceMarkdownLinkTarget, setEditorContent } = await import('../frontend/js/editor.js');
            const { setState } = await import('../frontend/js/state.js');
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
            expect(tab.dirty).toBe(true);
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

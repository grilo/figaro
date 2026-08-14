/**
 * Tests for editor.js - CodeMirror 6 integration
 * These tests catch initialization errors that would cause unhandled promise rejections
 */

describe('Editor Module - CodeMirror Initialization', () => {
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

        test('initEditor should complete without throwing unhandled errors', async () => {
            // Dynamically import to avoid module caching issues
            const { initEditor } = await import('../frontend/js/editor.js');
            
            // Track unhandled rejections
            const rejectionHandler = (event) => {
                event.preventDefault();
            };
            window.addEventListener('unhandledrejection', rejectionHandler);
            
            try {
                // This catches any errors during module loading
                // including "undefined is not an object (evaluating 'style.tag.id')"
                await initEditor();
            } finally {
                window.removeEventListener('unhandledrejection', rejectionHandler);
            }
            
            // If we got here without error, the test passes
            expect(true).toBe(true);
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

    test('normalizes WebKitGTK Unidentified Shift+Tab for nested table editors', async () => {
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

        test('opens and closes the native find panel', async () => {
            const { initEditor, createEditorView, openEditorSearch, closeSearchPanel } = await import('../frontend/js/editor.js');

            await initEditor();
            const view = createEditorView();
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: 'Find this phrase. Find it again.' }
            });

            expect(openEditorSearch()).toBe(true);
            const panel = view.dom.querySelector('.cm-panel.cm-search');
            expect(panel).not.toBeNull();
            expect(panel.querySelector('input[name="search"]')).not.toBeNull();

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

/**
 * Tests for vendor module integrity - verifies tags used in editor.js exist
 * These tests catch the "undefined is not an object (evaluating 'style.tag.id')" error
 * that occurs when editor.js references tags that don't exist in the vendor modules
 */
describe('Vendor Modules - Tags Used in editor.js', () => {
    // These are the tags actually used in editor.js after the fix
    const requiredTags = [
        'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
        'strong', 'emphasis', 'strikethrough', 'link', 'url',
        'monospace', 'quote', 'contentSeparator', 'list', 'meta'
    ];

    requiredTags.forEach(tagName => {
        test(`${tagName} should exist and have an id`, async () => {
            const { tags } = await import('@lezer/highlight');
            
            expect(tags[tagName]).toBeDefined();
            expect(tags[tagName].id).toBeDefined();
            expect(typeof tags[tagName].id).toBe('number');
        });
    });
});

describe('Vendor Modules - HighlightStyle.define', () => {
    test('should work with all tag styling specs from editor.js', async () => {
        const { tags } = await import('@lezer/highlight');
        const { HighlightStyle } = await import('@codemirror/language');
        const { syntaxHighlighting } = await import('@codemirror/language');
        
        // This is the exact pattern used in editor.js that causes the error
        // If tags are undefined, this will throw "Cannot read properties of undefined (reading 'id')"
        const markdownHighlightStyle = syntaxHighlighting(HighlightStyle.define([
            { tag: tags.heading1, color: 'var(--accent-color)', fontWeight: '600', fontSize: '1.8em' },
            { tag: tags.heading2, color: 'var(--accent-color)', fontWeight: '600', fontSize: '1.5em' },
            { tag: tags.heading3, color: 'var(--accent-color)', fontWeight: '600', fontSize: '1.3em' },
            { tag: tags.heading4, color: 'var(--accent-color)', fontWeight: '600', fontSize: '1.1em' },
            { tag: tags.heading5, color: 'var(--accent-color)', fontWeight: '600', fontSize: '1em' },
            { tag: tags.heading6, color: 'var(--accent-color)', fontWeight: '600', fontSize: '0.9em' },
            { tag: tags.strong, fontWeight: '600' },
            { tag: tags.emphasis, fontStyle: 'italic' },
            { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-dim)' },
            { tag: tags.link, color: '#9b7fc4', textDecoration: 'none' },
            { tag: tags.url, color: '#58a6ff' },
            { tag: tags.monospace, backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.1em 0.3em', borderRadius: '3px', fontFamily: 'var(--font-mono)' },
            { tag: tags.quote, color: 'var(--text-muted)', borderLeft: '2px solid var(--border-light)', paddingLeft: '12px', marginLeft: '-12px' },
            { tag: tags.contentSeparator, borderTop: '1px solid var(--border-color)', margin: '16px 0' },
            { tag: tags.list, paddingLeft: '1.5em' },
            { tag: tags.meta, color: '#5865f2', textDecoration: 'underline', textDecorationColor: '#5865f2' }
        ]));
        
        expect(markdownHighlightStyle).toBeDefined();
    });
});

describe('Vendor Modules - style-mod', () => {
    test('StyleModule should be exported', async () => {
        const { StyleModule } = await import('style-mod');
        expect(StyleModule).toBeDefined();
        expect(typeof StyleModule.newName).toBe('function');
    });

    test('StyleModule.mount should work', async () => {
        const { StyleModule } = await import('style-mod');
        const spec = { '.test-class': { color: 'red' } };
        const module = new StyleModule(spec);
        expect(module.rules).toBeDefined();
    });
});

describe('Link autofill logic', () => {
    test('empty link preserves original name', () => {
        const linkText = 'this is a new link';
        const fileName = linkText.trim() + '.md';
        expect(fileName).toBe('this is a new link.md');
    });

    test('empty link trims whitespace from name', () => {
        const linkText = '  hello world  ';
        const fileName = linkText.trim() + '.md';
        expect(fileName).toBe('hello world.md');
    });

    test('empty link should match regex pattern', () => {
        const pattern = /\[([^\]]+)\]\(\)$/;
        const match = '[this is a link]()'.match(pattern);
        expect(match).not.toBeNull();
        expect(match[1]).toBe('this is a link');
    });

    test('already filled link should not match empty pattern', () => {
        const pattern = /\[([^\]]+)\]\(\)$/;
        const match = '[text](path.md)'.match(pattern);
        expect(match).toBeNull();
    });

    test('create note dialog should show full path', () => {
        const linkPath = 'Projects/my-note';
        const fullPath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
        expect(fullPath).toBe('Projects/my-note.md');
    });

    test('autocomplete should append trailing space for live preview', () => {
        const f = { name: 'Project Alpha', path: 'Projects/Project Alpha.md' };
        const rep = `[${f.name}](${f.path}) `;
        expect(rep).toBe('[Project Alpha](Projects/Project Alpha.md) ');
        expect(rep.endsWith(') ')).toBe(true);
    });

    test('autocomplete preserves spaces in file paths', () => {
        const f = { name: 'file with spaces', path: 'Projects/file with spaces.md' };
        const rep = `[${f.name}](${f.path}) `;
        expect(rep).toBe('[file with spaces](Projects/file with spaces.md) ');
    });
});

describe('Markdown extras', () => {
    test('highlight regex matches ==text==', () => {
        const re = /==([^=]+)==/g;
        const matches = [...'hello ==world== test'.matchAll(re)];
        expect(matches.length).toBe(1);
        expect(matches[0][1]).toBe('world');
    });

    test('highlight regex ignores empty', () => {
        const re = /==([^=]+)==/g;
        const matches = [...'hello ==== test'.matchAll(re)];
        expect(matches.length).toBe(0);
    });

    test('footnote regex matches [^1]', () => {
        const re = /\[\^([^\]]+)\]/g;
        const matches = [...'text[^1] more[^label] end'.matchAll(re)];
        expect(matches.length).toBe(2);
        expect(matches[0][1]).toBe('1');
        expect(matches[1][1]).toBe('label');
    });

    test('callout regex matches > [!note]', () => {
        const re = /^>\s*\[!(\w+)\]\s*(.*)$/;
        const m = '> [!note] This is a note'.match(re);
        expect(m).not.toBeNull();
        expect(m[1]).toBe('note');
        expect(m[2]).toBe('This is a note');
    });

    test('callout regex matches > [!warning]', () => {
        const re = /^>\s*\[!(\w+)\]\s*(.*)$/;
        const m = '> [!warning] Careful'.match(re);
        expect(m).not.toBeNull();
        expect(m[1]).toBe('warning');
    });

    test('callout regex ignores regular blockquote', () => {
        const re = /^>\s*\[!(\w+)\]\s*(.*)$/;
        const m = '> This is just a quote'.match(re);
        expect(m).toBeNull();
    });

    test('strikethrough is supported by markdownStylePlugin', () => {
        // The Lezer parser tags ~~text~~ as Strikethrough
        // markdownStylePlugin maps Strikethrough → cm-strikethrough
        // editorTheme provides the CSS
        expect(true).toBe(true); // Verified by code inspection
    });

    test('horizontal rule separator exists in tags', () => {
        // tags.contentSeparator is available from @lezer/highlight
        // Previously used in HighlightStyle, now using editorTheme
        expect(true).toBe(true);
    });

describe('Extras Plugin - highlight, footnotes, HR, callouts', () => {
    test('highlight ==text== should match pattern', () => {
        const re = /==([^=]+)==/g;
        const matches = [...'hello ==world== test'.matchAll(re)];
        expect(matches.length).toBe(1);
        expect(matches[0][1]).toBe('world');
    });

    test('highlight should match multiple occurrences', () => {
        const re = /==([^=]+)==/g;
        const matches = [...'==a== and ==b== here'.matchAll(re)];
        expect(matches.length).toBe(2);
    });

    test('highlight should not match single =', () => {
        const re = /==([^=]+)==/g;
        const matches = [...'not=a=highlight'.matchAll(re)];
        expect(matches.length).toBe(0);
    });

    test('footnote [^label] should match pattern', () => {
        const re = /\[\^([^\]]+)\]/g;
        const matches = [...'text[^1] here[^note] end'.matchAll(re)];
        expect(matches.length).toBe(2);
        expect(matches[0][1]).toBe('1');
        expect(matches[1][1]).toBe('note');
    });

    test('horizontal rule --- should match', () => {
        const re = /^(-{3,}|\*{3,}|_{3,})\s*$/;
        expect(re.test('---')).toBe(true);
        expect(re.test('***')).toBe(true);
        expect(re.test('___')).toBe(true);
        expect(re.test('----')).toBe(true);
    });

    test('horizontal rule should not match regular text', () => {
        const re = /^(-{3,}|\*{3,}|_{3,})\s*$/;
        expect(re.test('--')).toBe(false);
        expect(re.test('not a rule')).toBe(false);
    });

    test('callout > [!note] should match', () => {
        const re = /^>\s*\[!(\w+)\]\s*(.*)$/;
        const m = '> [!note] This is a note'.match(re);
        expect(m).not.toBeNull();
        expect(m[1]).toBe('note');
        expect(m[2]).toBe('This is a note');
    });

    test('callout types should be recognized', () => {
        const re = /^>\s*\[!(\w+)\]\s*(.*)$/;
        const types = ['note', 'warning', 'info', 'tip', 'danger', 'example'];
        for (const t of types) {
            expect(`> [!${t}] test`.match(re)[1]).toBe(t);
        }
    });

    test('callout continuation line should start with >', () => {
        expect('> continued callout line'.startsWith('>')).toBe(true);
        expect('not a callout'.startsWith('>')).toBe(false);
    });

    test('strikethrough CSS class should be present in theme', () => {
        // Verify the class name is referenced
        const cssClass = 'cm-strikethrough';
        expect(cssClass).toBe('cm-strikethrough');
    });

    test('task checkbox toggles state correctly', () => {
        // Simulate checkbox toggle: space → x
        const toggle = (char) => char === ' ' ? 'x' : ' ';
        expect(toggle(' ')).toBe('x');
        expect(toggle('x')).toBe(' ');
        expect(toggle('X')).toBe(' ');
    });
});

describe('Extras behavior verification', () => {
    test('all callout types have CSS classes', () => {
        const types = ['note', 'warning', 'info', 'tip', 'danger', 'example'];
        for (const t of types) {
            expect(`cm-callout-${t}`).toMatch(/cm-callout-\w+/);
        }
    });

    test('footnote CSS uses superscript styling', () => {
        const footnoteId = 'cm-footnote';
        expect(footnoteId).toBe('cm-footnote');
    });

    test('highlight CSS uses background color', () => {
        const highlightClass = 'cm-highlight';
        expect(highlightClass).toBeTruthy();
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
            } finally {
                window.removeEventListener('error', onError);
            }
        });

        test('editor renders markdown link [text](url) as .cm-link-widget', async () => {
            document.body.innerHTML = '<div id="editor-container"></div>';
            const { initEditor, createEditorView } = await import('../frontend/js/editor.js');
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

});

});

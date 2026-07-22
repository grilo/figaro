import { readFileSync } from 'node:fs';

function editorDOM() {
    document.body.innerHTML = `
        <div id="editor-container"></div>
        <span id="file-type"></span>
        <span id="cursor-position"></span>
        <span id="word-count"></span>
        <span id="char-count"></span>
        <span id="reading-time"></span>
    `;
}

function installSelectionLayoutStubs() {
    const rect = { left: 0, right: 8, top: 0, bottom: 16, width: 8, height: 16 };
    if (!Range.prototype.getClientRects) {
        Object.defineProperty(Range.prototype, 'getClientRects', {
            configurable: true,
            value: () => [rect],
        });
    }
    if (!Range.prototype.getBoundingClientRect) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: () => rect,
        });
    }
}

describe('Vim command and visual theming', () => {
    beforeEach(() => {
        installSelectionLayoutStubs();
        editorDOM();
    });

    test('draws a visual selection layer and exposes the Vim command panel', async () => {
        const { initEditor, createEditorView, toggleVim } = await import('../frontend/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        await initEditor();
        const view = createEditorView();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'alpha\nbeta' } });
        view.focus();

        await toggleVim(true);
        const cm = getCM(view);
        expect(cm).not.toBeNull();

        Vim.handleKey(cm, 'v', 'user');
        Vim.handleKey(cm, 'l', 'user');
        // drawSelection paints during CodeMirror's next animation frame.
        await new Promise(resolve => setTimeout(resolve, 30));

        expect(view.dom.classList.contains('vim-visual')).toBe(true);
        expect(view.dom.querySelector('.cm-selectionLayer .cm-selectionBackground')).not.toBeNull();

        Vim.handleKey(cm, '<Esc>', 'user');
        Vim.handleKey(cm, ':', 'user');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(view.dom.querySelector('.cm-vim-panel input')).not.toBeNull();

        await toggleVim(false);
    });

    test('styles Vim command input and visual selection with theme variables', () => {
        const stylesheet = readFileSync('frontend/styles.css', 'utf8');
        const editor = readFileSync('frontend/js/editor.js', 'utf8');
        expect(stylesheet).toMatch(/\.cm-editor \.cm-vim-panel input\s*\{[^}]*color:\s*var\(--text-color\)/s);
        expect(stylesheet).toMatch(/\.cm-editor\.vim-visual \.cm-selectionLayer \.cm-selectionBackground/);
        expect(stylesheet).toMatch(/\.vim-insert \.cm-cursor\s*\{[^}]*border-left:\s*4px solid var\(--accent-color\)/s);
        expect(editor).not.toContain('applyBlockCursor');
    });
});

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

function commandKey(input, key, keyCode) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
    }));
}

function deferred() {
    let resolve;
    const promise = new Promise(finish => { resolve = finish; });
    return { promise, resolve };
}

describe('Vim command behavior', () => {
    test('searches with / and :wq saves the latest buffer before closing the file tab', async () => {
        installSelectionLayoutStubs();
        document.body.innerHTML = `
            <div id="tab-bar"><div id="tab-strip"></div></div>
            <div id="tab-panels"></div>
            <div id="editor-container"></div>
            <span id="file-type"></span>
            <span id="status-text"></span>
            <span id="cursor-position"></span>
            <span id="word-count"></span>
            <span id="char-count"></span>
            <span id="reading-time"></span>
        `;

        const { initEditor, createEditorView, toggleVim, isVimEnabled } = await import('../frontend/js/editor.js');
        const { setState, getState } = await import('../frontend/js/state.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        await initEditor();
        // Startup may load the preference while Home is active. The requested
        // state must carry over when the first file creates the editor later.
        await toggleVim(true);
        const view = createEditorView();
        const fileTab = {
            id: 'notes/vim.md',
            path: 'notes/vim.md',
            title: 'vim.md',
            type: 'file',
            dirty: true,
            mtime: 10,
        };
        setState('openTabs', [fileTab]);
        setState('activeTabId', fileTab.id);
        setState('pinnedTabs', []);
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: 'alpha beta\nmiddle\nbeta end' },
            selection: { anchor: 0 },
        });
        view.focus();

        // Custom Ex commands register after the Vim adapter initializes.
        await new Promise(resolve => setTimeout(resolve, 130));
        expect(isVimEnabled()).toBe(true);
        const cm = getCM(view);

        Vim.handleKey(cm, '<Esc>', 'user');
        Vim.handleKey(cm, '/', 'user');
        await new Promise(resolve => setTimeout(resolve, 0));
        const searchInput = view.dom.querySelector('.cm-vim-panel input');
        expect(searchInput).not.toBeNull();
        searchInput.value = 'beta';
        commandKey(searchInput, 'Enter', 13);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(view.state.selection.main.head).toBe(6);

        Vim.handleKey(cm, 'n', 'user');
        expect(view.state.selection.main.head).toBe(18);
        Vim.handleKey(cm, 'N', 'user');
        expect(view.state.selection.main.head).toBe(6);

        const save = deferred();
        window.go.main.App.SaveFile.mockImplementationOnce(() => save.promise);
        const confirmDialog = jest.fn().mockResolvedValue(true);
        window.confirmDialog = confirmDialog;
        Vim.handleKey(cm, ':', 'user');
        await new Promise(resolve => setTimeout(resolve, 0));
        const exInput = view.dom.querySelector('.cm-vim-panel input');
        exInput.value = 'wq';
        commandKey(exInput, 'Enter', 13);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.go.main.App.SaveFile).toHaveBeenCalledWith(
            'notes/vim.md', 'alpha beta\nmiddle\nbeta end', 10
        );
        expect(getState('openTabs')).toContain(fileTab);
        expect(confirmDialog).not.toHaveBeenCalled();

        // An edit made while the first save is in flight must keep the tab
        // open. A subsequent :wq captures and saves that newer buffer.
        view.dispatch({
            changes: { from: view.state.doc.length, insert: '\nnewer text' },
        });
        save.resolve({ success: true, mtime: 20, path: 'notes/vim.md' });
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(getState('openTabs')).toContain(fileTab);
        expect(fileTab.dirty).toBe(true);
        expect(confirmDialog).not.toHaveBeenCalled();

        window.go.main.App.SaveFile.mockResolvedValueOnce({
            success: true,
            mtime: 30,
            path: 'notes/vim.md',
        });
        Vim.handleKey(cm, ':', 'user');
        await new Promise(resolve => setTimeout(resolve, 0));
        const secondExInput = view.dom.querySelector('.cm-vim-panel input');
        secondExInput.value = 'wq';
        commandKey(secondExInput, 'Enter', 13);
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.go.main.App.SaveFile).toHaveBeenNthCalledWith(
            2, 'notes/vim.md', 'alpha beta\nmiddle\nbeta end\nnewer text', 20
        );
        expect(getState('openTabs')).not.toContain(fileTab);
        expect(getState('activeTabId')).toBeNull();
        expect(getState('openTabs')).toEqual([]);
        expect(document.querySelector('.workspace-home-panel.active')).not.toBeNull();
        expect(confirmDialog).not.toHaveBeenCalled();
        await toggleVim(false);
    });
});

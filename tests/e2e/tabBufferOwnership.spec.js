import { expect, test } from '@playwright/test';

test('rapid tab switching saves the owned dirty buffer and rejects a stale deferred document', async ({ page }) => {
    await page.goto('/');
	await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const state = await import('/js/state.js');
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        const app = (await import('/js/backend.js')).backend();
        await editor.initEditor();
        editor.getEditorView() || editor.createEditorView();

        const openTabs = [
            { id: 'a', title: 'A', type: 'file', path: 'a.md', dirty: true, _content: 'A draft', _editGeneration: 1 },
            { id: 'b', title: 'B', type: 'file', path: 'b.md', dirty: true, _content: 'B draft', _editGeneration: 1 },
        ];
        state.setState('openTabs', openTabs);
        state.setState('activeTabId', 'a');
        editor.setEditorContent('A still visible', 'a');
        while (editor.getEditorDocumentTabId() !== 'a') {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        window.__tabOwnershipSaveCalls = [];
        app.SaveFile = async (path, content, mtime) => {
            window.__tabOwnershipSaveCalls.push({ path, content, mtime });
            return { success: true, path, mtime: 2 };
        };

        // This is the transient state produced when B becomes active before
        // its deferred CodeMirror replacement has displaced A's document.
        state.setState('activeTabId', 'b');
        editor.setEditorContent('B stale deferred request', 'b');
        tabs.switchTab('a');
        window.__tabOwnershipEditor = editor;
    });

    await expect.poll(() => page.evaluate(() => ({
        active: window.__tabOwnershipEditor.getEditorDocumentTabId(),
        content: window.__tabOwnershipEditor.getEditorContent(),
    }))).toEqual({ active: 'a', content: 'A draft' });
    await expect.poll(() => page.evaluate(() => window.__tabOwnershipSaveCalls)).toEqual([
        { path: 'b.md', content: 'B draft', mtime: 0 },
    ]);
});

test('selects an external tab only after its capability-backed buffer is ready', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const state = await import('/js/state.js');
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        const app = (await import('/js/backend.js')).backend();
        await editor.initEditor();
        editor.getEditorView() || editor.createEditorView();

        state.setState('openTabs', [
            { id: 'inside.md', title: 'Inside', type: 'file', path: 'inside.md', dirty: false },
            {
                id: 'external:launch-1',
                title: 'outside.md',
                type: 'file',
                path: '/home/writer/outside.md',
                externalFileId: 'launch-1',
                dirty: false,
            },
        ]);
        state.setState('activeTabId', 'inside.md');
        editor.setEditorContent('# Inside\n', 'inside.md');

        app.ReadLaunchExternalFile = () => new Promise(resolve => {
            window.__resolveExternalTabRead = resolve;
        });
        tabs.renderTabBar();
        window.__externalTabState = { state, editor };
    });

    await page.locator('.tab[data-tab-id="external:launch-1"]').click();
    await expect.poll(() => page.evaluate(() => ({
        activeTab: window.__externalTabState.state.getState('activeTabId'),
        editorOwner: window.__externalTabState.editor.getEditorDocumentTabId(),
        content: window.__externalTabState.editor.getEditorContent(),
    }))).toEqual({
        activeTab: 'inside.md',
        editorOwner: 'inside.md',
        content: '# Inside\n',
    });

    await page.evaluate(() => window.__resolveExternalTabRead({
        content: '# Outside\n',
        mtime: 2,
        path: '/home/writer/outside.md',
    }));

    await expect.poll(() => page.evaluate(() => ({
        activeTab: window.__externalTabState.state.getState('activeTabId'),
        editorOwner: window.__externalTabState.editor.getEditorDocumentTabId(),
        content: window.__externalTabState.editor.getEditorContent(),
    }))).toEqual({
        activeTab: 'external:launch-1',
        editorOwner: 'external:launch-1',
        content: '# Outside\n',
    });
    await expect(page.locator('.tab[data-tab-id="external:launch-1"]')).toHaveClass(/active/);
});

import { expect } from '@playwright/test';

export async function waitForWelcomeEditor(page) {
    await expect(page.locator('#editor-container > .cm-editor')).toBeVisible();
    await page.waitForFunction(async () => {
        const editor = await import('/js/editor.js');
        const state = await import('/js/state.js');
        const activeTabId = state.getState('activeTabId');
        const activeTab = state.getState('openTabs').find(tab => tab.id === activeTabId);
        return activeTab?.path === 'Welcome.md'
            && editor.getEditorDocumentTabId() === activeTabId;
    });
}

export async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await waitForWelcomeEditor(page);
}

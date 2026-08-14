import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('#editor-container > .cm-editor')).toBeVisible();
}

test('uses one persisted tab size for normal and Vim indentation across editor surfaces', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const api = (await import('/js/backend.js')).backend();
        window.__tabSizeWrites = [];
        api.TabSizeSave = async size => {
            window.__tabSizeWrites.push(size);
            return { success: true };
        };
    });

    await page.locator('#topbar-settings').click();
    const control = page.locator('.tab-size-control');
    const input = control.locator('.tab-size-value');
    await expect(control).toHaveAttribute('role', 'group');
    await expect(input).toHaveAttribute('type', 'number');
    await expect(input).toHaveAttribute('min', '2');
    await expect(input).toHaveAttribute('max', '8');
    await expect(input).toHaveValue('4');
    await expect(page.getByRole('button', { name: 'Decrease tab size' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Increase tab size' })).toBeVisible();
    expect(await input.evaluate(element => getComputedStyle(element).appearance)).toBe('textfield');

    await page.getByRole('button', { name: 'Increase tab size' }).click();
    await page.getByRole('button', { name: 'Increase tab size' }).click();
    await expect(input).toHaveValue('6');
    await expect.poll(() => page.evaluate(() => window.__tabSizeWrites)).toEqual([5, 6]);

    await page.locator('.tab[data-tab-id="Welcome.md"]').click();
    const fence = ['Before', '```js', 'const value = 1;', '```', 'After'].join('\n');
    await page.evaluate(async source => {
        const editor = await import('/js/editor.js');
        const { getIndentUnit } = await import('@codemirror/language');
        await editor.toggleVim(false);
        await editor.configureEditorForFile('Welcome.md');
        editor.setEditorContent(source);
        const view = window.__tabSizeView = editor.getEditorView();
        while (view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        view.focus();
        window.__tabSizeState = {
            tabSize: view.state.tabSize,
            indentUnit: getIndentUnit(view.state),
            css: getComputedStyle(document.documentElement).getPropertyValue('--editor-tab-size').trim(),
        };
    }, fence);
    expect(await page.evaluate(() => window.__tabSizeState)).toEqual({
        tabSize: 6,
        indentUnit: 6,
        css: '6',
    });

    const content = page.locator('#editor-container > .cm-editor .cm-content');
    await content.press('Tab');
    await expect.poll(() => page.evaluate(() => window.__tabSizeView.state.doc.line(3).text))
        .toBe('      const value = 1;');
    await content.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__tabSizeView.state.doc.lineAt(
        window.__tabSizeView.state.selection.main.head,
    ).number)).toBe(4);
    await content.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__tabSizeView.state.doc.lineAt(
        window.__tabSizeView.state.selection.main.head,
    ).number)).toBe(3);

    await page.evaluate(async source => {
        const editor = await import('/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const view = window.__tabSizeView;
        editor.setEditorContent(source);
        while (view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        await editor.toggleVim(true);
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        Vim.handleKey(getCM(view), '>', 'user');
        Vim.handleKey(getCM(view), '>', 'user');
    }, fence);
    await expect.poll(() => page.evaluate(() => window.__tabSizeView.state.doc.line(3).text))
        .toBe('      const value = 1;');

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const { getIndentUnit } = await import('@codemirror/language');
        await editor.toggleVim(false);
        await editor.configureEditorForFile('main.go');
        const view = window.__tabSizeView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: 'package main\nfunc main() {}' },
            selection: { anchor: 'package main\n'.length },
        });
        view.focus();
        window.__codeTabSizeState = {
            tabSize: view.state.tabSize,
            indentUnit: getIndentUnit(view.state),
        };
    });
    expect(await page.evaluate(() => window.__codeTabSizeState)).toEqual({ tabSize: 6, indentUnit: 6 });
    await content.press('Tab');
    await expect.poll(() => page.evaluate(() => window.__tabSizeView.state.doc.line(2).text))
        .toBe('      func main() {}');

    const blocks = [
        'Before',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| Alpha | One |',
        '',
        '```mermaid',
        'flowchart TD',
        'A --> B',
        '```',
        '',
        'After',
    ].join('\n');
    await page.evaluate(async source => {
        const editor = await import('/js/editor.js');
        await editor.configureEditorForFile('Welcome.md');
        const view = window.__tabSizeView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: source },
            selection: { anchor: 0 },
        });
        view.focus();
    }, blocks);
    await expect(page.locator('.tbl-table-widget')).toHaveCount(1);
    await expect(page.locator('.cm-live-diagram')).toHaveCount(1);

    await page.locator('.tbl-cell').first().click();
    await expect.poll(() => page.evaluate(async () => {
        const { getIndentUnit } = await import('@codemirror/language');
        const contentDOM = document.activeElement?.closest?.('.tbl-cell-editor .cm-content');
        const nested = contentDOM ? window.__tabSizeView.constructor.findFromDOM(contentDOM) : null;
        return nested ? { tabSize: nested.state.tabSize, indentUnit: getIndentUnit(nested.state) } : null;
    })).toEqual({ tabSize: 6, indentUnit: 6 });

    await page.evaluate(() => {
        const view = window.__tabSizeView;
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    });
    await page.getByRole('button', { name: 'Open Mermaid Editor for this diagram' }).click();
    const modalContent = page.locator('.mermaid-editor-code-host .cm-content');
    await expect(modalContent).toBeFocused();
    expect(await page.evaluate(async () => {
        const { EditorView } = await import('@codemirror/view');
        const { getIndentUnit } = await import('@codemirror/language');
        const modal = EditorView.findFromDOM(document.querySelector('.mermaid-editor-code-host .cm-content'));
        modal.dispatch({ selection: { anchor: modal.state.doc.line(2).from } });
        modal.focus();
        window.__tabSizeMermaidView = modal;
        return { tabSize: modal.state.tabSize, indentUnit: getIndentUnit(modal.state) };
    })).toEqual({ tabSize: 6, indentUnit: 6 });
    await modalContent.press('Tab');
    await expect.poll(() => page.evaluate(() => window.__tabSizeMermaidView.state.doc.line(2).text))
        .toBe('      A --> B');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        const view = window.__tabSizeView;
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    });
    await page.getByRole('button', { name: 'Open Mermaid Editor for this diagram' }).click();
    await page.evaluate(async () => {
        const { EditorView } = await import('@codemirror/view');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const modal = EditorView.findFromDOM(document.querySelector('.mermaid-editor-code-host .cm-content'));
        modal.dispatch({ selection: { anchor: modal.state.doc.line(2).from } });
        Vim.handleKey(getCM(modal), '>', 'user');
        Vim.handleKey(getCM(modal), '>', 'user');
        window.__tabSizeMermaidView = modal;
    });
    await expect.poll(() => page.evaluate(() => window.__tabSizeMermaidView.state.doc.line(2).text))
        .toBe('      A --> B');
});

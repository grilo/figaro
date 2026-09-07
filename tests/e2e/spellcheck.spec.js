import { expect, test } from '@playwright/test';
import { waitForWelcomeEditor } from './support/editorWorkspace.js';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await waitForWelcomeEditor(page);
    await page.locator('#writing-lenses-toggle').click();
    const pane = page.locator('#writing-lenses-panel');
    await pane.getByRole('combobox', { name: 'Analysis language' }).click();
    await page.getByRole('option', { name: 'English (US)', exact: true }).click();
    await pane.getByRole('checkbox', { name: 'Proofreading', exact: true }).check();
    await page.locator('#writing-lenses-toggle').click();
}

async function spellcheckWords(page) {
    return page.locator('.cm-writing-range').allTextContents().then(words => words.sort());
}

test('Proofreading spelling hover and right-click replacements preserve native keyboard and drag selection', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = 'color colour teh ete\n\nAfter the spelling range';
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(text);
        const view = editor.getEditorView();
        await new Promise(resolve => setTimeout(resolve, 80));
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
        window.__spellcheckView = view;
    }, source);

    await expect.poll(() => spellcheckWords(page)).toEqual(['colour', 'ete', 'teh']);

    const content = page.locator('.cm-content');
    await content.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__spellcheckView.state.doc.lineAt(
        window.__spellcheckView.state.selection.main.head,
    ).number)).toBe(2);
    await content.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__spellcheckView.state.doc.lineAt(
        window.__spellcheckView.state.selection.main.head,
    ).number)).toBe(1);

    const endpoints = await page.evaluate(() => {
        const view = window.__spellcheckView;
        const line = view.state.doc.line(1);
        const first = view.coordsAtPos(line.from);
        const last = view.coordsAtPos(line.to);
        return {
            first: { x: first.left + 2, y: (first.top + first.bottom) / 2 },
            last: { x: last.left + 2, y: (last.top + last.bottom) / 2 },
        };
    });
    await page.mouse.move(endpoints.first.x, endpoints.first.y);
    await page.mouse.down();
    await page.mouse.move(endpoints.last.x, endpoints.last.y, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.__spellcheckView.state.selection.main.to - window.__spellcheckView.state.selection.main.from))
        .toBeGreaterThan(4);

    const misspelling = page.locator('.cm-writing-range').first();
    await expect(misspelling).toBeVisible();
    await misspelling.hover();
    await expect(page.getByRole('dialog', { name: 'Writing suggestions', exact: true })).toContainText('selected dictionaries');
    await page.evaluate(() => document.documentElement.style.setProperty('--link-color', 'rgb(18, 160, 176)'));
    await expect(misspelling).toHaveCSS('background-size', '4px 2px');
    expect(await misspelling.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('rgb(18, 160, 176)');

    const misspelledWord = page.locator('.cm-writing-range').filter({ hasText: 'teh' });
    await misspelledWord.click({ button: 'right' });
    const spellingMenu = page.locator('.editor-context-menu');
    await expect(spellingMenu).toContainText('Spelling suggestions');
    const replacement = spellingMenu.locator('[data-action="replace-spelling"]').first();
    await expect(replacement).toBeVisible();
    await expect(spellingMenu.locator('[data-action="replace-spelling"]')).toHaveCount(1);
    await expect(replacement).toHaveText('the');
    await replacement.focus();
    await expect(replacement).toBeFocused();
    await replacement.press('Enter');
    await expect.poll(() => spellcheckWords(page)).toEqual(['colour', 'ete']);
    await content.focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => spellcheckWords(page)).toEqual(['colour', 'ete', 'teh']);

    await page.locator('.cm-writing-range').filter({ hasText: 'ete' }).click({ button: 'right' });
    await expect(spellingMenu).toContainText('No suggestions found');
    await expect(spellingMenu.locator('[data-action="replace-spelling"]')).toHaveCount(0);

    await page.keyboard.press('Escape');
});

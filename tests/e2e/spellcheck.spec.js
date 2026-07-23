import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

async function spellcheckWords(page) {
    return page.evaluate(async () => {
        const { forEachDiagnostic } = await import('@codemirror/lint');
        const view = window.__spellcheckView;
        const words = [];
        forEachDiagnostic(view.state, diagnostic => {
            if (diagnostic.source === 'Figaro spellcheck') {
                words.push(view.state.doc.sliceString(diagnostic.from, diagnostic.to));
            }
        });
        return words.sort();
    });
}

test('checks offline English and Spanish prose, offers local right-click replacements, and keeps normal editor movement intact', async ({ page }) => {
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

    const misspelling = page.locator('.cm-spellcheck-range').first();
    await expect(misspelling).toBeVisible();
    await misspelling.hover();
    await expect(page.locator('.cm-tooltip-lint')).toContainText(/not in the English \(US\) dictionary/i);
    await page.evaluate(() => document.documentElement.style.setProperty('--link-color', 'rgb(18, 160, 176)'));
    await expect(misspelling).toHaveCSS('background-size', '4px 2px');
    expect(await misspelling.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('rgb(18, 160, 176)');
    await expect(page.locator('.cm-diagnostic-info')).toHaveCSS('border-left-color', 'rgb(18, 160, 176)');

    const misspelledWord = page.locator('.cm-spellcheck-range').filter({ hasText: 'teh' });
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

    await page.locator('.cm-spellcheck-range').filter({ hasText: 'ete' }).click({ button: 'right' });
    await expect(spellingMenu).toContainText('No suggestions found');
    await expect(spellingMenu.locator('[data-action="replace-spelling"]')).toHaveCount(0);

    await page.locator('#topbar-settings').click();
    const language = page.locator('#spellcheck-language');
    const languageControl = page.locator('.select-combobox').filter({ has: language }).locator('.select-combobox-trigger');
    await expect(language).toHaveClass(/select-combobox-native/);
    await expect(languageControl).toBeVisible();
    await expect(languageControl).toHaveAttribute('role', 'combobox');
    await expect(languageControl).toHaveCSS('height', '34px');
    await expect(languageControl).toHaveCSS('border-radius', '7px');
    await languageControl.focus();
    await expect(languageControl).toBeFocused();
    await languageControl.press('ArrowDown');
    await expect(languageControl).toHaveAttribute('aria-expanded', 'true');
    await languageControl.press('ArrowDown');
    await languageControl.press('Enter');
    await expect(language).toHaveValue('en-GB');
    await expect.poll(() => spellcheckWords(page)).toEqual(['color', 'ete', 'teh']);

    await page.evaluate(() => {
        const view = window.__spellcheckView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '---\nspellcheck: es\n---\nhola mundo teh' } });
    });
    await expect.poll(() => spellcheckWords(page)).toEqual(['teh']);

    const toggle = page.locator('#spellcheck-toggle');
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle).not.toBeChecked();
    await expect(language).toBeDisabled();
    await expect(languageControl).toBeDisabled();
    await expect(languageControl).toHaveCSS('cursor', 'not-allowed');
    await expect(languageControl).toHaveCSS('opacity', '0.62');
    await expect.poll(() => spellcheckWords(page)).toEqual([]);
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();
    await expect.poll(() => spellcheckWords(page)).toEqual(['teh']);
});

import { expect, test } from '@playwright/test';

test('generates rendered Properties first and reuses one disclosure across cursor navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('# Body\n\nAfter');
        const view = editor.getEditorView();
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        window.__frontmatterView = view;
    });

    const addProperties = page.locator('.cm-add-properties');
    await expect(addProperties).toBeVisible();
    await addProperties.click();

    const panel = page.locator('.cm-frontmatter-panel');
    const expandedDisclosure = page.locator('.cm-frontmatter-disclosure-button');
    await expect(panel).toBeVisible();
    await expect(expandedDisclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.cm-frontmatter-source-line')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /Preview Raw Text/i })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /Preview PDF/i })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__frontmatterView.state.doc.toString()))
        .toMatch(/^---\ntitle: Body\n/);

    const selectedLine = () => page.evaluate(() => {
        const view = window.__frontmatterView;
        return view.state.doc.lineAt(view.state.selection.main.head).text;
    });
    await expect.poll(selectedLine).toBe('After');

    const language = page.getByRole('combobox', { name: 'Spellcheck language for this note' });
    await language.click();
    const disabledLanguage = page.getByRole('option', { name: 'Disabled for this note' });
    await expect(disabledLanguage).toBeVisible();
    const popupHit = await disabledLanguage.evaluate(option => {
        const panelBox = option.closest('.cm-frontmatter-panel').getBoundingClientRect();
        const optionBox = option.getBoundingClientRect();
        const x = optionBox.left + optionBox.width / 2;
        const y = optionBox.top + optionBox.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
            extendsBeyondPanel: optionBox.bottom > panelBox.bottom,
            hitValue: hit?.closest('[role="option"]')?.getAttribute('data-value') || '',
        };
    });
    expect(popupHit.extendsBeyondPanel).toBe(true);
    expect(popupHit.hitValue).toBe('false');
    await disabledLanguage.hover();
    await expect(language).toBeFocused();
    await expect(language).toHaveAttribute('aria-expanded', 'true');
    await disabledLanguage.click();
    await expect(language).toContainText('Disabled for this note');
    await expect.poll(() => page.evaluate(() => window.__frontmatterView.state.doc.toString()))
        .toContain('spellcheck: false');
    await expect.poll(selectedLine).toBe('After');

    await expandedDisclosure.click();
    const collapsedCard = page.locator('.cm-frontmatter');
    await expect(collapsedCard).toBeVisible();
    const collapsedCenter = await collapsedCard.locator('.cm-frontmatter-disclosure').evaluate(element => {
        const box = element.getBoundingClientRect();
        return box.left + box.width / 2;
    });
    await collapsedCard.click();
    await expect(expandedDisclosure).toBeVisible();
    const expandedState = await expandedDisclosure.evaluate(button => {
        const arrow = button.querySelector('.cm-frontmatter-disclosure');
        const box = arrow.getBoundingClientRect();
        return {
            center: box.left + box.width / 2,
            transform: getComputedStyle(arrow).transform,
        };
    });
    expect(Math.abs(expandedState.center - collapsedCenter)).toBeLessThanOrEqual(3);
    expect(expandedState.transform).not.toBe('none');

    await expandedDisclosure.click();
    await expect(collapsedCard).toBeVisible();
    await page.evaluate(() => {
        const view = window.__frontmatterView;
        const body = view.state.doc.toString().indexOf('# Body') + 2;
        view.dispatch({ selection: { anchor: body } });
        view.focus();
    });
    const content = page.locator('.cm-content');

    await content.press('Home');
    await expect(collapsedCard).toBeVisible();
    await content.press('Control+Home');
    await expect.poll(() => page.evaluate(() => (
        window.__frontmatterView.state.selection.main.head
    ))).toBe(0);
    await expect(collapsedCard).toBeVisible();

    // Arrow Up is the deliberate request to enter raw frontmatter, even after
    // a document-start command left the logical selection behind Properties.
    await content.press('ArrowUp');
    await expect(page.locator('.cm-frontmatter-source-line')).toHaveCount(2);
    await expect(collapsedCard).toHaveCount(0);

    await page.evaluate(() => {
        const view = window.__frontmatterView;
        const source = view.state.doc.toString();
        const closing = source.lastIndexOf('\n---\n') + 1;
        view.dispatch({ selection: { anchor: closing } });
        view.focus();
    });
    await content.press('ArrowDown');
    await content.press('ArrowDown');
    await expect(collapsedCard).toBeVisible();
    await expect(page.locator('.cm-frontmatter-source-line')).toHaveCount(0);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        window.__frontmatterView.focus();
    });
    await content.press('g');
    await content.press('g');
    await expect.poll(() => page.evaluate(() => (
        window.__frontmatterView.state.selection.main.head
    ))).toBe(0);
    await expect(collapsedCard).toBeVisible();

    await content.press('k');
    await expect(page.locator('.cm-frontmatter-source-line')).toHaveCount(2);
    await expect(collapsedCard).toHaveCount(0);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const view = window.__frontmatterView;
        await editor.toggleVim(false);
        view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('# Body') + 2 } });
        view.focus();
    });
    await expect(collapsedCard).toBeVisible();

    // Ordinary pointer placement and drag selection do not imply an Edit YAML
    // request merely because their range reaches the replaced source.
    const dragPoints = await page.evaluate(() => {
        const view = window.__frontmatterView;
        const body = view.state.doc.toString().indexOf('# Body');
        const after = view.state.doc.toString().indexOf('After');
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 4, y: (coords.top + coords.bottom) / 2 };
        };
        return { body: point(body), after: point(after) };
    });
    for (const [start, end] of [
        [dragPoints.body, dragPoints.after],
        [dragPoints.after, dragPoints.body],
    ]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        await expect(collapsedCard).toBeVisible();
        expect(await page.evaluate(() => window.__frontmatterView.state.selection.main.empty)).toBe(false);
    }

    await page.evaluate(() => {
        const view = window.__frontmatterView;
        view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('# Body') } });
        view.focus();
    });
    await content.press('ArrowUp');
    await expect(page.locator('.cm-frontmatter-source-line')).toHaveCount(2);
    await expect(collapsedCard).toHaveCount(0);
});

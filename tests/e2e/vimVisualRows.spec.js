import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

async function setEditorSource(page, source, selection = 0) {
    await page.evaluate(async ({ source: nextSource, selection: nextSelection }) => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(nextSource);
        const view = editor.getEditorView();
        await new Promise(resolve => setTimeout(resolve, 80));
        view.dispatch({ selection: { anchor: nextSelection } });
        view.focus();
        window.__vimVisualRowsView = view;
    }, { source, selection });
}

test('uses a 4px line caret while Vim is inserting text', async ({ page }) => {
    await openWelcomeEditor(page);
    await setEditorSource(page, 'alpha');

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const view = editor.getEditorView();
        await editor.toggleVim(true);
        Vim.handleKey(getCM(view), 'i', 'user');
    });

    await expect(page.locator('.cm-editor')).toHaveClass(/vim-insert/);
    const insertCursor = await page.locator('.cm-cursor').evaluate(cursor => {
        const style = getComputedStyle(cursor);
        return {
            background: style.backgroundColor,
            borderWidth: style.borderLeftWidth,
            borderStyle: style.borderLeftStyle,
            borderColor: style.borderLeftColor,
        };
    });
    expect(insertCursor.background).toBe('rgba(0, 0, 0, 0)');
    expect(insertCursor.borderWidth).toBe('4px');
    expect(insertCursor.borderStyle).toBe('solid');
    expect(insertCursor.borderColor).not.toBe('rgba(0, 0, 0, 0)');
});

test('themes the root Vim Normal block cursor instead of using the adapter fallback red', async ({ page }) => {
    await openWelcomeEditor(page);
    await setEditorSource(page, 'alpha');
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const themes = ['/themes/default.css', '/themes/figaro-light.css'];
    const results = [];
    for (const path of themes) {
        const state = await page.evaluate(async (themePath) => {
            const response = await fetch(themePath);
            if (!response.ok) throw new Error(`Could not load ${themePath}`);
            let style = document.getElementById('theme-style');
            if (!style) {
                style = document.createElement('style');
                style.id = 'theme-style';
                document.head.appendChild(style);
            }
            style.textContent = await response.text();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            const editor = document.querySelector('#editor-container > .cm-editor.vim-normal.cm-focused');
            const cursor = editor?.querySelector(
                ':scope > .cm-scroller > .cm-vimCursorLayer .cm-fat-cursor',
            );
            const cursorStyle = cursor ? getComputedStyle(cursor) : null;
            const cursorRect = cursor?.getBoundingClientRect();
            const probe = document.createElement('span');
            probe.style.backgroundColor = 'var(--cursor-bg)';
            probe.style.color = 'var(--cursor-text)';
            document.body.appendChild(probe);
            const probeStyle = getComputedStyle(probe);
            const expected = {
                background: probeStyle.backgroundColor,
                color: probeStyle.color,
            };
            probe.remove();
            return {
                status: document.getElementById('file-type')?.textContent || '',
                expected,
                cursor: cursorStyle && cursorRect ? {
                    background: cursorStyle.backgroundColor,
                    color: cursorStyle.color,
                    visibility: cursorStyle.visibility,
                    opacity: cursorStyle.opacity,
                    width: cursorRect.width,
                    height: cursorRect.height,
                } : null,
            };
        }, path);

        expect(state.status).toBe('NORMAL');
        expect(state.cursor).not.toBeNull();
        expect(state.cursor.background).toBe(state.expected.background);
        expect(state.cursor.color).toBe(state.expected.color);
        expect(state.cursor.background).not.toBe('rgb(255, 150, 150)');
        expect(state.cursor.visibility).toBe('visible');
        expect(Number.parseFloat(state.cursor.opacity)).toBeGreaterThan(0.9);
        expect(state.cursor.width).toBeGreaterThan(1);
        expect(state.cursor.height).toBeGreaterThan(1);
        results.push(state.cursor.background);
    }

    expect(new Set(results).size).toBe(themes.length);
});

test('persists a keyboard-operable visual-row preference that is unavailable without Vim', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.locator('#topbar-settings').click();

    const visualRowsToggle = page.locator('#vim-visual-rows-toggle');
    const visualRowsSlider = visualRowsToggle.locator('xpath=following-sibling::*[1]');
    const revealBlocksToggle = page.locator('#vim-reveal-blocks-toggle');
    const revealBlocksSlider = revealBlocksToggle.locator('xpath=following-sibling::*[1]');
    const vimToggle = page.locator('#vim-toggle');
    await expect(visualRowsToggle).toBeDisabled();
    await expect(visualRowsToggle).toHaveAttribute('title', /Enable Vim Mode/i);
    await expect(visualRowsSlider).toHaveCSS('cursor', 'not-allowed');
    await expect(visualRowsSlider).toHaveCSS('opacity', '0.5');
    await expect(visualRowsSlider).toHaveCSS('border-radius', '20px');
    await expect(revealBlocksToggle).toBeDisabled();
    await expect(revealBlocksToggle).toHaveAttribute('title', /Enable Vim Mode/i);
    await expect(revealBlocksSlider).toHaveCSS('cursor', 'not-allowed');
    await expect(revealBlocksSlider).toHaveCSS('opacity', '0.5');
    await expect(revealBlocksSlider).toHaveCSS('border-radius', '20px');

    await vimToggle.focus();
    await page.keyboard.press('Space');
    await expect(vimToggle).toBeChecked();
    await expect(visualRowsToggle).toBeEnabled();
    await expect(revealBlocksToggle).toBeEnabled();

    await visualRowsToggle.focus();
    await expect(visualRowsToggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(visualRowsToggle).toBeChecked();
    await expect(visualRowsSlider).toHaveCSS('background-color', /.+/);
    await expect.poll(() => page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        return editor.isVimEnabled();
    })).toBe(true);

    await revealBlocksToggle.focus();
    await page.keyboard.press('Space');
    await expect(revealBlocksToggle).toBeChecked();
    await expect(revealBlocksSlider).toHaveCSS('background-color', /.+/);
});

test('moves Vim Normal-mode j/k and arrows by visual rows without changing operator motions', async ({ page }) => {
    await openWelcomeEditor(page);
    const paragraph = Array.from({ length: 130 }, (_, index) => `word${index}`).join(' ');
    const start = 260;
    await setEditorSource(page, paragraph, start);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimVisualRows(true);
    });

    const before = await page.evaluate(() => {
        const view = window.__vimVisualRowsView;
        const position = view.state.selection.main.head;
        return { position, coords: view.coordsAtPos(position) };
    });
    const content = page.locator('.cm-content');
    await content.press('j');
    const afterJ = await page.evaluate(() => {
        const view = window.__vimVisualRowsView;
        const position = view.state.selection.main.head;
        return { position, line: view.state.doc.lineAt(position).number, coords: view.coordsAtPos(position) };
    });
    expect(afterJ.line).toBe(1);
    expect(afterJ.position).toBeGreaterThan(before.position);
    expect(afterJ.position).toBeLessThan(paragraph.length - 1);
    expect(afterJ.coords.top).toBeGreaterThan(before.coords.top);

    await content.press('k');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.selection.main.head)).toBe(start);

    await content.press('ArrowDown');
    const afterArrowDown = await page.evaluate(() => {
        const view = window.__vimVisualRowsView;
        const position = view.state.selection.main.head;
        return { position, coords: view.coordsAtPos(position) };
    });
    expect(afterArrowDown.position).toBeGreaterThan(before.position);
    expect(afterArrowDown.position).toBeLessThan(paragraph.length - 1);
    expect(afterArrowDown.coords.top).toBeGreaterThan(before.coords.top);
    await content.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.selection.main.head)).toBe(start);

    const twoSourceLines = `${paragraph}\nsecond source line\nremaining line`;
    await setEditorSource(page, twoSourceLines);
    await content.press('d');
    await content.press('j');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.doc.toString())).toBe('remaining line');
});

test('moves up one visual row within an expanded long Markdown link in Vim Normal mode', async ({ page }) => {
    await openWelcomeEditor(page);
    const url = `https://example.test/${Array.from({ length: 180 }, (_, index) => `segment-${index}`).join('/')}`;
    const source = `[Long wrapped link](${url})`;
    const position = source.indexOf(url) + Math.floor(url.length * 0.68);
    await setEditorSource(page, source, position);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimVisualRows(true);
    });

    const before = await page.evaluate(() => {
        const view = window.__vimVisualRowsView;
        const position = view.state.selection.main.head;
        return { position, coords: view.coordsAtPos(position) };
    });
    expect(before.coords.top).toBeGreaterThan(0);

    await page.locator('.cm-content').press('k');
    const after = await page.evaluate(() => {
        const view = window.__vimVisualRowsView;
        const position = view.state.selection.main.head;
        return { position, coords: view.coordsAtPos(position) };
    });

    expect(after.position).toBeLessThan(before.position);
    expect(after.coords.top).toBeLessThan(before.coords.top);
});

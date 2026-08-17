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

async function expectStableLongDocumentViewport(page) {
    const state = await page.evaluate(() => {
        const view = window.__vimVisualRowsView;
        const scroller = view.scrollDOM;
        const scrollerRect = scroller.getBoundingClientRect();
        const selection = view.state.selection.main;
        const primaryViewport = view.viewport;
        const cursor = view.coordsAtPos(selection.head);
        const domPosition = view.domAtPos(selection.head);
        const domNode = domPosition?.node?.nodeType === Node.TEXT_NODE
            ? domPosition.node.parentElement
            : domPosition?.node;
        const line = domNode?.closest?.('.cm-line');
        const lineRect = line?.getBoundingClientRect();
        const visibleGaps = [...view.dom.querySelectorAll('.cm-gap')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom && rect.height > 1;
        });
        return {
            lineNumber: view.state.doc.lineAt(selection.head).number,
            viewportCount: view.viewState.viewports.length,
            primaryContainsSelection: selection.head >= primaryViewport.from
                && selection.head <= primaryViewport.to,
            cursorVisible: Boolean(cursor && cursor.bottom > scrollerRect.top && cursor.top < scrollerRect.bottom),
            selectedLineVisible: Boolean(lineRect
                && lineRect.bottom > scrollerRect.top
                && lineRect.top < scrollerRect.bottom),
            visibleGapCount: visibleGaps.length,
        };
    });

    expect(state.lineNumber).toBeGreaterThan(20);
    expect(state.viewportCount).toBe(1);
    expect(state.primaryContainsSelection).toBe(true);
    expect(state.cursorVisible).toBe(true);
    expect(state.selectedLineVisible).toBe(true);
    expect(state.visibleGapCount).toBe(0);
}

function longWrappedMarkdown() {
    return Array.from({ length: 180 }, (_, index) => {
        const heading = index % 30 === 0 ? `# Section ${index}\n` : '';
        const paragraph = Array.from({ length: 3 }, () => (
            `Paragraph ${index} contains enough ordinary Markdown prose to wrap across `
            + 'multiple visual rows while the editor measures and remounts its viewport.'
        )).join(' ');
        return `${heading}${paragraph}`;
    }).join('\n\n');
}

function renderedLongMarkdown() {
    const mermaid = [
        '```mermaid',
        'flowchart TD',
        '    A[Start] --> B{Continue}',
        '    B -->|Yes| C[Render]',
        '    B -->|No| D[Stop]',
        '```',
    ].join('\n');
    const paragraph = index => Array.from({ length: 3 }, () => (
        `Section ${index} contains enough wrapped Markdown prose to keep the `
        + 'CodeMirror viewport moving while rendered block widgets are measured '
        + 'and mounted around the selected source line.'
    )).join(' ');

    return [
        '---',
        'title: viewport regression',
        '---',
        '',
        '# Viewport regression',
        ...Array.from({ length: 20 }, (_, index) => [
            `## Section ${index + 1}`,
            paragraph(index + 1),
            '',
            mermaid,
            '',
            paragraph(index + 1),
        ].join('\n')),
    ].join('\n\n');
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

test('keeps Vim vertical movement at the exact first and last document positions', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = 'first line\nmiddle line\nlast line';
    const lastCharacter = source.length - 1;
    await setEditorSource(page, source, lastCharacter);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimVisualRows(false);
    });

    const content = page.locator('.cm-content');
    await content.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.selection.main.head))
        .toBe(lastCharacter);
    await content.press('j');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.selection.main.head))
        .toBe(lastCharacter);

    await page.evaluate(position => {
        const view = window.__vimVisualRowsView;
        view.dispatch({ selection: { anchor: position } });
        view.focus();
    }, lastCharacter);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setVimVisualRows(true);
    });
    await content.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.selection.main.head))
        .toBe(lastCharacter);
    await content.press('j');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.selection.main.head))
        .toBe(lastCharacter);

    await page.evaluate(() => {
        const view = window.__vimVisualRowsView;
        view.dispatch({ selection: { anchor: 2 } });
        view.focus();
    });
    await content.press('k');
    await content.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__vimVisualRowsView.state.selection.main.head)).toBe(0);
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

test('keeps long documents mounted while reversing line-by-line navigation in normal and Vim modes', async ({ page }) => {
    const source = longWrappedMarkdown();
    await openWelcomeEditor(page);
    await setEditorSource(page, source);

    const content = page.locator('.cm-content');
    for (let index = 0; index < 260; index += 1) {
        await content.press('ArrowDown');
        if (index % 40 === 0) await page.waitForTimeout(6);
    }
    await page.waitForTimeout(100);
    await expectStableLongDocumentViewport(page);

    for (let index = 0; index < 24; index += 1) await content.press('ArrowUp');
    await page.waitForTimeout(100);
    await expectStableLongDocumentViewport(page);

    for (let index = 0; index < 140; index += 1) {
        await content.press('ArrowDown');
        if (index % 40 === 0) await page.waitForTimeout(6);
    }
    await page.waitForTimeout(100);
    await expectStableLongDocumentViewport(page);

    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await setEditorSource(page, source);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimVisualRows(false);
    });

    for (let index = 0; index < 260; index += 1) {
        await content.press('j');
        if (index % 40 === 0) await page.waitForTimeout(6);
    }
    await page.waitForTimeout(100);
    await expectStableLongDocumentViewport(page);

    for (let index = 0; index < 24; index += 1) await content.press('k');
    await page.waitForTimeout(100);
    await expectStableLongDocumentViewport(page);

    for (let index = 0; index < 140; index += 1) {
        await content.press('j');
        if (index % 40 === 0) await page.waitForTimeout(6);
    }
    await page.waitForTimeout(100);
    await expectStableLongDocumentViewport(page);
});

test('reconciles keyboard viewport after crossing rendered block widgets', async ({ page }) => {
    const source = renderedLongMarkdown();
    await openWelcomeEditor(page);
    await setEditorSource(page, source);

    const content = page.locator('.cm-content');
    await expect.poll(() => page.locator('.cm-live-diagram').count()).toBeGreaterThan(0);
    for (let index = 0; index < 180; index += 1) {
        await content.press('ArrowDown');
        if (index % 30 === 0) await page.waitForTimeout(6);
    }
    await expectStableLongDocumentViewport(page);

    for (let index = 0; index < 10; index += 1) await content.press('ArrowUp');
    await expectStableLongDocumentViewport(page);
    await content.press('PageUp');
    await expectStableLongDocumentViewport(page);
    await content.press('PageDown');
    await expectStableLongDocumentViewport(page);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimVisualRows(false);
    });
    for (let index = 0; index < 180; index += 1) {
        await content.press('j');
        if (index % 30 === 0) await page.waitForTimeout(6);
    }
    await expectStableLongDocumentViewport(page);

    for (let index = 0; index < 10; index += 1) await content.press('k');
    await expectStableLongDocumentViewport(page);
});

test('reuses Mermaid rendering while scrolling through virtualized diagram blocks', async ({ page }) => {
    const source = renderedLongMarkdown();
    await openWelcomeEditor(page);
    await page.evaluate(() => {
        const mermaid = window.mermaid;
        const originalRender = mermaid.render;
        window.__mermaidScrollRenderProbe = { calls: 0 };
        mermaid.render = async function (...args) {
            window.__mermaidScrollRenderProbe.calls += 1;
            return originalRender.apply(this, args);
        };
    });
    await setEditorSource(page, source);

    const scroller = page.locator('.cm-scroller');
    const box = await scroller.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let index = 0; index < 80; index += 1) {
        await page.mouse.wheel(0, 220);
        await page.waitForTimeout(8);
    }
    await page.waitForTimeout(300);
    await expect.poll(() => page.evaluate(() => window.__mermaidScrollRenderProbe.calls))
        .toBeGreaterThan(0);

    const bottom = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('.cm-live-diagram svg [id], .cm-live-diagram svg')]
            .map(element => element.id)
            .filter(Boolean);
        return {
            calls: window.__mermaidScrollRenderProbe.calls,
            ids,
            scrollTop: document.querySelector('.cm-scroller').scrollTop,
        };
    });
    expect(bottom.scrollTop).toBeGreaterThan(0);
    expect(bottom.calls).toBe(1);
    expect(new Set(bottom.ids).size).toBe(bottom.ids.length);

    for (let index = 0; index < 80; index += 1) {
        await page.mouse.wheel(0, -220);
        await page.waitForTimeout(8);
    }
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__mermaidScrollRenderProbe.calls)).toBe(1);
});

test('keeps Vim Visual mode while selecting through a rendered code block from either direction', async ({ page }) => {
    await openWelcomeEditor(page);
    const fence = '`'.repeat(3);
    const source = [
        'Before the block',
        `${fence}javascript`,
        'const answer = 42;',
        fence,
        'After the block',
    ].join('\n');
    await setEditorSource(page, source, 2);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimRevealBlocks(false);
    });

    const content = page.locator('.cm-content');
    await expect(page.locator('.cm-codeblock-widget')).toHaveCount(1);
    await content.press('v');
    await content.press('j');

    const downward = await page.evaluate(async () => {
        const { getCM } = await import('@replit/codemirror-vim');
        const view = window.__vimVisualRowsView;
        const selection = view.state.selection.main;
        return {
            visualMode: Boolean(getCM(view).state.vim?.visualMode),
            empty: selection.empty,
            anchor: selection.anchor,
            head: selection.head,
            headLine: view.state.doc.lineAt(selection.head).number,
        };
    });
    expect(downward.visualMode).toBe(true);
    expect(downward.empty).toBe(false);
    expect(downward.head).toBeGreaterThan(downward.anchor);
    expect(downward.headLine).toBe(2);
    await expect(page.locator('.cm-codeblock-widget')).toHaveCount(0);
    await expect(page.locator('.cm-codeblock-source').first()).toBeVisible();

    await content.press('j');
    expect(await page.evaluate(async () => {
        const { getCM } = await import('@replit/codemirror-vim');
        const view = window.__vimVisualRowsView;
        return {
            visualMode: Boolean(getCM(view).state.vim?.visualMode),
            line: view.state.doc.lineAt(view.state.selection.main.head).number,
        };
    })).toEqual({ visualMode: true, line: 3 });

    await content.press('Escape');
    await page.evaluate((position) => {
        const view = window.__vimVisualRowsView;
        view.dispatch({ selection: { anchor: position } });
        view.focus();
    }, source.lastIndexOf('After') + 2);
    await expect(page.locator('.cm-codeblock-widget')).toHaveCount(1);

    await content.press('v');
    await content.press('k');
    const upward = await page.evaluate(async () => {
        const { getCM } = await import('@replit/codemirror-vim');
        const view = window.__vimVisualRowsView;
        const selection = view.state.selection.main;
        return {
            visualMode: Boolean(getCM(view).state.vim?.visualMode),
            empty: selection.empty,
            anchor: selection.anchor,
            head: selection.head,
            headLine: view.state.doc.lineAt(selection.head).number,
        };
    });
    expect(upward.visualMode).toBe(true);
    expect(upward.empty).toBe(false);
    expect(upward.head).toBeLessThan(upward.anchor);
    expect(upward.headLine).toBe(4);
    await expect(page.locator('.cm-codeblock-widget')).toHaveCount(0);
});

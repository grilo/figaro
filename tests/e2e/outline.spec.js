import { expect, test } from '@playwright/test';
import { openWelcomeEditor } from './support/editorWorkspace.js';

test('stacks Outline, Raw, PDF, and Writing lenses launchers with usable responsive pane geometry', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = '# Report\n\nBody';
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.length } });
    }, source);

    const outline = page.locator('#outline-toggle');
    const raw = page.locator('#raw-text-preview-toggle');
    const pdf = page.locator('#pdf-preview-toggle');
    const lenses = page.locator('#writing-lenses-toggle');
    await expect(outline).toBeVisible();
    await expect(raw).toBeVisible();
    await expect(pdf).toBeVisible();
    await expect(lenses).toBeVisible();
    await expect(raw).toHaveAttribute('data-ui-tooltip', 'Preview raw Markdown');
    await expect(pdf).toHaveAttribute('data-ui-tooltip', 'Preview PDF');
    const geometry = await page.evaluate(() => [
        document.getElementById('outline-toggle'),
        document.getElementById('raw-text-preview-toggle'),
        document.getElementById('pdf-preview-toggle'),
        document.getElementById('writing-lenses-toggle'),
    ].map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    expect(geometry.map(item => [item.width, item.height])).toEqual([[28, 28], [28, 28], [28, 28], [28, 28]]);
    expect(Math.abs(geometry[0].left - geometry[1].left)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry[1].left - geometry[2].left)).toBeLessThanOrEqual(1);
    expect(geometry[1].top - geometry[0].bottom).toBe(4);
    expect(geometry[2].top - geometry[1].bottom).toBe(4);
    expect(geometry[3].top - geometry[2].bottom).toBe(4);
    expect(Math.abs(geometry[2].left - geometry[3].left)).toBeLessThanOrEqual(1);

    // Real footer geometry must track the editor through pane widths and modes.
    const assertFooterAligned = async () => {
        await expect.poll(() => page.evaluate(() => {
            const footer = document.querySelector('.status-right').getBoundingClientRect();
            const main = document.getElementById('main-content').getBoundingClientRect();
            const pane = document.getElementById('right-sidebar').getBoundingClientRect();
            const right = pane.width ? pane.left : main.right;
            return Math.max(Math.abs(footer.left - main.left), Math.abs(footer.right - right));
        })).toBeLessThanOrEqual(1);
    };
    await assertFooterAligned();

    await raw.click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'raw-text-preview');
    await expect(raw).toHaveAttribute('aria-expanded', 'true');
    await assertFooterAligned();
    await expect(page.locator('.raw-text-preview-source')).toContainText('# Report');
    await raw.click();
    await expect(page.locator('#right-sidebar')).not.toHaveAttribute('data-mode', 'raw-text-preview');

    await pdf.click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'pdf-preview');
    await expect(pdf).toHaveAttribute('aria-expanded', 'true');
    await pdf.click();
    await expect(page.locator('#right-sidebar')).not.toHaveAttribute('data-mode', 'pdf-preview');

    // A width below the former PDF minimum must survive each pane switch.
    await raw.click();
    const splitter = page.locator('#right-sidebar-resizer');
    await splitter.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const sidebar = page.locator('#right-sidebar');
    const expectedWidth = Number(await splitter.getAttribute('aria-valuenow'));
    for (const selected of [outline, pdf, lenses, raw]) {
        await selected.click();
        await expect(selected).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(expectedWidth);
        await assertFooterAligned();
        for (const button of [outline, raw, pdf, lenses]) await expect(button).toBeVisible();
        expect(await selected.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(
            await (selected === raw ? pdf : raw).evaluate(el => getComputedStyle(el).backgroundColor));
    }
    await page.locator('#topbar-settings').click();
    await expect(sidebar).not.toHaveClass(/\bopen\b/);
    await page.locator('#topbar-settings').click();
    await expect(sidebar).toHaveAttribute('data-mode', 'raw-text-preview');
    await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(expectedWidth);
    await raw.click();

    // Browser-only responsive boundary: the expanded navigation pane leaves
    // too little room to dock either preview at an 800px window. Opening must
    // preserve the editor's layout width and keep a usable visible strip.
    await page.setViewportSize({ width: 800, height: 720 });
    const assertResponsivePreview = async () => {
        await expect(page.locator('#right-sidebar')).toHaveClass(/right-sidebar--responsive-overlay/);
        const layout = await page.evaluate(() => {
            const editor = document.getElementById('main-content').getBoundingClientRect();
            const preview = document.getElementById('right-sidebar').getBoundingClientRect();
            return {
                editorWidth: editor.width,
                visibleEditorWidth: preview.left - editor.left,
                previewRight: preview.right,
                launcherRight: document.querySelector('.editor-navigation-launchers')
                    .getBoundingClientRect().right,
                previewLeft: preview.left,
                viewportWidth: window.innerWidth,
                bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
            };
        });
        expect(layout.editorWidth).toBeGreaterThanOrEqual(320);
        expect(layout.visibleEditorWidth).toBeGreaterThanOrEqual(180);
        expect(layout.launcherRight).toBeLessThanOrEqual(layout.previewLeft);
        expect(layout.previewRight).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.bodyOverflow).toBeLessThanOrEqual(0);
        await assertFooterAligned();
        await expect(page.locator('#reading-time')).toBeHidden();
        const cursor = await page.locator('#cursor-position').boundingBox();
        const footer = await page.locator('.status-right').boundingBox();
        expect(cursor.x + cursor.width).toBeLessThanOrEqual(footer.x + footer.width);
    };

    await raw.click();
    await assertResponsivePreview();
    await raw.click();
    await pdf.click();
    await assertResponsivePreview();
    await lenses.click();
    await assertResponsivePreview();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/right-sidebar--responsive-overlay/);
    await expect.poll(() => page.locator('#main-content').evaluate(element => (
        element.getBoundingClientRect().width
    ))).toBeGreaterThanOrEqual(320);
    await lenses.click();
    await assertFooterAligned();
    await page.locator('#status-bar').hover();
    const grip = await page.locator('#resize-grip').boundingBox();
    expect(Math.abs(grip.x + grip.width - page.viewportSize().width)).toBeLessThanOrEqual(2);
});

test('writing lens pickers preserve native focus, Pure pane geometry, and editor cursor placement', async ({ page }, testInfo) => {
    // Browser boundary: portalled pickers must escape clipping, Pure must leave
    // the editor at full width, and actual pointer/key input must retain a caret.
    await openWelcomeEditor(page);
    const source = '# Memo\n\nFirst paragraph. The chairman uses "one" and “**two**”.\n\nBefore we publish the **final report**, we need to review the examples with the team, check every figure against the source material, explain the remaining limitations to our readers, and decide which recommendations should appear in the introduction.';
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        await editor.setEditorContent(markdown);
    }, source);
    await page.locator('#writing-lenses-toggle').click();
    const picker = page.locator('#writing-lenses-panel [role="combobox"]');
    const disclosure = page.locator('#writing-lenses-panel .ui-disclosure-trigger');
    const choices = page.locator('#writing-lenses-panel .ui-disclosure-body');
    // Let the existing pane deployment settle before comparing disclosure-only geometry.
    await disclosure.click({ trial: true });
    const paneBefore = await page.locator('#right-sidebar').boundingBox();
    const editorBefore = await page.locator('.cm-editor').boundingBox();
    await disclosure.click();
    await expect.poll(() => choices.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
    expect((await page.locator('#right-sidebar').boundingBox()).width).toBe(paneBefore.width);
    expect(await page.locator('.cm-editor').boundingBox()).toEqual(editorBefore);
    await disclosure.press('Enter');
    await expect.poll(() => choices.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(50);
    await expect(disclosure).toBeFocused();
    await picker.click();
    const options = page.locator('#writing-lenses-pane-language-menu');
    await expect(options).toBeVisible();
    const menuGeometry = await options.boundingBox();
    expect(menuGeometry.x).toBeGreaterThanOrEqual(0);
    expect(menuGeometry.x + menuGeometry.width).toBeLessThanOrEqual(page.viewportSize().width);
    await options.getByRole('option', { name: 'Spanish', exact: true }).click();
    // Native disabled inputs must still deliver hover to the shared tooltip,
    // including when the pointer moves onto their label in the clipped pane.
    const directLens = page.locator('#writing-lenses-panel input[value="direct"]');
    await directLens.hover();
    const explanation = page.locator('#ui-tooltip');
    await expect(explanation).toBeVisible();
    await expect(explanation).toHaveText('Directness is only available for English (US) and English (UK).');
    await page.locator('#writing-lenses-panel .writing-lenses-layer').filter({ has: page.locator('input[value="direct"]') }).locator('span').first().hover();
    await expect(explanation).toBeVisible();
    const explanationGeometry = await explanation.boundingBox();
    expect(explanationGeometry.x).toBeGreaterThanOrEqual(0);
    expect(explanationGeometry.x + explanationGeometry.width).toBeLessThanOrEqual(page.viewportSize().width);
    await picker.click();
    await options.getByRole('option', { name: 'English (US)', exact: true }).click();
    await expect(picker).toBeFocused();
    // Persistent help escapes the clipped disclosure; Tab resumes its row's
    // native order and neither help clicks nor Escape change the lens selection.
    const info = page.locator('#writing-lenses-panel').getByRole('button', { name: 'About Proofreading', exact: true });
    await info.click();
    const help = page.getByRole('dialog', { name: 'About Proofreading', exact: true });
    await expect(help).toBeVisible();
    await expect(help.getByRole('button', { name: 'Close lens help' })).toBeFocused();
    const helpGeometry = await help.boundingBox();
    expect(helpGeometry.x).toBeGreaterThanOrEqual(8);
    expect(helpGeometry.y).toBeGreaterThanOrEqual(8);
    expect(helpGeometry.x + helpGeometry.width).toBeLessThanOrEqual(page.viewportSize().width - 8);
    expect(helpGeometry.y + helpGeometry.height).toBeLessThanOrEqual(page.viewportSize().height - 8);
    await expect(help).toHaveAttribute('data-placement', 'left');
    await help.locator('.writing-example').first().click();
    await expect(help).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('writing-lens-help.png') });
    await page.keyboard.press('Escape');
    await expect(info).toBeFocused();
    await info.press('Enter');
    await page.keyboard.press('Tab');
    await expect(help).toBeHidden();
    await expect(page.locator('#writing-lenses-panel input[value="clarity"]')).toBeFocused();
    await page.locator('#writing-lenses-panel').getByRole('checkbox', { name: 'Inclusive language', exact: true }).check();
    await page.locator('#writing-lenses-panel').getByRole('checkbox', { name: 'Clarity', exact: true }).check();
    // A sentence-wide underline crosses rendered emphasis and several visual
    // rows; its explanation must stay usable without changing cursor geometry.
    await page.locator('.cm-writing-range').filter({ hasText: 'Before we publish' }).first().hover();
    const review = page.getByRole('dialog', { name: 'Writing suggestions', exact: true });
    await expect(review).toContainText('where the idea changes');
    await expect(review).toContainText('We finished the draft.');
    const reviewGeometry = await review.boundingBox();
    expect(reviewGeometry.y + reviewGeometry.height).toBeLessThanOrEqual(page.viewportSize().height);
    await page.mouse.move(0, 0);
    await expect(review).toBeHidden();
    // Paired quote replacement spans rendered emphasis. Actual hover/button
    // focus and one Undo must preserve the enclosed Markdown exactly.
    await page.locator('#writing-lenses-panel').getByRole('checkbox', { name: 'Proofreading', exact: true }).check();
    await page.locator('.cm-writing-range').filter({ hasText: '“' }).first().hover();
    await expect(review).toContainText('quotation style');
    await review.getByRole('button', { name: /^Replace/ }).click();
    await expect.poll(() => page.evaluate(async () => (await import('/js/editor.js')).getEditorContent())).toBe(source.replace('“**two**”', '"**two**"'));
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(async () => (await import('/js/editor.js')).getEditorContent())).toBe(source);
    await page.mouse.move(0, 0);
    await page.keyboard.press('Control+Shift+B');
    await expect.poll(() => page.locator('#right-sidebar').evaluate(el => el.getBoundingClientRect().width)).toBe(0);
    await page.keyboard.press('Control+Shift+L');
    const quick = page.locator('#writing-lenses-quick');
    await expect(quick).toBeVisible();
    await expect(quick.getByRole('combobox')).toBeFocused();
    await quick.getByRole('button', { name: 'About Directness', exact: true }).click();
    const quickHelp = page.getByRole('dialog', { name: 'About Directness', exact: true });
    await quickHelp.locator('.writing-example').first().click();
    await expect(quick).toBeVisible(); await expect(quickHelp).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(quickHelp).toBeHidden(); await expect(quick).toBeVisible();
    const popupGeometry = await quick.boundingBox();
    expect(popupGeometry.y).toBeGreaterThanOrEqual(0);
    expect(popupGeometry.y + popupGeometry.height).toBeLessThanOrEqual(page.viewportSize().height);
    // Coverage descriptions make the picker scrollable. Native keyboard focus
    // must reveal its last lens without growing the popup beyond the viewport.
    await quick.getByRole('checkbox', { name: 'Inclusive language', exact: true }).focus();
    const inclusiveGeometry = await quick.getByRole('checkbox', { name: 'Inclusive language', exact: true }).boundingBox();
    expect(inclusiveGeometry.y + inclusiveGeometry.height).toBeLessThanOrEqual(popupGeometry.y + popupGeometry.height);
    await page.keyboard.press('Escape');
    await expect(page.locator('#writing-lenses-quick-toggle')).toBeFocused();
    await page.keyboard.press('Control+Shift+B');
    await expect(page.locator('#writing-lenses-panel')).toBeVisible();
    await page.locator('#right-sidebar-close').click();
    await expect.poll(() => page.locator('#right-sidebar').evaluate(el => el.getBoundingClientRect().width)).toBe(0);
    await page.evaluate(async () => {
        const view = (await import('/js/editor.js')).getEditorView();
        await new Promise(resolve => view.requestMeasure({ read() {}, write() { resolve(); } }));
    });
    const positions = await page.evaluate(async () => {
        const { getEditorView } = await import('/js/editor.js');
        const view = getEditorView();
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from }, scrollIntoView: true }); view.focus();
        return { from: view.state.doc.line(3).from, to: view.state.doc.line(5).to };
    });
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(async () => (await import('/js/editor.js')).getEditorView().state.selection.main.head)).toBe(positions.from);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(async () => (await import('/js/editor.js')).getEditorView().state.selection.main.head)).toBe(positions.from);
    const coordinates = await page.evaluate(async range => {
        const view = (await import('/js/editor.js')).getEditorView();
        return { start: view.coordsAtPos(range.from), end: view.coordsAtPos(range.to) };
    }, positions);
    await page.mouse.move(coordinates.start.left + 1, (coordinates.start.top + coordinates.start.bottom) / 2);
    await page.mouse.down();
    await page.mouse.move(coordinates.end.left, (coordinates.end.top + coordinates.end.bottom) / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(async () => (await import('/js/editor.js')).getEditorView().state.selection.main.empty)).toBe(false);
    expect(await page.evaluate(async () => (await import('/js/editor.js')).getEditorContent())).toBe(source);
});

test('shows a nested Markdown outline, follows the active section, and jumps with the keyboard', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        '# Project',
        'A brief introduction.',
        '## Decisions',
        'The record of decisions.',
        '```markdown',
        '# Not a heading',
        '```',
        '### Next steps',
        'Plan the next action.',
    ].join('\n');

    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
        window.__outlineView = view;
    }, source);

    const toggle = page.locator('#outline-toggle');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('inert', '');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).not.toHaveAttribute('title', /.+/);
    await expect(toggle).toHaveAttribute('data-ui-tooltip', 'Show document outline');
    await toggle.hover();
    const tooltip = page.locator('#ui-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Show document outline');
    const tooltipTheme = await tooltip.evaluate(surface => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--panel-bg)';
        document.body.appendChild(probe);
        const result = {
            background: getComputedStyle(surface).backgroundColor,
            panel: getComputedStyle(probe).color,
            radius: Number.parseFloat(getComputedStyle(surface).borderRadius),
        };
        probe.remove();
        return result;
    });
    expect(tooltipTheme.background).toBe(tooltipTheme.panel);
    expect(tooltipTheme.radius).toBeGreaterThanOrEqual(4);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await page.mouse.move(0, 0);
    await toggle.focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setDocumentOutlineEnabled(false);
    });
    await expect(toggle).toBeHidden();
    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setDocumentOutlineEnabled(true);
    });
    await expect(toggle).toBeVisible();
    const launcherGeometry = await toggle.evaluate(element => {
        const button = element.getBoundingClientRect();
        const editor = document.getElementById('editor-container').getBoundingClientRect();
        return { right: editor.right - button.right, top: button.top - editor.top };
    });
    expect(launcherGeometry.right).toBeLessThanOrEqual(12);
    expect(launcherGeometry.top).toBeLessThanOrEqual(12);
    // Real keyboard activation transfers focus from the persistent launcher to the panel.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.outline-item').first()).toBeFocused();

    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'outline');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#right-sidebar')).not.toHaveAttribute('inert', '');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#right-sidebar-title')).toHaveText('Document outline');
    const headings = page.locator('.outline-item');
    await expect(headings).toHaveCount(3);
    await expect(headings.nth(0).locator('.outline-item-type')).toHaveText('h1');
    await expect(headings.nth(0).locator('.outline-item-text')).toHaveText('Project');
    await expect(headings.nth(1).locator('.outline-item-text')).toHaveText('Decisions');
    await expect(headings.nth(2).locator('.outline-item-text')).toHaveText('Next steps');
    await expect(headings.nth(0)).toHaveAttribute('aria-current', 'location');

    const styles = await headings.nth(2).evaluate(element => {
        const style = getComputedStyle(element);
        return {
            radius: Number.parseFloat(style.borderRadius),
            paddingStart: Number.parseFloat(style.paddingInlineStart),
            cursor: style.cursor,
        };
    });
    expect(styles.radius).toBeGreaterThanOrEqual(4);
    expect(styles.paddingStart).toBeGreaterThan(8);
    expect(styles.cursor).toBe('pointer');

    await headings.nth(2).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__outlineView.state.doc.lineAt(
        window.__outlineView.state.selection.main.head,
    ).number)).toBe(8);
    await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
    await expect(headings.nth(2)).toHaveAttribute('aria-current', 'location');

    await page.locator('.cm-content').press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__outlineView.state.doc.lineAt(
        window.__outlineView.state.selection.main.head,
    ).number)).toBe(9);

    await page.evaluate(() => {
        const view = window.__outlineView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
    });
    await expect(headings.nth(1)).toHaveAttribute('aria-current', 'location');

    await page.locator('#right-sidebar-close').focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(headings.nth(1)).toBeFocused();

    await page.evaluate(async () => {
        const history = await import('/js/historyPanel.js');
        const app = (await import('/js/backend.js')).backend();
        app.GetCommitCount = async () => 1;
        app.GetFileHistory = async () => [{ hash: 'version-for-lookup', timestamp: 100, message: 'Saved version' }];
        await history.updateHistoryCount('Welcome.md');
    });
    await expect(page.locator('#history-count')).toHaveClass(/has-history/);
    await page.locator('#status-bar').hover();
    await page.locator('#history-count').click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'history');
    await expect(page.locator('.outline-panel')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeVisible();
    await page.locator('#history-count').click();
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('inert', '');

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('An ordinary note without a heading.');
    });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAttribute(
        'data-ui-tooltip',
        'Document outline unavailable: this note has no headings',
    );
    await expect(toggle).toHaveAttribute(
        'aria-description',
        'Unavailable because this note has no headings.',
    );
    await toggle.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Document outline unavailable: this note has no headings');
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
    await page.mouse.move(0, 0);
    await page.keyboard.press('Escape');
    await page.locator('#sidebar-resizer').focus();
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Document outline unavailable: this note has no headings');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('# Available again');
    });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute('data-ui-tooltip', 'Show document outline');
    await expect(toggle).not.toHaveAttribute('aria-description');
});

test('keeps the left Mermaid control stack aligned when Outline narrows the writing area', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 720 });
    await openWelcomeEditor(page);
    const source = [
        '# Project',
        ...Array.from({ length: 1 }, (_, index) => (
            `Introductory line ${index + 1} ${Array.from({ length: 12 }, (_word, word) => `context${word + 1}`).join(' ')}`
        )),
        '```mermaid',
        'flowchart LR',
        '  Start --> Review --> Finish',
        '```',
        'Closing text.',
    ].join('\n');
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) await new Promise(resolve => setTimeout(resolve, 10));
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    }, source);

    const helper = page.getByRole('button', { name: 'Open Mermaid Editor for this diagram' });
    const diagram = page.locator('.cm-live-diagram');
    await expect(helper).toBeVisible();
    await expect(diagram).toBeVisible();
    const alignment = async () => page.evaluate(() => {
        const helperRect = document.querySelector('.mermaid-editor-guide').getBoundingClientRect();
        const foldRect = document.querySelector('[aria-label="Collapse mermaid code block"]').getBoundingClientRect();
        const diagramRect = document.querySelector('.cm-live-diagram').getBoundingClientRect();
        const widgetRect = document.querySelector('.cm-block-widget--mermaid').getBoundingClientRect();
        return {
            helperTop: helperRect.top,
            diagramTop: diagramRect.top,
            foldGap: helperRect.top - foldRect.bottom,
            horizontalGap: widgetRect.left - helperRect.right,
            widgetOffset: helperRect.top - widgetRect.top,
        };
    });
    const before = await alignment();
    const beforeWidgetOffset = before.widgetOffset;
    expect(before.horizontalGap).toBeGreaterThanOrEqual(0);

    await page.locator('#outline-toggle').click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'outline');
    const transitionLayout = await page.evaluate(async () => {
        const samples = [];
        for (let frame = 0; frame < 30; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const helper = document.querySelector('.mermaid-editor-guide');
            const fold = document.querySelector('[aria-label="Collapse mermaid code block"]');
            const diagram = document.querySelector('.cm-live-diagram');
            const widget = document.querySelector('.cm-block-widget--mermaid');
            if (!helper || !fold || !diagram || !widget) {
                throw new Error('Mermaid controls disappeared during the outline transition');
            }
            const helperRect = helper.getBoundingClientRect();
            const foldRect = fold.getBoundingClientRect();
            const diagramRect = diagram.getBoundingClientRect();
            const widgetRect = widget.getBoundingClientRect();
            samples.push({
                widgetOffset: helperRect.top - widgetRect.top,
                foldGap: helperRect.top - foldRect.bottom,
                horizontalGap: widgetRect.left - helperRect.right,
                overlaps: helperRect.left < diagramRect.right
                    && helperRect.right > diagramRect.left
                    && helperRect.top < diagramRect.bottom
                    && helperRect.bottom > diagramRect.top,
            });
        }
        return samples;
    });
    expect(transitionLayout).toHaveLength(30);
    expect(transitionLayout.every(sample => Math.abs(sample.widgetOffset - beforeWidgetOffset) <= 2)).toBe(true);
    expect(transitionLayout.every(sample => !sample.overlaps)).toBe(true);
    expect(transitionLayout.every(sample => Math.abs(sample.foldGap - before.foldGap) <= 1)).toBe(true);
    const after = await alignment();
    expect(Math.abs(after.widgetOffset - beforeWidgetOffset)).toBeLessThanOrEqual(2);
    expect(after.horizontalGap).toBeGreaterThanOrEqual(0);
    expect(after.helperTop).toBeGreaterThan(after.diagramTop);

    await page.locator('#right-sidebar-close').click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'true');
    const closingLayout = await page.evaluate(async () => {
        const samples = [];
        for (let frame = 0; frame < 30; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const helper = document.querySelector('.mermaid-editor-guide');
            const fold = document.querySelector('[aria-label="Collapse mermaid code block"]');
            const diagram = document.querySelector('.cm-live-diagram');
            const widget = document.querySelector('.cm-block-widget--mermaid');
            if (!helper || !fold || !diagram || !widget) {
                throw new Error('Mermaid controls disappeared while the outline closed');
            }
            const helperRect = helper.getBoundingClientRect();
            const foldRect = fold.getBoundingClientRect();
            const diagramRect = diagram.getBoundingClientRect();
            const widgetRect = widget.getBoundingClientRect();
            samples.push({
                widgetOffset: helperRect.top - widgetRect.top,
                foldGap: helperRect.top - foldRect.bottom,
                horizontalGap: widgetRect.left - helperRect.right,
                overlaps: helperRect.left < diagramRect.right
                    && helperRect.right > diagramRect.left
                    && helperRect.top < diagramRect.bottom
                    && helperRect.bottom > diagramRect.top,
            });
        }
        return samples;
    });
    expect(closingLayout).toHaveLength(30);
    expect(closingLayout.every(sample => Math.abs(sample.widgetOffset - beforeWidgetOffset) <= 2)).toBe(true);
    expect(closingLayout.every(sample => !sample.overlaps)).toBe(true);
    expect(closingLayout.every(sample => Math.abs(sample.foldGap - before.foldGap) <= 1)).toBe(true);
});

test('sticks the complete active heading hierarchy and keeps every row navigable', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        '# Project',
        ...Array.from({ length: 35 }, (_, index) => `Project line ${index + 1}`),
        '## Decisions',
        ...Array.from({ length: 35 }, (_, index) => `Decision line ${index + 1}`),
        '### Next steps',
        ...Array.from({ length: 100 }, (_, index) => `Step line ${index + 1}`),
    ].join('\n');

    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = window.__stickyOutlineView = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) await new Promise(resolve => setTimeout(resolve, 10));
        view.scrollDOM.scrollTop = 0;
        view.scrollDOM.dispatchEvent(new Event('scroll'));
        view.focus();
    }, source);

    const sticky = page.locator('#sticky-heading-stack');
    const rows = sticky.locator('.sticky-heading-item');
    await expect(sticky).toBeHidden();

    const crossStickyBoundary = async (line, offset) => {
        await page.evaluate(({ targetLine, targetOffset }) => {
            const view = window.__stickyOutlineView;
            const stickyElement = document.getElementById('sticky-heading-stack');
            const block = view.lineBlockAt(view.state.doc.line(targetLine).from);
            const editorTop = view.scrollDOM.getBoundingClientRect().top;
            const stackHeight = stickyElement.hidden ? 0 : stickyElement.getBoundingClientRect().height;
            const headingTop = view.documentTop + block.top;
            view.scrollDOM.scrollTop += headingTop - (editorTop + stackHeight) + targetOffset;
            view.scrollDOM.dispatchEvent(new Event('scroll'));
        }, { targetLine: line, targetOffset: offset });
    };

    // Each heading enters as its own source row passes beneath the current
    // sticky stack. The first transition happens while CodeMirror's virtual
    // viewport still begins at zero, proving timing does not depend on its
    // intentionally batched virtualization boundary.
    await crossStickyBoundary(1, -6);
    await expect(sticky).toBeHidden();
    await crossStickyBoundary(1, 2);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project']);
    expect(await page.evaluate(() => window.__stickyOutlineView.viewport.from)).toBe(0);

    await crossStickyBoundary(37, -6);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project']);
    await crossStickyBoundary(37, 2);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project', 'Decisions']);

    await crossStickyBoundary(73, -6);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project', 'Decisions']);
    await crossStickyBoundary(73, 2);
    await expect(sticky).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(rows.locator('.sticky-heading-item-type')).toHaveText(['h1', 'h2', 'h3']);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project', 'Decisions', 'Next steps']);
    const launcher = page.locator('#outline-toggle');
    await expect(launcher).toBeVisible();
    const stickyGeometry = await sticky.evaluate(element => {
        const stickyRect = element.getBoundingClientRect();
        const editorRect = document.getElementById('editor-container').getBoundingClientRect();
        const rowRect = element.firstElementChild.getBoundingClientRect();
        const style = getComputedStyle(element);
        const rowStyle = getComputedStyle(element.firstElementChild);
        const editorStyle = getComputedStyle(document.querySelector('.cm-content'));
        return {
            left: stickyRect.left - editorRect.left,
            right: editorRect.right - stickyRect.right,
            rowLeft: rowRect.left - stickyRect.left,
            rowRight: stickyRect.right - rowRect.right,
            radius: Number.parseFloat(style.borderRadius),
            shadow: style.boxShadow,
            rowFontSize: Number.parseFloat(rowStyle.fontSize),
            editorFontSize: Number.parseFloat(editorStyle.fontSize),
        };
    });
    expect(Math.abs(stickyGeometry.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(stickyGeometry.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(stickyGeometry.rowLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(stickyGeometry.rowRight)).toBeLessThanOrEqual(1);
    expect(stickyGeometry.radius).toBe(0);
    expect(stickyGeometry.shadow).toBe('none');
    expect(Math.abs(stickyGeometry.rowFontSize - stickyGeometry.editorFontSize)).toBeLessThanOrEqual(0.1);
    const navigationGeometry = await page.evaluate(() => {
        const stickyRect = document.getElementById('sticky-heading-stack').getBoundingClientRect();
        const launcherRect = document.getElementById('outline-toggle').getBoundingClientRect();
        return { stickyBottom: stickyRect.bottom, launcherTop: launcherRect.top };
    });
    expect(navigationGeometry.launcherTop).toBeGreaterThanOrEqual(navigationGeometry.stickyBottom + 7);

    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setStickyHeadingsEnabled(false);
    });
    await expect(sticky).toBeHidden();
    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setStickyHeadingsEnabled(true);
    });
    await expect(rows).toHaveCount(3);

    await rows.nth(1).click();
    await expect.poll(() => page.evaluate(() => window.__stickyOutlineView.state.doc.lineAt(
        window.__stickyOutlineView.state.selection.main.head,
    ).text)).toBe('## Decisions');
    await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__stickyOutlineView.state.doc.lineAt(
        window.__stickyOutlineView.state.selection.main.head,
    ).text)).toBe('Decision line 1');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__stickyOutlineView.state.doc.lineAt(
        window.__stickyOutlineView.state.selection.main.head,
    ).text)).toBe('## Decisions');
});

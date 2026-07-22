import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('explains Markdown lint markers on hover and navigates to them with F8', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = '# Overview\n### Skipped level\nAccidental padding   ';
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(text);
        const view = editor.getEditorView();
        await new Promise(resolve => setTimeout(resolve, 80));
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
        window.__markdownLintView = view;
    }, source);

    await expect.poll(() => page.evaluate(async () => {
        const { forEachDiagnostic } = await import('@codemirror/lint');
        const diagnostics = [];
        forEachDiagnostic(window.__markdownLintView.state, diagnostic => diagnostics.push({
            severity: diagnostic.severity,
            message: diagnostic.message,
        }));
        return diagnostics;
    })).toEqual(expect.arrayContaining([
        expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/jumps from level 1 to level 3/i) }),
        expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/remove trailing whitespace/i) }),
    ]));

    const content = page.locator('.cm-content');
    await content.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__markdownLintView.state.doc.lineAt(
        window.__markdownLintView.state.selection.main.head,
    ).number)).toBe(2);
    await content.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__markdownLintView.state.doc.lineAt(
        window.__markdownLintView.state.selection.main.head,
    ).number)).toBe(1);

    const points = await page.evaluate(() => {
        const view = window.__markdownLintView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            heading: point(view.state.doc.line(2).from + 1),
            first: point(view.state.doc.line(1).from),
            last: point(view.state.doc.line(3).to - 1),
        };
    });
    await page.mouse.click(points.heading.x, points.heading.y);
    await expect.poll(() => page.evaluate(() => window.__markdownLintView.state.doc.lineAt(
        window.__markdownLintView.state.selection.main.head,
    ).number)).toBe(2);
    await page.mouse.move(points.first.x, points.first.y);
    await page.mouse.down();
    await page.mouse.move(points.last.x, points.last.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
        const selection = window.__markdownLintView.state.selection.main;
        return {
            from: window.__markdownLintView.state.doc.lineAt(selection.from).number,
            to: window.__markdownLintView.state.doc.lineAt(selection.to).number,
        };
    })).toEqual({ from: 1, to: 3 });

    // Make the source line active before hovering the warning range; passive
    // live preview deliberately hides Markdown markers outside that line.
    await page.evaluate(() => {
        const view = window.__markdownLintView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });
    const warning = page.locator('.cm-lintRange-warning').first();
    await expect(warning).toBeVisible();
    await warning.hover();
    const tooltip = page.locator('.cm-tooltip-lint');
    const tooltipShell = page.locator('.cm-tooltip').filter({ has: tooltip });
    await expect(tooltip).toContainText(/heading jumps from level 1 to level 3/i);
    const tooltipStyle = await tooltipShell.evaluate(element => {
        const style = getComputedStyle(element);
        const diagnostic = element.querySelector('.cm-diagnostic');
        const probe = document.createElement('span');
        probe.style.background = 'var(--panel-bg)';
        document.body.appendChild(probe);
        const panel = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
            background: style.backgroundColor,
            panel,
            radius: Number.parseFloat(style.borderRadius),
            fontSize: style.fontSize,
            diagnosticPaddingLeft: Number.parseFloat(getComputedStyle(diagnostic).paddingLeft),
            editorFontSize: getComputedStyle(document.querySelector('.cm-editor')).fontSize,
        };
    });
    expect(tooltipStyle.background).toBe(tooltipStyle.panel);
    expect(tooltipStyle.background).not.toBe('rgb(255, 255, 255)');
    expect(tooltipStyle.radius).toBeGreaterThanOrEqual(6);
    expect(tooltipStyle.fontSize).toBe(tooltipStyle.editorFontSize);
    expect(tooltipStyle.diagnosticPaddingLeft).toBeGreaterThanOrEqual(10);

    await page.evaluate(() => {
        document.documentElement.style.setProperty('--accent-color', 'rgb(18, 160, 176)');
    });
    const warningDiagnostic = tooltip.locator('.cm-diagnostic-warning');
    await expect(warningDiagnostic).toHaveCSS('border-left-color', 'rgb(18, 160, 176)');
    expect(await warningDiagnostic.evaluate(element => getComputedStyle(element, '::before').backgroundColor))
        .toBe('rgb(18, 160, 176)');

    await page.evaluate(() => {
        const view = window.__markdownLintView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
    });
    await content.press('F8');
    await expect.poll(() => page.evaluate(() => window.__markdownLintView.state.doc.lineAt(
        window.__markdownLintView.state.selection.main.head,
    ).number)).toBe(2);
});

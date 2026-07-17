import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('defaults line numbers off and toggles them without disturbing cursor or mouse selection', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.locator('#topbar-settings').click();

    const lineNumbers = page.locator('#line-numbers-toggle');
    await expect(lineNumbers).not.toBeChecked();
    await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);
    await expect(page.locator('.select-combobox-trigger')).toHaveCount(2);
    expect(await page.locator('#auto-commit-interval').evaluate(
        element => element._figaroCombobox.trigger.textContent,
    )).toContain('1 hour');

    for (const trigger of await page.locator('.select-combobox-trigger').all()) {
        const styles = await trigger.evaluate(element => {
            const computed = getComputedStyle(element);
            return { background: computed.backgroundColor, border: computed.borderStyle, radius: Number.parseFloat(computed.borderRadius) };
        });
        expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(styles.border).toBe('solid');
        expect(styles.radius).toBeGreaterThanOrEqual(6);
    }

    const lineNumberSwitch = page.locator('.settings-section:has(#line-numbers-toggle) .toggle-slider');
    await lineNumberSwitch.click();
    await expect(page.locator('.cm-lineNumbers')).toHaveCount(1);
    await lineNumberSwitch.click();
    await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);

    await page.locator('#auto-commit-interval').evaluate(element => element._figaroCombobox.trigger.click());
    await page.locator('#auto-commit-interval').evaluate(element => element._figaroCombobox.menu.querySelector('[data-value="-1"]').click());
    await expect.poll(() => page.locator('#auto-commit-interval').evaluate(element => element._figaroCombobox.trigger.textContent.trim())).toBe('On Save');

    const fontScale = await page.evaluate(() => ({
        displayed: document.getElementById('font-size-value').textContent,
        pixels: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size-editor')),
    }));
    expect(fontScale).toEqual({ displayed: '100%', pixels: 16.2 });

    await page.locator('.tab[data-tab-id="Welcome.md"]').click();
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const source = 'Alpha line\nBeta line\nGamma line';
        editor.setEditorContent(source);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from + 2 } });
        view.focus();
        window.__lineNumberView = view;
    });
    const editorContent = page.locator('.cm-content');
    await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
    await page.waitForTimeout(100);
    await editorContent.press('ArrowDown');
    expect(await page.evaluate(() => window.__lineNumberView.state.doc.lineAt(window.__lineNumberView.state.selection.main.head).number)).toBe(3);
    await editorContent.press('ArrowUp');
    expect(await page.evaluate(() => window.__lineNumberView.state.doc.lineAt(window.__lineNumberView.state.selection.main.head).number)).toBe(2);

    const points = await page.evaluate(() => {
        const view = window.__lineNumberView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 3, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            first: point(view.state.doc.line(1).from + 1),
            second: point(view.state.doc.line(2).from + 2),
            last: point(view.state.doc.line(3).to - 1),
        };
    });
    await page.mouse.click(points.second.x, points.second.y);
    expect(await page.evaluate(() => window.__lineNumberView.state.doc.lineAt(window.__lineNumberView.state.selection.main.head).number)).toBe(2);
    await page.mouse.move(points.first.x, points.first.y);
    await page.mouse.down();
    await page.mouse.move(points.last.x, points.last.y, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => {
        const selection = window.__lineNumberView.state.selection.main;
        return {
            fromLine: window.__lineNumberView.state.doc.lineAt(selection.from).number,
            toLine: window.__lineNumberView.state.doc.lineAt(selection.to).number,
        };
    })).toEqual({ fromLine: 1, toLine: 3 });
});

test('keeps math and diagram previews cursor-safe during keyboard and mouse selection', async ({ page }) => {
    await openWelcomeEditor(page);
    const fence = '`'.repeat(3);
    const source = [
        'Before',
        '',
        '$E = mc^2$',
        '',
        fence + 'mermaid',
        'flowchart TD',
        '  A --> B',
        fence,
        '',
        'After',
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
        window.__previewGeometryView = view;
    }, source);

    await expect(page.locator('.cm-math-inline')).toHaveCount(1);
    await expect(page.locator('.cm-live-diagram')).toHaveCount(1);
    const content = page.locator('.cm-content');

    for (const { line, key } of [
        { line: 2, key: 'ArrowDown' },
        { line: 4, key: 'ArrowUp' },
    ]) {
        await page.evaluate(currentLine => {
            const view = window.__previewGeometryView;
            view.dispatch({ selection: { anchor: view.state.doc.line(currentLine).from } });
            view.focus();
        }, line);
        await content.press(key);
        expect(await page.evaluate(() => window.__previewGeometryView.state.doc.lineAt(
            window.__previewGeometryView.state.selection.main.head,
        ).number)).toBe(3);
    }

    for (const { line, key } of [
        { line: 4, key: 'ArrowDown' },
        { line: 9, key: 'ArrowUp' },
    ]) {
        await page.evaluate(currentLine => {
            const view = window.__previewGeometryView;
            view.dispatch({ selection: { anchor: view.state.doc.line(currentLine).from } });
            view.focus();
        }, line);
        await content.press(key);
        const landingLine = await page.evaluate(() => window.__previewGeometryView.state.doc.lineAt(
            window.__previewGeometryView.state.selection.main.head,
        ).number);
        expect(landingLine).toBeGreaterThanOrEqual(5);
        expect(landingLine).toBeLessThanOrEqual(8);
    }

    const points = await page.evaluate(() => {
        const view = window.__previewGeometryView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            diagram: point(view.state.doc.line(6).from + 1),
            before: point(view.state.doc.line(1).from + 1),
            after: point(view.state.doc.line(10).to - 1),
            mathFrom: view.state.doc.line(3).from,
            diagramTo: view.state.doc.line(8).to,
        };
    });
    await page.mouse.click(points.diagram.x, points.diagram.y);
    expect(await page.evaluate(() => window.__previewGeometryView.state.doc.lineAt(
        window.__previewGeometryView.state.selection.main.head,
    ).number)).toBeGreaterThanOrEqual(5);

    for (const [start, end] of [[points.before, points.after], [points.after, points.before]]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        const selection = await page.evaluate(() => window.__previewGeometryView.state.selection.main);
        expect(selection.from).toBeLessThanOrEqual(points.mathFrom);
        expect(selection.to).toBeGreaterThanOrEqual(points.diagramTo);
    }
});

test('coalesces rapid editor observer updates without losing the dirty buffer', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const state = await import('/js/state.js');
        const editor = await import('/js/editor.js');
        const view = editor.getEditorView();
        while (editor.getEditorDocumentTabId() !== state.getState('activeTabId')) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const activeTab = state.getState('openTabs').find(tab => tab.id === state.getState('activeTabId'));
        window.__editorObserverEvents = [];
        document.addEventListener('file-content-changed', event => {
            if (event.detail?.path === activeTab.path) window.__editorObserverEvents.push(event.detail.content);
        });

        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
        view.dispatch({ changes: { from: 0, insert: 'one ' } });
        view.dispatch({ changes: { from: view.state.doc.length, insert: 'two ' } });
        view.dispatch({ changes: { from: view.state.doc.length, insert: 'three' } });
        window.__editorObserverTab = activeTab;
    });

    await expect.poll(() => page.evaluate(() => window.__editorObserverEvents)).toEqual(['one two three']);
    await page.waitForTimeout(220);
    expect(await page.evaluate(() => ({
        content: window.__editorObserverTab._content,
        dirty: window.__editorObserverTab.dirty,
        words: document.getElementById('word-count').textContent,
    }))).toEqual({ content: 'one two three', dirty: true, words: '3 words' });
});

test('keeps Quick note available in the collapsed rail and gives Inbox its default Mail icon', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true && window.lucide?.icons?.Star && window.lucide?.icons?.Mail);

    const quickNote = page.locator('#create-inbox-note');
    await expect(quickNote).toContainText('Quick note');
    await quickNote.focus();
    expect(await quickNote.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');

    await page.locator('#toggle-sidebar').click();
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    const railButton = page.locator('#sidebar-quick-note');
    const railGeometry = await railButton.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { display: getComputedStyle(element).display, width: rect.width, height: rect.height };
    });
    expect(railGeometry).toEqual({ display: 'flex', width: 32, height: 32 });
    await railButton.click();
    await expect(page.locator('.tab[data-tab-id="Inbox/Quick-note.md"]')).toBeVisible();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.locator('#toggle-sidebar').click();

    await page.evaluate(async () => {
        const state = await import('/js/state.js');
        const tree = await import('/js/fileTree.js');
        state.setState('fileTreeData', [
            { name: 'Inbox', path: 'Inbox', type: 'directory', children: [] },
            { name: 'active.md', path: 'active.md', type: 'file', mtime: 1 },
            { name: 'background.md', path: 'background.md', type: 'file', mtime: 2 },
            { name: 'closed.md', path: 'closed.md', type: 'file', mtime: 3 },
        ]);
        state.setState('openTabs', [
            { id: 'active.md', type: 'file', path: 'active.md' },
            { id: 'background.md', type: 'file', path: 'background.md' },
        ]);
        state.setState('selectedFilePath', 'active.md');
        tree.renderFileTree();
    });

    await expect(page.locator('[data-path="Inbox"] .default-inbox-icon')).toBeVisible();
    await expect(page.locator('[data-path="active.md"] > .file-tree-node')).toHaveClass(/active-file/);
    await expect(page.locator('[data-path="background.md"] > .file-tree-node')).toHaveClass(/open-file/);
    await expect(page.locator('[data-path="closed.md"] > .file-tree-node')).not.toHaveClass(/open-file|active-file/);

    await page.locator('[data-path="background.md"] > .file-tree-node').click({ button: 'right' });
    await page.locator('[data-action="customize-style"]').click();
    const dialogText = await page.locator('.file-tree-style-modal').textContent();
    expect(dialogText.match(/background\.md/g)).toHaveLength(1);
    await page.locator('.file-tree-style-modal .custom-modal-btn-cancel').click();
});

test('highlights and commits the active file Git status next to Changes', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const history = await import('/js/historyPanel.js');
        const app = (await import('/js/backend.js')).backend();
        window.__gitDirty = true;
        window.__gitCommits = [];
        app.FileHasUncommittedChanges = async () => window.__gitDirty;
        app.CommitCurrentFile = async path => {
            window.__gitCommits.push(path);
            window.__gitDirty = false;
        };
        await history.updateGitStatus('Welcome.md');
    });

    const gitStatus = page.locator('#git-status');
    await expect(gitStatus).toHaveText('Uncommitted');
    await expect(gitStatus).toBeEnabled();
    const highlighted = await gitStatus.evaluate(element => {
        const style = getComputedStyle(element);
        return {
            background: style.backgroundColor,
            border: style.borderStyle,
            cursor: style.cursor,
            beforeChanges: Boolean(element.compareDocumentPosition(document.getElementById('history-count')) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
    });
    expect(highlighted.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(highlighted.border).toBe('solid');
    expect(highlighted.cursor).toBe('pointer');
    expect(highlighted.beforeChanges).toBe(true);
    // Focusing the cheatsheet opens its popup; keyboard users tab through its
    // close button and then reach the adjacent status controls.
    await page.locator('#md-cheatsheet-trigger').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#md-cheatsheet-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(gitStatus).toBeFocused();
    expect(await gitStatus.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');

    await page.keyboard.press('Enter');
    await expect(gitStatus).toHaveText('Git clean');
    await expect(gitStatus).toBeDisabled();
    expect(await page.evaluate(() => window.__gitCommits)).toEqual(['Welcome.md']);
});

test('keeps the editor context menu inside the viewport near its bottom edge', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const { getEditorView } = await import('/js/editor.js');
        const view = getEditorView();
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: window.innerWidth - 3,
            clientY: window.innerHeight - 3,
        }));
    });

    const bounds = await page.locator('.editor-context-menu').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight };
    });
    expect(bounds.right).toBeLessThanOrEqual(bounds.width - 8 + 0.5);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height - 8 + 0.5);
});

test('shows PDF authors the generated HTML plus Figaro classes and IDs', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const { openPDFPreview } = await import('/js/pdfPreview.js');
        await openPDFPreview({ path: 'Welcome.md', title: 'Welcome', content: '# Styled report\n\n> [!note] Body' });
    });
    await expect(page.locator('[data-action="style-reference"]')).toBeVisible();
    await page.locator('[data-action="style-reference"]').click();

    const dialog = page.locator('.pdf-style-reference-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.pdf-style-selector-list')).toContainText('.figaro-print-document');
    await expect(dialog.locator('.pdf-style-selector-list')).toContainText('.figaro-print-callout');
    await expect(dialog.locator('.pdf-style-reference-html')).toContainText('<body');
    await expect(dialog.locator('.pdf-style-reference-html')).toContainText('figaro-print-document');
});

test('restores an old file version only after confirmation and preserves the current one in history', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const history = await import('/js/historyPanel.js');
        const app = (await import('/js/backend.js')).backend();
        editor.setEditorContent('Current unsaved version');
        window.__historySaves = [];
        window.__historyCommits = [];
        let mtime = 2;
        app.GetCommitCount = async () => 2;
        app.GetFileHistory = async () => [
            { hash: 'latest123456', timestamp: 200, message: 'latest' },
            { hash: 'older1234567', timestamp: 100, message: 'older' },
        ];
        app.GetFileVersion = async () => 'Historical version';
        app.SaveFile = async (_path, content) => {
            window.__historySaves.push(content);
            return { success: true, mtime: ++mtime };
        };
        app.CommitCurrentFile = async path => window.__historyCommits.push(path);
        history.updateHistoryCount('Welcome.md');
    });
    await expect(page.locator('#history-count')).toHaveClass(/has-history/);
    await page.locator('#history-count').click();
    await expect(page.locator('.history-item')).toHaveCount(2);
    await page.locator('.history-item').nth(1).click();
    await expect(page.locator('.history-restore-button')).toBeVisible();

    await page.locator('.history-restore-button').click();
    const confirmation = page.locator('.custom-modal');
    await expect(confirmation).toContainText('current version will be saved in Git history');
    await confirmation.locator('.custom-modal-btn-cancel').click();
    expect(await page.evaluate(() => window.__historySaves)).toEqual([]);

    await page.locator('.history-restore-button').click();
    await page.locator('.custom-modal .custom-modal-btn-confirm').click();
    await expect(page.locator('.history-banner')).toHaveCount(0);
    expect(await page.evaluate(() => ({ saves: window.__historySaves, commits: window.__historyCommits }))).toEqual({
        saves: ['Current unsaved version', 'Historical version'],
        commits: ['Welcome.md'],
    });
    await expect(page.locator('.cm-content')).toContainText('Historical version');
});

test('places the complete wikilink syntax immediately after Markdown links in the cheatsheet', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.locator('#md-cheatsheet-trigger').click();
    const rows = await page.locator('#md-cheatsheet-popup tr').allTextContents();
    const markdownIndex = rows.findIndex(row => row.includes('[text](file.md)'));
    const wikiIndex = rows.findIndex(row => row.includes('[[wikilink.md|wikilink]]'));
    expect(wikiIndex).toBe(markdownIndex + 1);
});

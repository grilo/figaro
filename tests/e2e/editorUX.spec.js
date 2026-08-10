import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('preserves the active buffer cursor when Settings opens and closes', async ({ page }) => {
    await openWelcomeEditor(page);
    const expectedCursor = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const source = 'Alpha line\nBeta line\nGamma line';
        editor.setEditorContent(source, 'Welcome.md');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const cursor = view.state.doc.line(2).from + 3;
        view.dispatch({ selection: { anchor: cursor, head: cursor } });
        view.focus();
        return { anchor: cursor, head: cursor };
    });

    await page.locator('#topbar-settings').click();
    await expect(page.locator('.settings-panel-tab')).toBeVisible();
    await page.locator('#topbar-settings').click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    await expect.poll(() => page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const selection = editor.getEditorView().state.selection.main;
        return { anchor: selection.anchor, head: selection.head };
    })).toEqual(expectedCursor);
    await expect.poll(() => page.evaluate(async () => {
        const state = await import('/js/state.js');
        return state.getState('openTabs').find(tab => tab.id === 'Welcome.md').cursorState;
    })).toEqual(expectedCursor);
});

test('folds nested Markdown block guides without breaking cursor or drag-selection geometry', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        '# Product roadmap',
        'Overview',
        '## Goals',
        'Goal body',
        '### Editor details',
        'Nested body',
        '## Release scope',
        'Scope body',
        '# Archive',
        'Archived body',
    ].join('\n');
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        const view = window.__headingFoldView = editor.getEditorView();
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: 0 },
        });
        view.focus();
    }, source);

    const collapseControls = page.locator(
        '.ui-editor-block-guide[aria-expanded="true"][aria-label*="section"]:visible',
    );
    await expect(collapseControls).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Collapse h2 Goals section' })).toHaveCount(1);
    await expect(collapseControls.first()).toHaveAttribute('aria-label', 'Collapse h1 Product roadmap section');
    await collapseControls.nth(1).click();

    const expandControl = page.locator(
        '.ui-editor-block-guide[aria-expanded="false"][aria-label="Expand h2 Goals section"]:visible',
    );
    await expect(expandControl).toHaveCount(1);
    await expect(expandControl).toHaveText('h2');
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    expect(await page.evaluate(() => window.__headingFoldView.state.doc.toString())).toBe(source);

    // A collapsed nested section is one visual row: Arrow Down/Up must move
    // between its heading and the next visible peer without revealing source.
    await page.evaluate(() => {
        const view = window.__headingFoldView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__headingFoldView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(7);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__headingFoldView;
        const head = view.state.selection.main.head;
        return view.state.doc.lineAt(head).number;
    })).toBe(3);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);

    // Mouse placement on the next visible line remains exact, and a drag can
    // cross the folded source in either direction without losing that source.
    const points = await page.evaluate(() => {
        const view = window.__headingFoldView;
        const point = position => {
            const rect = view.coordsAtPos(position);
            return { x: rect.left + 2, y: (rect.top + rect.bottom) / 2 };
        };
        return {
            above: point(view.state.doc.line(2).from + 1),
            below: point(view.state.doc.line(8).to - 1),
            nextHeading: point(view.state.doc.line(7).from + 2),
            hiddenFrom: view.state.doc.line(4).from,
            hiddenTo: view.state.doc.line(6).to,
        };
    });
    await page.mouse.click(points.nextHeading.x, points.nextHeading.y);
    await expect.poll(() => page.evaluate(() => {
        const view = window.__headingFoldView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(7);

    for (const [start, end] of [[points.above, points.below], [points.below, points.above]]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        await expect.poll(() => page.evaluate(({ from, to }) => {
            const selection = window.__headingFoldView.state.selection.main;
            return selection.from <= from && selection.to >= to;
        }, { from: points.hiddenFrom, to: points.hiddenTo })).toBe(true);
        await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    }

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimVisualRows(true);
        const view = window.__headingFoldView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        view.focus();
    });
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__headingFoldView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(7);
    await page.keyboard.press('k');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__headingFoldView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(3);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(false);
    });

    await expandControl.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
    await expect(collapseControls).toHaveCount(5);
    expect(await page.evaluate(() => window.__headingFoldView.state.doc.toString())).toBe(source);
});

test('uses a same-folder note from a rendered missing link and rewrites only its destination', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        const state = await import('/js/state.js');
        const app = (await import('/js/backend.js')).backend();
        const source = 'See [Inner Source](notes/Inner%20Source.md) for the policy.';
        window.__similarLinkDialog = null;
        window.__similarLinkSaved = null;
        window.__similarLinkCreates = [];
        window.confirmDialog = async (...args) => {
            window.__similarLinkDialog = args;
            return 'confirm';
        };
        app.ReadFile = async path => {
            if (path === 'notes/current.md') return { content: source, path, mtime: 1 };
            if (path === 'notes/InnerSource.md') return { content: '# Existing note', path, mtime: 2 };
            return null;
        };
        app.SaveFile = async (path, content) => {
            window.__similarLinkSaved = { path, content };
            return { success: true, path, mtime: 3 };
        };
        app.CreateFile = async (...args) => {
            window.__similarLinkCreates.push(args);
            return { success: true, path: args[0], mtime: 4 };
        };
        state.setState('fileTreeData', [{
            name: 'notes', path: 'notes', type: 'directory', children: [
                { name: 'current.md', path: 'notes/current.md', type: 'file', mtime: 1 },
                { name: 'InnerSource.md', path: 'notes/InnerSource.md', type: 'file', mtime: 2 },
            ],
        }]);
        await editor.initEditor();
        await editor.configureEditorForFile('notes/current.md');
        tabs.openTab('notes/current.md', 'current.md', 'file', { path: 'notes/current.md', mtime: 1 });
        const view = editor.getEditorView();
        while (editor.getEditorDocumentTabId() !== 'notes/current.md' || view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    });

    const widget = page.locator('.cm-link-widget');
    await expect(widget).toBeVisible();
    await expect(widget).toHaveText('Inner Source');
    await widget.click();

    await expect.poll(() => page.evaluate(() => window.__similarLinkDialog?.[0])).toBe('Similar linked note');
    await expect.poll(() => page.evaluate(() => window.__similarLinkSaved)).toEqual({
        path: 'notes/current.md',
        content: 'See [Inner Source](notes/InnerSource.md) for the policy.',
    });
    expect(await page.evaluate(() => window.__similarLinkCreates)).toEqual([]);
    await expect(page.locator('.tab[data-tab-id="notes/InnerSource.md"]')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Existing note');
});

test('keeps unresolved bracket labels ordinary while defined references remain navigable and cursor-safe', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        const state = await import('/js/state.js');
        const app = (await import('/js/backend.js')).backend();
        const source = [
            'Above',
            '',
            '[defined]',
            '',
            '[missing]',
            '',
            'Below',
            '',
            '[defined]: notes/Target.md',
        ].join('\n');
        window.__referenceReads = [];
        app.ReadFile = async path => {
            window.__referenceReads.push(path);
            if (path === 'notes/current.md') return { content: source, path, mtime: 1 };
            if (path === 'notes/Target.md') return { content: '# Target', path, mtime: 2 };
            return null;
        };
        state.setState('fileTreeData', [{
            name: 'notes', path: 'notes', type: 'directory', children: [
                { name: 'current.md', path: 'notes/current.md', type: 'file', mtime: 1 },
                { name: 'Target.md', path: 'notes/Target.md', type: 'file', mtime: 2 },
            ],
        }]);
        await editor.initEditor();
        await editor.configureEditorForFile('notes/current.md');
        tabs.openTab('notes/current.md', 'current.md', 'file', { path: 'notes/current.md', mtime: 1 });
        const view = editor.getEditorView();
        while (editor.getEditorDocumentTabId() !== 'notes/current.md' || view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
        window.__referenceView = view;
    });

    const unresolved = page.locator('.cm-unresolved-reference');
    const resolved = page.locator('.cm-reference-link-widget');
    await expect(unresolved).toHaveText('[missing]');
    await expect(resolved).toHaveText('defined');
    await expect.poll(() => unresolved.evaluate(element => {
        const style = getComputedStyle(element);
        return {
            anchor: element.closest('a') !== null,
            cursor: style.cursor,
            decoration: style.textDecorationLine,
        };
    })).toEqual({ anchor: false, cursor: 'text', decoration: 'none' });

    // Arrow navigation crosses the inline reference widget in both directions.
    await page.evaluate(() => {
        const view = window.__referenceView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__referenceView.state.doc.lineAt(
        window.__referenceView.state.selection.main.head
    ).number)).toBe(3);
    await page.evaluate(() => {
        const view = window.__referenceView;
        view.dispatch({ selection: { anchor: view.state.doc.line(5).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__referenceView.state.doc.lineAt(
        window.__referenceView.state.selection.main.head
    ).number)).toBe(3);

    // Drag selection crosses the replaced source in either direction.
    const points = await page.evaluate(() => {
        const view = window.__referenceView;
        view.dispatch({ selection: { anchor: view.state.doc.line(7).from } });
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            above: point(view.state.doc.line(1).from),
            below: point(view.state.doc.line(5).to),
            referenceFrom: view.state.doc.line(3).from,
            referenceTo: view.state.doc.line(3).to,
        };
    });
    for (const [start, end] of [[points.above, points.below], [points.below, points.above]]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        await expect.poll(() => page.evaluate(({ from, to }) => {
            const selection = window.__referenceView.state.selection.main;
            return selection.from <= from && selection.to >= to;
        }, { from: points.referenceFrom, to: points.referenceTo })).toBe(true);
    }

    await unresolved.click();
    expect(await page.evaluate(() => window.__referenceReads)).not.toContain('missing.md');
    await page.evaluate(() => {
        const view = window.__referenceView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
    });
    await expect(resolved).toBeVisible();
    await resolved.click();
    await expect(page.locator('.tab[data-tab-id="notes/Target.md"]')).toBeVisible();
});

test('creates a same-folder note from link autocomplete by keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        const state = await import('/js/state.js');
        const app = (await import('/js/backend.js')).backend();
        const source = 'Draft ';
        window.__linkedNoteCreates = [];
        app.ReadFile = async path => path === 'notes/current.md' ? { content: source, path, mtime: 1 } : null;
        app.CreateFile = async (path, content) => {
            window.__linkedNoteCreates.push({ path, content });
            return { success: true, path, mtime: 2 };
        };
        app.GetFileTree = async () => [{
            name: 'notes', path: 'notes', type: 'directory', children: [
                { name: 'current.md', path: 'notes/current.md', type: 'file', mtime: 1 },
                { name: 'Brand new.md', path: 'notes/Brand new.md', type: 'file', mtime: 2 },
            ],
        }];
        state.setState('fileTreeData', [{
            name: 'notes', path: 'notes', type: 'directory', children: [
                { name: 'current.md', path: 'notes/current.md', type: 'file', mtime: 1 },
            ],
        }]);
        await editor.initEditor();
        await editor.configureEditorForFile('notes/current.md');
        tabs.openTab('notes/current.md', 'current.md', 'file', { path: 'notes/current.md', mtime: 1 });
        const view = editor.getEditorView();
        while (editor.getEditorDocumentTabId() !== 'notes/current.md' || view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        window.__linkedNoteView = view;
    });

    await page.keyboard.type('[Brand new');
    const completion = page.locator('.cm-tooltip-autocomplete');
    await expect(completion).toBeVisible();
    await expect(completion).toContainText('Create “Brand new”');
    await expect(completion).toContainText('New note · notes/Brand new.md');
    await page.keyboard.press('Enter');

    await expect.poll(() => page.evaluate(() => window.__linkedNoteCreates)).toEqual([
        { path: 'notes/Brand new.md', content: '# Brand new\n\n' },
    ]);
    await expect.poll(() => page.evaluate(() => window.__linkedNoteView.state.doc.toString()))
        .toBe('Draft [Brand new](notes/Brand%20new.md) ');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('notes/current.md');
});

test('offers due-date actions only for an unfinished task hashtag and keeps editor navigation intact', async ({ page }) => {
    await openWelcomeEditor(page);
    const content = page.locator('.cm-content');
    const completionLabels = page.locator('.cm-tooltip-autocomplete .cm-completionLabel');

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const state = await import('/js/state.js');
        state.setState('kanbanCompletionColumns', ['urgent']);
        editor.setEditorContent('A long paragraph ');
        const view = editor.getEditorView();
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
    });
    await page.keyboard.type('#ur');
    await expect(completionLabels).toHaveText(['#urgent']);
    await page.keyboard.press('Escape');

    const source = 'Before\n- [ ] Prepare release \nAfter';
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        const view = window.__taskDueView = editor.getEditorView();
        const taskEnd = markdown.indexOf('\nAfter');
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: taskEnd },
        });
        view.focus();
    }, source);
    await page.keyboard.type('#todo');
    await expect(completionLabels).toHaveText([
        '#todo', 'Add due date…', 'Due today', 'Due tomorrow',
    ]);
    await page.evaluate(() => {
        const view = window.__taskDueView;
        const rect = view.coordsAtPos(view.state.selection.main.head);
        window.__taskDueCursorRect = {
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
        };
    });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    const picker = page.locator('.ui-date-picker[aria-label="Choose due date"]');
    await expect(picker).toBeVisible();
    const placement = await page.evaluate(() => {
        const cursor = window.__taskDueCursorRect;
        const element = document.querySelector('.ui-date-picker');
        const rect = element.getBoundingClientRect();
        const expectedLeft = Math.max(8, Math.min(cursor.left, window.innerWidth - rect.width - 8));
        const below = cursor.bottom + 6;
        const expectedTop = below + rect.height <= window.innerHeight - 8
            ? below
            : Math.max(8, cursor.top - rect.height - 6);
        return {
            leftDelta: Math.abs(rect.left - expectedLeft),
            topDelta: Math.abs(rect.top - expectedTop),
            focusedInside: element.contains(document.activeElement),
        };
    });
    expect(placement.leftDelta).toBeLessThan(2);
    expect(placement.topDelta).toBeLessThan(2);
    expect(placement.focusedInside).toBe(true);

    await picker.getByRole('button', { name: 'Today', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__taskDueView.state.doc.toString()))
        .toMatch(/^Before\n- \[ \] Prepare release #todo \[due \d{4}-\d{2}-\d{2}\]\(\d{4}-\d{2}-\d{2}\.md\)\nAfter$/);
    await content.press('ArrowDown');
    expect(await page.evaluate(() => window.__taskDueView.state.doc.lineAt(
        window.__taskDueView.state.selection.main.head,
    ).number)).toBe(3);
    await content.press('ArrowUp');
    expect(await page.evaluate(() => window.__taskDueView.state.doc.lineAt(
        window.__taskDueView.state.selection.main.head,
    ).number)).toBe(2);

    const drag = await page.evaluate(() => {
        const view = window.__taskDueView;
        const point = position => {
            const rect = view.coordsAtPos(position);
            return { x: rect.left + 2, y: (rect.top + rect.bottom) / 2 };
        };
        return {
            start: point(view.state.doc.line(1).from + 1),
            end: point(view.state.doc.line(3).to - 1),
        };
    });
    await page.mouse.move(drag.start.x, drag.start.y);
    await page.mouse.down();
    await page.mouse.move(drag.end.x, drag.end.y, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => {
        const view = window.__taskDueView;
        return {
            fromLine: view.state.doc.lineAt(view.state.selection.main.from).number,
            toLine: view.state.doc.lineAt(view.state.selection.main.to).number,
        };
    })).toEqual({ fromLine: 1, toLine: 3 });
});

test('defaults line numbers off and toggles them without disturbing cursor or mouse selection', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.locator('#topbar-settings').click();

    const lineNumbers = page.locator('#line-numbers-toggle');
    await expect(lineNumbers).not.toBeChecked();
    await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);
    await expect(page.locator('.select-combobox-trigger')).toHaveCount(2);
    const autoCommit = page.locator('#auto-commit-toggle');
    await expect(autoCommit).toBeChecked();

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

    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        window.__autoCommitToggleWrites = [];
        app.AutoCommitSave = async enabled => window.__autoCommitToggleWrites.push(enabled);
    });
    await autoCommit.focus();
    await page.keyboard.press('Space');
    await expect(autoCommit).not.toBeChecked();
    await expect.poll(() => page.evaluate(() => window.__autoCommitToggleWrites)).toEqual([false]);
    const autoCommitSlider = page.locator('.settings-section:has(#auto-commit-toggle) .toggle-slider');
    const autoCommitStyles = await autoCommitSlider.evaluate(element => {
        const computed = getComputedStyle(element);
        return { cursor: computed.cursor, radius: Number.parseFloat(computed.borderRadius), background: computed.backgroundColor };
    });
    expect(autoCommitStyles.cursor).toBe('pointer');
    expect(autoCommitStyles.radius).toBeGreaterThanOrEqual(20);
    expect(autoCommitStyles.background).not.toBe('rgba(0, 0, 0, 0)');

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

test('clamps cursor and viewport movement at both document boundaries', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = Array.from({ length: 180 }, (_, index) => `Line ${index + 1} with enough text to remain visible.`).join('\n');
    await page.evaluate(async nextSource => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(nextSource, 'Welcome.md');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== nextSource) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({
            selection: { anchor: view.state.doc.length },
            scrollIntoView: true,
        });
        view.focus();
        window.__boundaryView = view;
    }, source);

    const content = page.locator('.cm-content');
    const scroller = page.locator('.cm-scroller');
    await scroller.evaluate(element => {
        element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => scroller.evaluate(element => (
        element.scrollTop >= element.scrollHeight - element.clientHeight - 1
    ))).toBe(true);
    await content.press('ArrowDown');
    await content.press('ArrowDown');
    expect(await page.evaluate(() => window.__boundaryView.state.selection.main.head))
        .toBe(source.length);

    await page.evaluate(() => {
        window.__bottomBoundaryWheelPrevented = false;
        document.addEventListener('wheel', event => {
            window.__bottomBoundaryWheelPrevented = event.defaultPrevented;
        }, { once: true });
    });
    await content.hover();
    await page.mouse.wheel(0, 900);
    const bottom = await scroller.evaluate(element => ({
        top: element.scrollTop,
        max: element.scrollHeight - element.clientHeight,
    }));
    expect(bottom.top).toBeGreaterThanOrEqual(bottom.max - 1);
    expect(await page.evaluate(() => window.__bottomBoundaryWheelPrevented)).toBe(true);

    await page.evaluate(() => {
        const view = window.__boundaryView;
        view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
        view.focus();
    });
    await scroller.evaluate(element => {
        element.scrollTop = 0;
    });
    await expect.poll(() => scroller.evaluate(element => element.scrollTop <= 1)).toBe(true);
    await content.press('ArrowUp');
    await content.press('ArrowUp');
    expect(await page.evaluate(() => window.__boundaryView.state.selection.main.head)).toBe(0);

    await page.evaluate(() => {
        window.__topBoundaryWheelPrevented = false;
        document.addEventListener('wheel', event => {
            window.__topBoundaryWheelPrevented = event.defaultPrevented;
        }, { once: true });
    });
    await content.hover();
    await page.mouse.wheel(0, -900);
    expect(await scroller.evaluate(element => element.scrollTop)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.__topBoundaryWheelPrevented)).toBe(true);
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

test('patches mounted file-tree tab markers without rebuilding folders during dirty and fast tab transitions', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    const result = await page.evaluate(async () => {
        const state = await import('/js/state.js');
        const tree = await import('/js/fileTree.js');
        const tabs = await import('/js/tabManager.js');
        state.setState('fileTreeData', [
            {
                name: 'Projects', path: 'Projects', type: 'directory', children: [
                    { name: 'active.md', path: 'Projects/active.md', type: 'file', mtime: 1 },
                    { name: 'background.md', path: 'Projects/background.md', type: 'file', mtime: 2 },
                ],
            },
            {
                name: 'Archive', path: 'Archive', type: 'directory', children: [
                    { name: 'hidden.md', path: 'Archive/hidden.md', type: 'file', mtime: 3 },
                ],
            },
        ]);
        state.setState('expandedDirs', new Set(['Projects']));
        state.setState('openTabs', [
            { id: 'Projects/active.md', title: 'active.md', type: 'file', path: 'Projects/active.md', dirty: false },
            { id: 'Projects/background.md', title: 'background.md', type: 'file', path: 'Projects/background.md', dirty: false },
        ]);
        state.setState('activeTabId', 'Projects/active.md');
        tree.renderFileTree();

        const active = document.querySelector('[data-path="Projects/active.md"] > .file-tree-node');
        const background = document.querySelector('[data-path="Projects/background.md"] > .file-tree-node');
        tabs.markTabDirty('Projects/active.md');
        const preservedAfterDirty = active === document.querySelector('[data-path="Projects/active.md"] > .file-tree-node') &&
            background === document.querySelector('[data-path="Projects/background.md"] > .file-tree-node');

        state.setState('activeTabId', 'Projects/background.md');
        return {
            preservedAfterDirty,
            preservedAfterSwitch: active === document.querySelector('[data-path="Projects/active.md"] > .file-tree-node') &&
                background === document.querySelector('[data-path="Projects/background.md"] > .file-tree-node'),
            activeClasses: [...active.classList],
            backgroundClasses: [...background.classList],
            hiddenMounted: Boolean(document.querySelector('[data-path="Archive/hidden.md"]')),
        };
    });

    expect(result).toEqual(expect.objectContaining({
        preservedAfterDirty: true,
        preservedAfterSwitch: true,
        hiddenMounted: false,
    }));
    expect(result.activeClasses).toContain('open-file');
    expect(result.activeClasses).not.toContain('active-file');
    expect(result.backgroundClasses).toContain('active-file');
    expect(result.backgroundClasses).not.toContain('open-file');
});

test('keeps local history quiet until the active file needs recording again', async ({ page }) => {
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
    await expect(gitStatus).toHaveText('Save to history');
    await expect(gitStatus).toBeEnabled();
    const highlighted = await gitStatus.evaluate(element => {
        const style = getComputedStyle(element);
        return {
            background: style.backgroundColor,
            bottomBorder: style.borderBottomColor,
            cursor: style.cursor,
            beforeChanges: Boolean(element.compareDocumentPosition(document.getElementById('history-count')) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
    });
    expect(highlighted.background).toBe('rgba(0, 0, 0, 0)');
    expect(highlighted.bottomBorder).not.toBe('rgba(0, 0, 0, 0)');
    expect(highlighted.cursor).toBe('pointer');
    expect(highlighted.beforeChanges).toBe(true);
    // Focusing the cheatsheet opens its popup; keyboard users tab through its
    // close button and then reach the remaining adjacent status control. The
    // outline launcher now lives at the editor's top-left instead.
    await page.locator('#md-cheatsheet-trigger').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#md-cheatsheet-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(gitStatus).toBeFocused();
    expect(await gitStatus.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');

    await page.keyboard.press('Enter');
    await expect(gitStatus).toBeHidden();
    await expect(gitStatus).toBeDisabled();
    expect(await page.evaluate(() => window.__gitCommits)).toEqual(['Welcome.md']);

    await page.locator('.cm-content').press('End');
    await page.locator('.cm-content').press('!');
    await expect(gitStatus).toHaveText('Save to history');
    await expect(gitStatus).toBeEnabled();
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

test('prepares live PDF Markdown in a worker before applying the preview document', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const NativeWorker = window.Worker;
        window.__pdfWorkerRequests = [];
        window.__pdfWorkerErrors = [];
        window.Worker = class FigaroPDFWorkerProbe extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                this.addEventListener('error', event => window.__pdfWorkerErrors.push(event.message || 'worker error'));
            }

            postMessage(message, transfer) {
                window.__pdfWorkerRequests.push({ url: this.url, message });
                return super.postMessage(message, transfer);
            }
        };
        const { openPDFPreview } = await import('/js/pdfPreview.js');
        await openPDFPreview({ path: 'Welcome.md', title: 'Welcome', content: '# Worker preview\n\nA responsive editor stays responsive.' });
    });

    await expect.poll(() => page.evaluate(() => window.__pdfWorkerRequests.length)).toBe(1);
    await expect.poll(() => page.locator('.pdf-preview-status').textContent()).toContain('Live preview up to date');
    expect(await page.evaluate(() => window.__pdfWorkerErrors)).toEqual([]);
});

test('restores an old file version as a fresh latest History commit after confirmation', async ({ page }) => {
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
        window.__historyEntries = [
            { hash: 'latest123456', timestamp: 200, message: 'latest' },
            { hash: 'older1234567', timestamp: 100, message: 'older' },
        ];
        app.GetFileHistory = async () => window.__historyEntries;
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
    await expect(page.locator('.history-revert-button')).toBeVisible();
    await expect(page.locator('.history-banner .history-restore-button')).toHaveCount(0);
    await expect(page.locator('.history-revert-copy')).toHaveCount(0);
    await expect(page.locator('.history-list')).not.toContainText('older123');
    await expect(page.locator('.history-list')).not.toContainText('latest1');

    const compare = page.locator('.history-diff-toggle');
    await expect(compare).toBeVisible();
    await compare.click();
    await expect(page.locator('.history-diff-summary')).toContainText('added');
    await expect(page.locator('.history-diff-line.is-added')).toContainText('Current unsaved version');
    await expect(page.locator('.history-diff-line.is-removed')).toContainText('Historical version');
    const diffStyles = await page.locator('.history-diff').evaluate(element => {
        const style = getComputedStyle(element);
        const action = element.closest('.history-revert-action').getBoundingClientRect();
        const controls = element.closest('.history-revert-action').querySelector('.history-revert-controls').getBoundingClientRect();
        const diff = element.getBoundingClientRect();
        return {
            radius: Number.parseFloat(style.borderRadius),
            background: style.backgroundColor,
            spansActionWidth: diff.width >= action.width - 16,
            clearsControls: diff.top >= controls.bottom + 2,
        };
    });
    expect(diffStyles.radius).toBeGreaterThanOrEqual(4);
    expect(diffStyles.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(diffStyles.spansActionWidth).toBe(true);
    expect(diffStyles.clearsControls).toBe(true);

    await page.locator('.history-revert-button').click();
    const confirmation = page.locator('.custom-modal');
    await expect(confirmation).toContainText('current version will be saved in Git history');
    await confirmation.locator('.custom-modal-btn-cancel').click();
    expect(await page.evaluate(() => window.__historySaves)).toEqual([]);

    await page.evaluate(() => {
        window.__historyEntries = [
            { hash: 'restored123456', timestamp: 300, message: 'restored' },
            ...window.__historyEntries,
        ];
    });
    await page.locator('.history-revert-button').click();
    await page.locator('.custom-modal .custom-modal-btn-confirm').click();
    await expect(page.locator('.history-banner')).toHaveCount(0);
    await expect(page.locator('.history-current-notice')).toContainText('Restored the selected version as the latest committed version');
    await expect(page.locator('.history-item')).toHaveCount(3);
    await expect(page.locator('.history-item-latest')).toContainText('Latest committed');
    expect(await page.evaluate(() => ({ saves: window.__historySaves, commits: window.__historyCommits }))).toEqual({
        saves: ['Current unsaved version', 'Historical version'],
        commits: ['Welcome.md', 'Welcome.md'],
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

import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('gives the main editor a document-specific accessible name', async ({ page }) => {
    await openWelcomeEditor(page);

    await expect(page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node'))
        .toHaveClass(/selected/);
    await expect(page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node'))
        .toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#editor-container > .cm-editor .cm-content'))
        .toHaveAttribute('aria-label', 'Markdown editor — Welcome.md');
    await expect(page).toHaveTitle('Welcome.md — Figaro');
});

test('toggles three-topic Figaro help with F1 and restores editor focus', async ({ page }) => {
    await openWelcomeEditor(page);
    const editor = page.locator('.cm-content');
    const popup = page.locator('#md-cheatsheet-popup');
    await editor.focus();

    await page.keyboard.press('F1');
    await expect(popup).toBeVisible();
    await expect(page.locator('#md-help-search')).toBeFocused();
    await popup.evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
    });
    const openGeometry = await popup.boundingBox();
    await page.locator('#md-help-shortcuts-tab').click();
    await expect(page.locator('#md-help-shortcuts-panel')).toBeVisible();
    await expect(page.locator('#md-help-shortcuts-panel')).toContainText('Focus global search');
    expect(await popup.boundingBox()).toEqual(openGeometry);
    await page.keyboard.press('F1');
    await expect(popup).toBeHidden();
    await expect(editor).toBeFocused();

    await page.keyboard.press('F1');
    await expect(page.locator('#md-help-search')).toBeFocused();
    await expect(page.locator('#md-help-shortcuts-tab')).toHaveAttribute('aria-selected', 'true');
    await popup.evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
    });
    const reopenedGeometry = await popup.boundingBox();
    expect(reopenedGeometry.width).toBeCloseTo(openGeometry.width, 1);
    expect(reopenedGeometry.height).toBeCloseTo(openGeometry.height, 1);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(editor).toBeFocused();
});

test('keeps Find and Replace on three compact, non-overlapping bands', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.locator('.cm-content').press('Control+f');

    const panel = page.locator('.cm-panel.cm-search');
    await expect(panel).toBeVisible();
    const geometry = await panel.evaluate(element => {
        const box = selector => {
            const rect = element.querySelector(selector).getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        };
        const rect = element.getBoundingClientRect();
        return {
            display: getComputedStyle(element).display,
            height: rect.height,
            search: box('input[name="search"]'),
            previous: box('button[name="prev"]'),
            next: box('button[name="next"]'),
            all: box('button[name="select"]'),
            caseOption: box('label:has(input[name="case"])'),
            regexpOption: box('label:has(input[name="re"])'),
            wordOption: box('label:has(input[name="word"])'),
            replace: box('input[name="replace"]'),
            replaceOne: box('button[name="replace"]'),
            replaceAll: box('button[name="replaceAll"]'),
        };
    });

    expect(geometry.display).toBe('grid');
    expect(geometry.height).toBeGreaterThanOrEqual(102);
    expect(geometry.height).toBeLessThanOrEqual(108);
    for (const control of [geometry.previous, geometry.next, geometry.all]) {
        expect(Math.abs(control.top - geometry.search.top)).toBeLessThanOrEqual(1);
    }
    for (const control of [geometry.regexpOption, geometry.wordOption]) {
        expect(Math.abs(control.top - geometry.caseOption.top)).toBeLessThanOrEqual(1);
    }
    for (const control of [geometry.replaceOne, geometry.replaceAll]) {
        expect(Math.abs(control.top - geometry.replace.top)).toBeLessThanOrEqual(1);
    }
    expect(geometry.search.bottom).toBeLessThanOrEqual(geometry.caseOption.top);
    expect(geometry.caseOption.bottom).toBeLessThanOrEqual(geometry.replace.top);

    await page.locator('input[name="search"]').fill('Welcome');
    await page.locator('input[name="replace"]').fill('WELCOME');
    await page.locator('button[name="replaceAll"]').click();
    await expect.poll(() => page.evaluate(async () => (
        (await import('/js/editor.js')).getEditorContent()
    ))).toContain('# WELCOME');
});

test('routes real Find, global search, and Quick Note key events to distinct application actions', async ({ page }) => {
    await openWelcomeEditor(page);
    const editor = page.locator('.cm-content');
    const globalSearch = page.locator('#global-search-input');

    await editor.focus();
    await page.keyboard.press('Control+Shift+F');
    await expect(globalSearch).toBeFocused();
    await expect(page.locator('.cm-panel.cm-search')).toHaveCount(0);

    await editor.focus();
    await page.keyboard.press('Control+F');
    await expect(page.locator('.cm-panel.cm-search')).toBeVisible();
    await expect(globalSearch).not.toBeFocused();
    await page.keyboard.press('Escape');

    await editor.focus();
    await page.keyboard.press('Control+N');
    await expect(page.locator('.tab[data-tab-id="Inbox/Quick-note.md"]')).toBeVisible();
    await expect(page.locator('.cm-content')).toBeFocused();
});

test('keeps Ctrl+wheel text scale on the open buffer and resets it to the Settings default', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.locator('#topbar-settings').click();
    await page.locator('#font-size-up').click();
    await expect(page.locator('#font-size-value')).toHaveText('110%');
    await page.locator('.tab[data-tab-id="Welcome.md"]').click();
    await expect(page.locator('#editor-scale-status')).toHaveText('Scale 110%');

    const anchor = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const lines = Array.from({ length: 90 }, (_, index) => `Line ${index + 1} has enough text to exercise editor reflow.`);
        const source = lines.join('\n');
        editor.setEditorContent(source, 'Welcome.md');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const position = view.state.doc.line(45).from + 6;
        view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
        view.focus();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rectangle = view.coordsAtPos(position);
        const event = new WheelEvent('wheel', {
            deltaY: -100,
            ctrlKey: true,
            clientX: rectangle.left + 2,
            clientY: (rectangle.top + rectangle.bottom) / 2,
            bubbles: true,
            cancelable: true,
        });
        view.contentDOM.dispatchEvent(event);
        window.__textScaleView = view;
        window.__textScaleAnchor = position;
        return { prevented: event.defaultPrevented, top: rectangle.top };
    });
    expect(anchor.prevented).toBe(true);
    await expect(page.locator('#editor-scale-status')).toHaveText('Scale 120%');
    await expect.poll(() => page.evaluate(() => Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--font-size-editor'),
    ))).toBe(19.44);
    await expect.poll(() => page.evaluate(() => (
        window.__textScaleView.coordsAtPos(window.__textScaleAnchor).top
    ))).toBeCloseTo(anchor.top, 0);

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__textScaleView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(46);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__textScaleView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(45);

    const mousePoint = await page.evaluate(() => {
        const view = window.__textScaleView;
        const rectangle = view.coordsAtPos(view.state.doc.line(43).from + 4);
        return { x: rectangle.left + 2, y: (rectangle.top + rectangle.bottom) / 2 };
    });
    await page.mouse.click(mousePoint.x, mousePoint.y);
    await expect.poll(() => page.evaluate(() => {
        const view = window.__textScaleView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(43);

    const dragPoints = await page.evaluate(() => {
        const view = window.__textScaleView;
        const point = position => {
            const rectangle = view.coordsAtPos(position);
            return { x: rectangle.left + 2, y: (rectangle.top + rectangle.bottom) / 2 };
        };
        return {
            first: point(view.state.doc.line(40).from + 2),
            last: point(view.state.doc.line(44).to - 2),
        };
    });
    for (const [start, end] of [
        [dragPoints.first, dragPoints.last],
        [dragPoints.last, dragPoints.first],
    ]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        expect(await page.evaluate(() => {
            const view = window.__textScaleView;
            const selection = view.state.selection.main;
            return {
                from: view.state.doc.lineAt(selection.from).number,
                to: view.state.doc.lineAt(selection.to).number,
            };
        })).toEqual({ from: 40, to: 44 });
    }

    await page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        tabs.openTab('Scale-other.md', 'Scale other', 'file', {
            path: 'Scale-other.md',
            isNew: true,
        });
    });
    await expect(page.locator('#editor-scale-status')).toHaveText('Scale 110%');
    await page.locator('.tab[data-tab-id="Welcome.md"]').click();
    await expect(page.locator('#editor-scale-status')).toHaveText('Scale 120%');

    await page.locator('#status-bar').hover();
    await page.locator('#editor-scale-status').click();
    await expect(page.locator('#editor-scale-status')).toHaveText('Scale 110%');
    await expect.poll(() => page.evaluate(() => Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--font-size-editor'),
    ))).toBe(17.82);
    await expect(page.locator('.cm-content')).toBeFocused();
});

test('creates a missing footnote after its paragraph and navigates back from the definition', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        'some text with a[^reference] and then',
        'some more text',
        '',
        'unrelated text here',
    ].join('\n');
    const expected = [
        'some text with a[^reference] and then',
        'some more text',
        '',
        '[^reference]: ',
        '',
        'unrelated text here',
    ].join('\n');
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        const { Transaction } = await import('/vendored/codemirror/state/index.js');
        const view = window.__footnoteNavigationView = editor.getEditorView();
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: markdown.length },
            annotations: Transaction.addToHistory.of(false),
        });
        view.focus();
    }, source);

    const footnotes = page.locator('.cm-footnote');
    await expect(footnotes).toHaveCount(1);
    await footnotes.first().click();
    await expect.poll(() => page.evaluate(() => ({
        source: window.__footnoteNavigationView.state.doc.toString(),
        cursor: window.__footnoteNavigationView.state.selection.main.anchor,
        focused: window.__footnoteNavigationView.hasFocus,
    }))).toEqual({
        source: expected,
        cursor: expected.indexOf('[^reference]: ') + '[^reference]: '.length,
        focused: true,
    });

    await expect(footnotes).toHaveCount(2);
    await footnotes.nth(1).click();
    await expect.poll(() => page.evaluate(() => (
        window.__footnoteNavigationView.state.selection.main.anchor
    ))).toBe(source.indexOf('[^reference]'));

    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => (
        window.__footnoteNavigationView.state.doc.toString()
    ))).toBe(source);
});

test('opens file, tab, and editor context menus from the keyboard', async ({ page }) => {
    await openWelcomeEditor(page);

    const treeItem = page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node');
    await treeItem.focus();
    await page.keyboard.press('Shift+F10');
    let menu = page.locator('.context-menu');
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(menu).toHaveAttribute('aria-label', 'File actions for Welcome.md');
    await expect(page.locator(':focus')).toHaveAttribute('data-action', 'open-new-tab');
    await page.keyboard.press('End');
    await expect(page.locator(':focus')).toHaveAttribute('data-action', 'delete');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(treeItem).toBeFocused();

    const tab = page.locator('.tab[data-tab-id="Welcome.md"]');
    await tab.focus();
    await page.keyboard.press('Shift+F10');
    menu = page.locator('.tab-context-menu');
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(page.locator(':focus')).toHaveAttribute('data-action', 'toggle-pin');
    await page.keyboard.press('Escape');
    await expect(tab).toBeFocused();

    const editor = page.locator('.cm-content');
    await editor.focus();
    await page.keyboard.press('Shift+F10');
    menu = page.locator('.editor-context-menu');
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(page.locator(':focus')).toHaveAttribute('data-action', 'paste');
    await page.keyboard.press('Escape');
    await expect(editor).toBeFocused();
});

test('turns a pasted URL into a Markdown link for regular and Vim Visual paste paths', async ({ page }) => {
    await openWelcomeEditor(page);
    const pasteURL = async () => page.evaluate(() => {
        const view = window.__figaroSmartPasteView;
        const clipboard = new DataTransfer();
        clipboard.setData('text/plain', 'https://example.com/reference');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboard,
        });
        view.contentDOM.dispatchEvent(event);
        return { prevented: event.defaultPrevented, source: view.state.doc.toString() };
    });

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('Selected words');
        const view = editor.getEditorView();
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
        window.__figaroSmartPasteView = view;
    });
    expect(await pasteURL()).toEqual({
        prevented: true,
        source: '[Selected words](https://example.com/reference)',
    });

    const visualMode = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const view = editor.getEditorView();
        editor.setEditorContent('Selected words');
        await editor.toggleVim(true);
        view.dispatch({ selection: { anchor: 0 } });
        Vim.handleKey(getCM(view), 'v', 'user');
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
        return Boolean(getCM(view).state.vim?.visualMode);
    });
    expect(visualMode).toBe(true);
    expect(await pasteURL()).toEqual({
        prevented: true,
        source: '[Selected words](https://example.com/reference)',
    });

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const view = editor.getEditorView();
        editor.setEditorContent('Selected words');
        await editor.toggleVim(false);
        await editor.toggleVim(true);
        view.dispatch({ selection: { anchor: 0 } });
        Vim.handleKey(getCM(view), 'v', 'user');
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                readText: async () => 'https://example.com/reference',
            },
        });
    });
    await page.keyboard.press('p');
    await expect.poll(() => page.evaluate(() => window.__figaroSmartPasteView.state.doc.toString()))
        .toBe('[Selected words](https://example.com/reference)');

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const view = editor.getEditorView();
        editor.setEditorContent('Selected words');
        await editor.toggleVim(false);
        await editor.toggleVim(true);
        view.dispatch({ selection: { anchor: 0 } });
        Vim.handleKey(getCM(view), 'v', 'user');
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                read: async () => [{
                    types: ['text/plain'],
                    getType: async () => new Blob(['https://example.com/reference'], { type: 'text/plain' }),
                }],
                readText: async () => 'https://example.com/reference',
            },
        });
        const rectangle = view.coordsAtPos(0);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rectangle.left + 2,
            clientY: (rectangle.top + rectangle.bottom) / 2,
        }));
    });
    await page.locator('.editor-context-menu [data-action="paste"]').click();
    await expect.poll(() => page.evaluate(() => window.__figaroSmartPasteView.state.doc.toString()))
        .toBe('[Selected words](https://example.com/reference)');
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(false);
    });
});

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
    await expect(page.locator('.settings-view-title')).toBeFocused();
    await expect(page.locator('.settings-card > h2.settings-card-title')).toHaveCount(7);

    const codeFont = page.locator('#code-font-picker-btn');
    await codeFont.focus();
    await page.keyboard.press('ArrowDown');
    await expect(codeFont).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#code-font-picker-menu')).toHaveAttribute('role', 'listbox');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#code-font-current-name')).toHaveText('JetBrains Mono');
    await expect(codeFont).toHaveAttribute('aria-expanded', 'false');
    await codeFont.press('ArrowDown');
    await codeFont.press('Tab');
    await expect(codeFont).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#pure-typewriter-toggle')).toBeFocused();

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

test('lets Pure editing fill the window with only word count and no outline', async ({ page }) => {
    await openWelcomeEditor(page);

    await page.evaluate(async () => {
        const state = await import('/js/state.js');
        state.setState('showEditorBreadcrumbs', true);
    });
    await expect(page.locator('#editor-breadcrumb')).toBeVisible();
    await page.locator('#outline-toggle').click();
    await expect(page.locator('#right-sidebar')).toHaveClass(/open/);
    const preservedPaneMode = await page.locator('#right-sidebar').getAttribute('data-mode');

    await page.locator('#toggle-sidebar').click();
    await expect(page.locator('#toggle-sidebar')).toBeFocused();
    await expect(page.locator('#app')).toHaveClass(/pure-editing-chrome/);
    await expect.poll(() => page.locator('.top-bar-center').evaluate(element => (
        Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBe(0);
    await expect(page.locator('#outline-toggle')).toBeHidden();
    await expect(page.locator('#editor-breadcrumb')).toBeHidden();
    await expect(page.locator('#right-sidebar')).toHaveClass(/open/);
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-pure-suppressed', 'true');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('#right-sidebar').evaluate(element => ({
        width: element.getBoundingClientRect().width,
        inert: element.inert,
        mode: element.dataset.mode,
    }))).toEqual({ width: 0, inert: true, mode: preservedPaneMode });

    await page.locator('#sticky-heading-stack').evaluate(element => {
        element.hidden = false;
        const item = document.createElement('button');
        item.className = 'sticky-heading-item';
        item.textContent = 'Synthetic visible hierarchy';
        element.replaceChildren(item);
    });
    await expect(page.locator('#sticky-heading-stack')).toBeHidden();

    const readPureFooter = () => page.locator('#status-bar').evaluate(element => {
        const visibleBufferIds = [...element.querySelectorAll('.status-buffer-right > [id]')]
            .filter(child => getComputedStyle(child).display !== 'none')
            .map(child => child.id);
        const word = document.getElementById('word-count');
        const wordBounds = word.getBoundingClientRect();
        const appBounds = document.getElementById('app').getBoundingClientRect();
        const left = document.querySelector('.status-left');
        const leftStyle = getComputedStyle(left);
        return {
            background: getComputedStyle(element).backgroundColor,
            pointerEvents: getComputedStyle(element).pointerEvents,
            applicationStatusClipped: leftStyle.clipPath === 'inset(50%)'
                && leftStyle.overflow === 'hidden'
                && left.getBoundingClientRect().width <= 8,
            actionDisplay: getComputedStyle(document.getElementById('status-action')).display,
            bufferLeftDisplay: getComputedStyle(document.querySelector('.status-buffer-left')).display,
            visibleBufferIds,
            wordOpacity: getComputedStyle(word).opacity,
            wordText: word.textContent,
            wordRightInset: Math.round(appBounds.right - wordBounds.right),
            wordBottomAligned: appBounds.bottom - wordBounds.bottom >= 0
                && appBounds.bottom - wordBounds.bottom <= 8,
        };
    });
    const expectedPureFooter = {
        background: 'rgba(0, 0, 0, 0)',
        pointerEvents: 'none',
        applicationStatusClipped: true,
        actionDisplay: 'none',
        bufferLeftDisplay: 'none',
        visibleBufferIds: ['word-count'],
        wordOpacity: '0.62',
        wordText: '4 words',
        wordRightInset: 16,
        wordBottomAligned: true,
    };
    await expect.poll(readPureFooter).toEqual(expectedPureFooter);

    await page.locator('.cm-content').focus();
    const resting = await page.evaluate(() => {
        const bounds = selector => document.querySelector(selector).getBoundingClientRect();
        const app = bounds('#app');
        const main = bounds('.main-container');
        const editor = bounds('#editor-container');
        const status = bounds('#status-bar');
        const top = bounds('.top-bar');
        const topStyle = getComputedStyle(document.querySelector('.top-bar'));
        return {
            app: { top: app.top, bottom: app.bottom, width: app.width },
            main: { top: main.top, bottom: main.bottom },
            editor: { top: editor.top, bottom: editor.bottom, height: editor.height },
            statusTop: status.top,
            top: { top: top.top, bottom: top.bottom, height: top.height },
            topPosition: topStyle.position,
            topBackground: topStyle.backgroundImage,
            topDrag: topStyle.getPropertyValue('--wails-draggable').trim(),
        };
    });
    expect(resting.topPosition).toBe('absolute');
    expect(resting.top.height).toBe(28);
    expect(resting.topBackground).toBe('none');
    expect(resting.topDrag).toBe('drag');
    expect(Math.abs(resting.main.top - resting.app.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(resting.main.bottom - resting.app.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(resting.statusTop - (resting.app.bottom - 24))).toBeLessThanOrEqual(1);

    const pointerTargets = await page.evaluate(() => {
        const scroller = document.querySelector('#editor-container .cm-scroller').getBoundingClientRect();
        const content = document.querySelector('#editor-container .cm-content').getBoundingClientRect();
        return {
            left: [(scroller.left + content.left) / 2, content.top + 120],
            right: [(content.right + scroller.right) / 2, content.top + 120],
            bottom: [content.left + content.width / 2, document.getElementById('app').getBoundingClientRect().bottom - 1],
        };
    });
    for (const [x, y] of Object.values(pointerTargets)) {
        await page.mouse.move(x, y);
        await expect.poll(readPureFooter).toEqual(expectedPureFooter);
    }

    await page.evaluate(async () => {
        const { statusBar } = await import('/js/statusBar.js');
        statusBar.setWithAction('Deleted “Draft.md” ·', 'Undo', () => {});
    });
    await expect.poll(readPureFooter).toEqual(expectedPureFooter);
    await page.evaluate(async () => {
        const { statusBar } = await import('/js/statusBar.js');
        statusBar.clear();
    });

    await page.mouse.move(resting.app.width / 2, resting.top.bottom + 1);
    await expect.poll(() => page.locator('.top-bar-center').evaluate(element => (
        Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBe(0);
    await page.mouse.move(resting.app.width / 2, resting.top.bottom - 1);
    await expect.poll(() => page.locator('.top-bar-center').evaluate(element => (
        Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBe(1);
    await expect(page.locator('#outline-toggle')).toBeHidden();
    const topReveal = await page.evaluate(() => {
        const editor = document.querySelector('#editor-container').getBoundingClientRect();
        return {
            editor: { top: editor.top, bottom: editor.bottom, height: editor.height },
            height: document.querySelector('.top-bar').getBoundingClientRect().height,
            background: getComputedStyle(document.querySelector('.top-bar')).backgroundImage,
        };
    });
    expect(topReveal.height).toBe(44);
    expect(topReveal.background).toContain('linear-gradient');
    expect(topReveal.editor).toEqual(resting.editor);

    await page.locator('#topbar-settings').focus();
    await expect.poll(() => page.locator('.top-bar-right').evaluate(element => (
        Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBe(1);
    await expect(page.locator('#outline-toggle')).toBeHidden();

    const pureSource = '# Pure writing\n\n' + Array.from({ length: 36 }, (_, index) => (
        `Paragraph ${index + 1} has enough text to exercise the calm writing viewport.`
    )).join('\n\n');
    await page.evaluate(async source => {
        const editor = await import('/js/editor.js');
        const state = await import('/js/state.js');
        state.setState('pureFocusScope', 'paragraph');
        state.setState('pureAdaptiveTypographyEnabled', true);
        editor.setEditorContent(source, 'Welcome.md');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== source) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const cursor = view.state.doc.line(41).from + 12;
        view.dispatch({ selection: { anchor: cursor }, scrollIntoView: true });
        view.focus();
        window.__pureWritingView = view;
    }, pureSource);
    await expect.poll(() => page.locator('.cm-editor').getAttribute('data-pure-typography-tier'))
        .toBe('spacious');
    await expect.poll(() => page.locator('.cm-pure-focus-dimmed').first().evaluate(element => (
        Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBeLessThan(0.5);

    const focusPresentation = await page.evaluate(() => {
        const view = window.__pureWritingView;
        const active = view.domAtPos(view.state.selection.main.head).node.parentElement?.closest('.cm-line')
            || view.domAtPos(view.state.selection.main.head).node.closest?.('.cm-line');
        const dimmed = view.contentDOM.querySelector('.cm-pure-focus-dimmed');
        const root = getComputedStyle(document.documentElement);
        return {
            dimmedOpacity: dimmed ? Number.parseFloat(getComputedStyle(dimmed).opacity) : 1,
            activeOpacity: active ? Number.parseFloat(getComputedStyle(active).opacity) : 1,
            fontSize: Number.parseFloat(getComputedStyle(view.dom).fontSize),
            baseFontSize: Number.parseFloat(root.getPropertyValue('--font-size-editor')),
            maxWidth: Number.parseFloat(getComputedStyle(view.contentDOM).maxWidth),
        };
    });
    expect(focusPresentation.dimmedOpacity).toBeLessThan(0.5);
    expect(focusPresentation.activeOpacity).toBe(1);
    expect(focusPresentation.fontSize).toBeGreaterThan(focusPresentation.baseFontSize * 1.05);
    expect(focusPresentation.maxWidth).toBeGreaterThan(700);

    const purePointerGeometry = await page.evaluate(() => {
        const view = window.__pureWritingView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 8, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            from: point(view.state.doc.line(39).from),
            to: point(view.state.doc.line(41).to),
            line41From: view.state.doc.line(41).from,
        };
    });
    await page.mouse.click(purePointerGeometry.to.x, purePointerGeometry.to.y);
    await expect.poll(() => page.evaluate(() => {
        const view = window.__pureWritingView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(41);
    await page.locator('.cm-content').press('ArrowDown');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__pureWritingView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(42);
    await page.locator('.cm-content').press('ArrowUp');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__pureWritingView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(41);

    await page.mouse.move(purePointerGeometry.from.x, purePointerGeometry.from.y);
    await page.mouse.down();
    await page.mouse.move(purePointerGeometry.to.x, purePointerGeometry.to.y, { steps: 8 });
    await page.mouse.up();
    const draggedSelection = await page.evaluate(() => window.__pureWritingView.state.selection.main);
    expect(draggedSelection.from).toBeLessThan(purePointerGeometry.line41From);
    expect(draggedSelection.to).toBeGreaterThan(purePointerGeometry.line41From);
    await expect(page.locator('.cm-pure-focus-dimmed')).toHaveCount(0);

    const typewriterStart = await page.evaluate(async () => {
        const view = window.__pureWritingView;
        const cursor = view.state.doc.line(41).from + 12;
        view.dispatch({ selection: { anchor: cursor }, scrollIntoView: true });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const scroller = view.scrollDOM;
        const bounds = scroller.getBoundingClientRect();
        const caret = view.coordsAtPos(cursor);
        scroller.scrollTop += caret.top - bounds.top - bounds.height * 0.72;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const positionedCaret = view.coordsAtPos(cursor);
        window.__pureScrollSamples = [scroller.scrollTop];
        scroller.addEventListener('scroll', () => {
            window.__pureScrollSamples.push(scroller.scrollTop);
        });
        view.focus();
        return {
            ratio: (positionedCaret.top - bounds.top) / bounds.height,
            top: scroller.scrollTop,
        };
    });
    expect(typewriterStart.ratio).toBeGreaterThan(0.62);
    await page.keyboard.type('x');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__pureWritingView;
        const bounds = view.scrollDOM.getBoundingClientRect();
        const caret = view.coordsAtPos(view.state.selection.main.head);
        return (caret.top - bounds.top) / bounds.height;
    })).toBeGreaterThanOrEqual(0.40);
    await expect.poll(() => page.evaluate(() => {
        const view = window.__pureWritingView;
        const bounds = view.scrollDOM.getBoundingClientRect();
        const caret = view.coordsAtPos(view.state.selection.main.head);
        return (caret.top - bounds.top) / bounds.height;
    })).toBeLessThanOrEqual(0.44);
    const typewriterMotion = await page.evaluate(start => {
        const samples = [...new Set(window.__pureScrollSamples.map(value => Math.round(value * 10) / 10))];
        const final = window.__pureWritingView.scrollDOM.scrollTop;
        return {
            samples,
            moved: Math.abs(final - start) > 10,
            hasIntermediate: samples.some(value => value !== samples[0] && Math.abs(value - final) > 0.5),
        };
    }, typewriterStart.top);
    expect(typewriterMotion.moved).toBe(true);
    expect(typewriterMotion.samples.length).toBeGreaterThan(2);
    expect(typewriterMotion.hasIntermediate).toBe(true);

    await page.locator('#toggle-sidebar').click();
    await expect(page.locator('#app')).not.toHaveClass(/pure-editing-chrome/);
    await expect(page.locator('#right-sidebar')).toHaveClass(/open/);
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-pure-suppressed', 'false');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#editor-breadcrumb')).toBeVisible();
    await expect.poll(() => page.locator('#right-sidebar').evaluate(element => (
        element.getBoundingClientRect().width
    ))).toBeGreaterThan(300);
    expect(await page.locator('#right-sidebar').evaluate(element => ({
        inert: element.inert,
        mode: element.dataset.mode,
    }))).toEqual({ inert: false, mode: preservedPaneMode });
    await page.locator('#right-sidebar-close').click();
    await expect(page.locator('#outline-toggle')).toBeVisible();
    await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '16.2px');
    const restored = await page.evaluate(() => {
        const app = document.querySelector('#app').getBoundingClientRect();
        const main = document.querySelector('.main-container').getBoundingClientRect();
        return { appTop: app.top, appBottom: app.bottom, mainTop: main.top, mainBottom: main.bottom };
    });
    expect(Math.abs(restored.mainTop - (restored.appTop + 44))).toBeLessThanOrEqual(1);
    expect(Math.abs(restored.mainBottom - (restored.appBottom - 24))).toBeLessThanOrEqual(1);
});

test('keeps rendered task checkboxes honest for keyboard, pointer, cursor, and drag selection', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = 'Above\n- [ ] Review **release** notes\nBelow';
    await page.evaluate(async value => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(value, 'Welcome.md');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== value) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        window.__taskCheckboxView = view;
    }, source);

    let checkbox = page.locator('.cm-task-checkbox');
    const hitbox = page.locator('.cm-task-checkbox-hitbox');
    await expect(checkbox).toHaveAttribute('aria-label', 'Mark “Review release notes” complete');
    const hitboxSize = await hitbox.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    });
    expect(hitboxSize.width).toBeGreaterThanOrEqual(24);
    expect(hitboxSize.height).toBeGreaterThanOrEqual(24);

    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => window.__taskCheckboxView.state.doc.toString()))
        .toBe('Above\n- [x] Review **release** notes\nBelow');
    checkbox = page.locator('.cm-task-checkbox');
    await expect(checkbox).toBeFocused();
    await expect(checkbox).toHaveAttribute('aria-label', 'Mark “Review release notes” incomplete');

    const paddingPoint = await page.locator('.cm-task-checkbox-hitbox').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left + 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(paddingPoint.x, paddingPoint.y);
    await expect.poll(() => page.evaluate(() => window.__taskCheckboxView.state.doc.toString())).toBe(source);

    await page.evaluate(() => {
        const view = window.__taskCheckboxView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => (
        window.__taskCheckboxView.state.doc.lineAt(window.__taskCheckboxView.state.selection.main.head).number
    ))).toBe(2);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => (
        window.__taskCheckboxView.state.doc.lineAt(window.__taskCheckboxView.state.selection.main.head).number
    ))).toBe(3);
    await page.evaluate(() => {
        const view = window.__taskCheckboxView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => (
        window.__taskCheckboxView.state.doc.lineAt(window.__taskCheckboxView.state.selection.main.head).number
    ))).toBe(2);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => (
        window.__taskCheckboxView.state.doc.lineAt(window.__taskCheckboxView.state.selection.main.head).number
    ))).toBe(1);

    const drag = await page.evaluate(() => {
        const view = window.__taskCheckboxView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).to } });
        const point = position => {
            const rect = view.coordsAtPos(position);
            return { x: rect.left + 2, y: (rect.top + rect.bottom) / 2 };
        };
        return {
            start: point(view.state.doc.line(1).from + 1),
            end: point(view.state.doc.line(3).to - 1),
            finalLineStart: view.state.doc.line(3).from,
        };
    });
    await page.mouse.move(drag.start.x, drag.start.y);
    await page.mouse.down();
    await page.mouse.move(drag.end.x, drag.end.y, { steps: 8 });
    await page.mouse.up();
    const selection = await page.evaluate(() => window.__taskCheckboxView.state.selection.main);
    expect(selection.from).toBeLessThanOrEqual(1);
    expect(selection.to).toBeGreaterThanOrEqual(drag.finalLineStart);
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
    await collapseControls.first().evaluate(async control => {
        await Promise.all(control.getAnimations().map(animation => animation.finished));
    });
    const guideTypeScale = await collapseControls.first().evaluate(control => ({
        guide: Number.parseFloat(getComputedStyle(control).fontSize),
        editor: Number.parseFloat(getComputedStyle(control.closest('.cm-editor')).fontSize),
    }));
    expect(guideTypeScale.guide).toBeGreaterThanOrEqual(guideTypeScale.editor);
    const headingGuideAlignment = await collapseControls.first().evaluate(control => {
        const labelRange = document.createRange();
        labelRange.selectNodeContents(control);
        const controlRect = control.getBoundingClientRect();
        const labelRect = labelRange.getBoundingClientRect();
        const editorRect = control.closest('.cm-editor').getBoundingClientRect();
        const lineRect = document.querySelector('.cm-line').getBoundingClientRect();
        return {
            guideTop: controlRect.top,
            lineTop: lineRect.top,
            justifyItems: getComputedStyle(control).justifyItems,
            textAlign: getComputedStyle(control).textAlign,
            inwardGap: controlRect.right - labelRect.right,
            writingGap: lineRect.left - controlRect.right,
            editorInset: controlRect.left - editorRect.left,
        };
    });
    expect(Math.abs(headingGuideAlignment.guideTop - headingGuideAlignment.lineTop)).toBeLessThan(2);
    expect(headingGuideAlignment.justifyItems).toBe('end');
    expect(headingGuideAlignment.textAlign).toBe('right');
    expect(headingGuideAlignment.inwardGap).toBeLessThanOrEqual(7);
    expect(headingGuideAlignment.writingGap).toBeGreaterThanOrEqual(6);
    expect(headingGuideAlignment.writingGap).toBeLessThanOrEqual(10);
    expect(headingGuideAlignment.editorInset).toBeGreaterThan(40);
    await collapseControls.nth(1).focus();
    await page.keyboard.press('Space');

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

    // A folded heading may hide a wider nested helper label. The helper rail
    // keeps its maximum supported width outside flex layout, so neither that
    // label disappearing nor returning can move the centered writing column.
    const stableRailSource = [
        '# Welcome',
        'Introduction',
        '```mermaid',
        'flowchart TD',
        '  Start --> Finish',
        '```',
        'After the diagram',
    ].join('\n');
    await page.evaluate(markdown => {
        const view = window.__headingFoldView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: 0 },
        });
        view.focus();
    }, stableRailSource);
    await expect(page.getByRole('button', { name: 'Collapse mermaid code block' })).toBeVisible();
    const stableRailGeometry = () => page.evaluate(() => {
        const contentRect = document.querySelector('#editor-container .cm-content').getBoundingClientRect();
        const lineRect = document.querySelector('#editor-container .cm-line').getBoundingClientRect();
        const guttersRect = document.querySelector('#editor-container .cm-gutters-before').getBoundingClientRect();
        const railRect = document.querySelector('#editor-container .cm-markdownBlockGutter').getBoundingClientRect();
        return {
            contentLeft: contentRect.left,
            lineLeft: lineRect.left,
            guttersWidth: guttersRect.width,
            railWidth: railRect.width,
        };
    });
    const expandedRailGeometry = await stableRailGeometry();
    await page.getByRole('button', { name: 'Collapse h1 Welcome section' }).click();
    await expect(page.getByRole('button', { name: 'Collapse mermaid code block' })).toHaveCount(0);
    const collapsedRailGeometry = await stableRailGeometry();
    expect(Math.abs(collapsedRailGeometry.contentLeft - expandedRailGeometry.contentLeft)).toBeLessThan(0.5);
    expect(Math.abs(collapsedRailGeometry.lineLeft - expandedRailGeometry.lineLeft)).toBeLessThan(0.5);
    expect(Math.abs(collapsedRailGeometry.guttersWidth - expandedRailGeometry.guttersWidth)).toBeLessThan(0.5);
    expect(Math.abs(collapsedRailGeometry.railWidth - expandedRailGeometry.railWidth)).toBeLessThan(0.5);
    await page.getByRole('button', { name: 'Expand h1 Welcome section' }).click();
    await expect(page.getByRole('button', { name: 'Collapse mermaid code block' })).toBeVisible();
    const restoredRailGeometry = await stableRailGeometry();
    expect(Math.abs(restoredRailGeometry.contentLeft - expandedRailGeometry.contentLeft)).toBeLessThan(0.5);
    expect(Math.abs(restoredRailGeometry.lineLeft - expandedRailGeometry.lineLeft)).toBeLessThan(0.5);

    // Browser-only boundary: third-party block widgets and their computed
    // layout must visibly yield to CodeMirror's native fold decoration.
    const focusedGuideSource = [
        '# Guide labels',
        'ordinary prose',
        '- ordinary list',
        '```yaml',
        'enabled: true',
        '```',
        '```',
        'untyped',
        '```',
        '| Key | Value |',
        '| --- | --- |',
        '| mode | test |',
        '',
        'after table',
    ].join('\n');
    await page.evaluate(markdown => {
        const view = window.__headingFoldView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: 0 },
        });
        view.focus();
    }, focusedGuideSource);

    const focusedGuides = page.locator('.ui-editor-block-guide[data-fold-from]:visible');
    await expect(focusedGuides).toHaveCount(4);
    await expect(focusedGuides).toHaveText(['h1', 'yaml', 'code', 'table']);
    const yamlGuide = page.getByRole('button', { name: 'Collapse yaml code block' });
    await expect(yamlGuide).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Collapse code block' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Collapse table' })).toHaveCount(1);
    const yamlWidget = page.locator('.cm-codeblock-widget').filter({ hasText: 'enabled: true' });
    const untypedWidget = page.locator('.cm-codeblock-widget').filter({ hasText: 'untyped' });
    const tableWidget = page.locator('.cm-block-widget--table');
    await expect(yamlWidget).toHaveCount(1);
    await expect(untypedWidget).toHaveCount(1);
    await expect(tableWidget).toHaveCount(1);
    const yamlCopy = yamlWidget.locator('.cm-codeblock-copy');
    const yamlBodyLine = yamlWidget.locator('.cm-codeblock-line:not(.cm-codeblock-fence)').first();
    await expect(yamlWidget).toHaveCSS('border-top-width', '0px');
    await expect(yamlWidget).toHaveCSS('border-radius', '8px');
    await expect(yamlCopy).toHaveCSS('opacity', '0');
    await expect(yamlCopy).toHaveCSS('pointer-events', 'none');
    expect(await yamlBodyLine.evaluate(line => getComputedStyle(line, '::before').borderRightWidth))
        .toBe('0px');
    const expandedWidgetHeights = {
        yaml: await yamlWidget.evaluate(widget => widget.getBoundingClientRect().height),
        code: await untypedWidget.evaluate(widget => widget.getBoundingClientRect().height),
        table: await tableWidget.evaluate(widget => widget.getBoundingClientRect().height),
    };
    const sourceBeforeFenceFold = await page.evaluate(() => window.__headingFoldView.state.doc.toString());
    const expandedYamlGuideBox = await yamlGuide.boundingBox();
    const expandedYamlWidgetBox = await yamlWidget.boundingBox();
    expect(Math.abs(expandedYamlGuideBox.y - expandedYamlWidgetBox.y)).toBeLessThan(2);
    await expect.poll(() => yamlGuide.evaluate(control => ({
        opacity: getComputedStyle(control).opacity,
        pointerEvents: getComputedStyle(control).pointerEvents,
    }))).toEqual({ opacity: '0', pointerEvents: 'none' });
    await yamlWidget.hover();
    await expect.poll(() => yamlGuide.evaluate(control => ({
        opacity: getComputedStyle(control).opacity,
        pointerEvents: getComputedStyle(control).pointerEvents,
    }))).toEqual({ opacity: '1', pointerEvents: 'auto' });
    await expect(yamlCopy).toHaveCSS('opacity', '1');
    await expect(yamlCopy).toHaveCSS('pointer-events', 'auto');
    const fixedYamlGuidePoint = {
        x: expandedYamlGuideBox.x + expandedYamlGuideBox.width / 2,
        y: expandedYamlGuideBox.y + expandedYamlGuideBox.height / 2,
    };
    await page.mouse.move(fixedYamlGuidePoint.x, fixedYamlGuidePoint.y, { steps: 8 });
    await expect(yamlGuide).toHaveCSS('opacity', '1');
    await page.mouse.click(fixedYamlGuidePoint.x, fixedYamlGuidePoint.y);
    const foldedYamlGuide = page.getByRole('button', { name: 'Expand yaml code block' });
    await expect(foldedYamlGuide).toHaveCount(1);
    await expect(foldedYamlGuide).toHaveCSS('opacity', '1');
    await expect(foldedYamlGuide).toHaveCSS('pointer-events', 'auto');
    await expect.poll(async () => {
        const box = await page.getByRole('button', { name: 'Expand yaml code block' }).boundingBox();
        return box?.y;
    }).toBeCloseTo(expandedYamlGuideBox.y, 0);
    await page.mouse.click(fixedYamlGuidePoint.x, fixedYamlGuidePoint.y);
    await expect(page.getByRole('button', { name: 'Collapse yaml code block' })).toHaveCount(1);
    await expect(yamlWidget).toBeVisible();
    await page.mouse.click(fixedYamlGuidePoint.x, fixedYamlGuidePoint.y);
    await expect(page.getByRole('button', { name: 'Expand yaml code block' })).toHaveCount(1);
    await expect(yamlWidget).toHaveCount(0);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    await expect(untypedWidget).toHaveCount(1);
    const yamlGeometry = await page.evaluate(() => {
        const view = window.__headingFoldView;
        const row = document.querySelector('.cm-foldPlaceholder').closest('.cm-line');
        const next = Array.from(document.querySelectorAll('.cm-codeblock-widget'))
            .find(widget => widget.textContent.includes('untyped'));
        const rowRect = row.getBoundingClientRect();
        const sourcePosition = view.state.doc.toString().indexOf('```yaml');
        return {
            heightMapDelta: Math.abs(view.lineBlockAt(sourcePosition).height - rowRect.height),
            nextGap: next.getBoundingClientRect().top - rowRect.bottom,
        };
    });
    expect(yamlGeometry.heightMapDelta).toBeLessThan(2);
    expect(yamlGeometry.nextGap).toBeLessThan(2);
    expect(await page.locator('.cm-foldPlaceholder').evaluate(row => row.getBoundingClientRect().height))
        .toBeLessThan(expandedWidgetHeights.yaml);
    await page.evaluate(() => {
        const view = window.__headingFoldView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        view.focus();
    });
    for (const [key, expectedLine] of [['ArrowDown', 4], ['ArrowUp', 3]]) {
        await page.keyboard.press(key);
        await expect.poll(() => page.evaluate(() => window.__headingFoldView.state.doc.lineAt(
            window.__headingFoldView.state.selection.main.head,
        ).number)).toBe(expectedLine);
    }
    expect(await page.evaluate(() => window.__headingFoldView.state.doc.toString())).toBe(sourceBeforeFenceFold);
    await page.getByRole('button', { name: 'Expand yaml code block' }).click();
    await expect(page.getByRole('button', { name: 'Collapse yaml code block' })).toHaveCount(1);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
    await expect(yamlWidget).toBeVisible();
    await expect.poll(() => yamlWidget.evaluate(widget => widget.getBoundingClientRect().height))
        .toBeGreaterThanOrEqual(expandedWidgetHeights.yaml);

    await untypedWidget.hover();
    await page.getByRole('button', { name: 'Collapse code block' }).click();
    await expect(page.getByRole('button', { name: 'Expand code block' })).toHaveCount(1);
    await expect(untypedWidget).toHaveCount(0);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    expect(await page.locator('.cm-foldPlaceholder').evaluate(row => row.getBoundingClientRect().height))
        .toBeLessThan(expandedWidgetHeights.code);
    await expect(yamlWidget).toHaveCount(1);
    await page.getByRole('button', { name: 'Expand code block' }).click();
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
    await expect(untypedWidget).toBeVisible();
    await expect.poll(() => untypedWidget.evaluate(widget => widget.getBoundingClientRect().height))
        .toBeGreaterThanOrEqual(expandedWidgetHeights.code);

    const sourceBeforeTableFold = await page.evaluate(() => window.__headingFoldView.state.doc.toString());
    await tableWidget.hover();
    await page.getByRole('button', { name: 'Collapse table' }).click();
    await expect(page.getByRole('button', { name: 'Expand table' })).toHaveCount(1);
    await expect(tableWidget).toHaveCount(0);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    const tableGeometry = await page.evaluate(() => {
        const row = document.querySelector('.cm-foldPlaceholder').closest('.cm-line');
        const rowRect = row.getBoundingClientRect();
        const after = Array.from(document.querySelectorAll('.cm-line'))
            .find(line => line.textContent.includes('after table'));
        const afterRect = after.getBoundingClientRect();
        return {
            nextGap: afterRect.top - rowRect.bottom,
            rowHeight: rowRect.height,
        };
    });
    expect(Math.abs(tableGeometry.nextGap)).toBeLessThanOrEqual(tableGeometry.rowHeight + 2);
    expect(await page.locator('.cm-foldPlaceholder').evaluate(row => row.getBoundingClientRect().height))
        .toBeLessThan(expandedWidgetHeights.table);
    await page.evaluate(() => {
        const view = window.__headingFoldView;
        view.dispatch({ selection: { anchor: view.state.doc.line(9).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__headingFoldView.state.doc.lineAt(
        window.__headingFoldView.state.selection.main.head,
    ).number)).toBe(10);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__headingFoldView.state.doc.lineAt(
        window.__headingFoldView.state.selection.main.head,
    ).number)).toBe(9);
    expect(await page.evaluate(() => window.__headingFoldView.state.doc.toString())).toBe(sourceBeforeTableFold);
    await page.getByRole('button', { name: 'Expand table' }).click();
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
    await expect(tableWidget).toBeVisible();
    await expect.poll(() => tableWidget.evaluate(widget => widget.getBoundingClientRect().height))
        .toBeGreaterThanOrEqual(expandedWidgetHeights.table);

    // Collapsing the final block would normally clamp scrollTop and move its
    // guide. The anchor reserve keeps the control under the pointer so the
    // exact same screen coordinate can immediately expand it again.
    const bottomGuideSource = [
        ...Array.from({ length: 55 }, (_, index) => `Lead-in line ${index + 1}`),
        '```yaml',
        ...Array.from({ length: 18 }, (_, index) => `option_${index + 1}: true`),
        '```',
    ].join('\n');
    await page.evaluate(markdown => {
        const view = window.__headingFoldView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: markdown } });
        view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
        view.scrollDOM.dispatchEvent(new Event('scroll'));
    }, bottomGuideSource);
    const bottomGuide = page.getByRole('button', { name: 'Collapse yaml code block' });
    await expect(bottomGuide).toBeVisible();
    await page.locator('.cm-codeblock-widget').hover();
    await expect(bottomGuide).toHaveCSS('opacity', '1');
    const bottomGuideBox = await bottomGuide.boundingBox();
    const fixedBottomGuidePoint = {
        x: bottomGuideBox.x + bottomGuideBox.width / 2,
        y: bottomGuideBox.y + bottomGuideBox.height / 2,
    };
    await page.mouse.move(fixedBottomGuidePoint.x, fixedBottomGuidePoint.y, { steps: 8 });
    await page.mouse.click(fixedBottomGuidePoint.x, fixedBottomGuidePoint.y);
    const expandedBottomGuide = page.getByRole('button', { name: 'Expand yaml code block' });
    await expect(expandedBottomGuide).toBeVisible();
    await expect.poll(async () => (await expandedBottomGuide.boundingBox())?.y)
        .toBeCloseTo(bottomGuideBox.y, 0);
    expect(await page.evaluate(() => Number.parseFloat(
        window.__headingFoldView.contentDOM.style.getPropertyValue('--markdown-fold-anchor-reserve'),
    ))).toBeGreaterThan(0);
    await page.mouse.click(fixedBottomGuidePoint.x, fixedBottomGuidePoint.y);
    await expect(bottomGuide).toBeVisible();
    await expect.poll(async () => (await bottomGuide.boundingBox())?.y)
        .toBeCloseTo(bottomGuideBox.y, 0);
    await expect.poll(() => page.evaluate(() => Number.parseFloat(
        window.__headingFoldView.contentDOM.style.getPropertyValue('--markdown-fold-anchor-reserve'),
    ))).toBe(0);
    expect(await page.evaluate(() => window.__headingFoldView.state.doc.toString())).toBe(bottomGuideSource);
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

test('uses ranked native search for typo-tolerant link autocomplete', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const state = await import('/js/state.js');
        const app = (await import('/js/backend.js')).backend();
        window.__rankedLinkSearchCalls = [];
        app.SearchNotes = async (query, request) => {
            window.__rankedLinkSearchCalls.push({ query, request });
            return {
                results: [
                    { name: 'Deployment Guide.md', path: 'docs/Deployment Guide.md', score: 12 },
                    { name: 'Old Deployment.md', path: 'archive/Old Deployment.md', score: 4 },
                ],
                suggestion: '',
            };
        };
        state.setState('fileTreeData', [{
            name: 'docs', path: 'docs', type: 'directory', children: [
                { name: 'Deployment Guide.md', path: 'docs/Deployment Guide.md', type: 'file', mtime: 1 },
            ],
        }]);
        editor.setEditorContent('Link ');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== 'Link ') {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        window.__rankedLinkView = view;
    });

    await page.keyboard.type('[deploymnet');
    const labels = page.locator('.cm-tooltip-autocomplete .cm-completionLabel');
    await expect(labels.first()).toHaveText('Deployment Guide');
    await expect.poll(() => page.evaluate(() => window.__rankedLinkSearchCalls.at(-1))).toEqual({
        query: 'deploymnet',
        request: {
            case_sensitive: false,
            title_only: false,
            profile: 'links',
            limit: 10,
            suggest: false,
        },
    });

    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__rankedLinkView.state.doc.toString()))
        .toBe('Link [Deployment Guide](docs/Deployment%20Guide.md) ');
});

test('offers due-date actions after Space on any tagged line and keeps editor navigation intact', async ({ page }) => {
    await openWelcomeEditor(page);
    const content = page.locator('.cm-content');
    const completionLabels = page.locator('.cm-tooltip-autocomplete .cm-completionLabel');

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const kanban = await import('/js/kanban.js');
        const calendar = await import('/js/calendar.js');
        const dueDates = await import('/js/core/dueDateModel.js');
        const app = (await import('/js/backend.js')).backend();
        const state = await import('/js/state.js');
        await Promise.race([
            kanban.refreshKanbanData(),
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('Kanban setup refresh did not finish within 2 seconds')),
                2000,
            )),
        ]);
        const today = dueDates.localISODate();
        const current = dueDates.dateFromISO(today);
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        const todayDay = current.getDate();
        const activityDay = todayDay === 1 ? 2 : 1;
        const dueDay = [1, 2, 3].find(day => day !== todayDay && day !== activityDay && day <= daysInMonth);
        const iso = day => `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        app.GetCalendarMonthData = async () => ({
            year: current.getFullYear(),
            month: current.getMonth() + 1,
            days_with_notes: [activityDay, dueDay],
            days_with_links: [],
            days_with_due_tasks: [dueDay],
            day_summaries: [
                { day: activityDay, note_count: 6, due_titles: [] },
                { day: dueDay, note_count: 1, due_titles: ['Existing deadline'] },
            ],
            calendar: [],
        });
        state.setState('currentCalDate', current);
        state.setState('selectedCalDateStr', today);
        calendar.invalidateCalendarCache();
        window.__pickerCalendarParity = {
            today,
            activityDate: iso(activityDay),
            dueDate: iso(dueDay),
        };
        window.__pickerSourceTabId = state.getState('activeTabId');
        state.setState('kanbanCompletionColumns', ['urgent']);
        editor.setEditorContent('A long paragraph ');
        const view = editor.getEditorView();
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
    });
    await expect.poll(() => page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const state = await import('/js/state.js');
        return {
            source: editor.getEditorView().state.doc.toString(),
            columns: state.getState('kanbanCompletionColumns'),
        };
    }), {
        timeout: 3000,
        message: 'Kanban autocomplete fixture did not settle before typing',
    }).toEqual({ source: 'A long paragraph ', columns: ['urgent'] });
    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('#calendar-grid')).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(async () => {
        const { switchTab } = await import('/js/tabManager.js');
        const editor = await import('/js/editor.js');
        const state = await import('/js/state.js');
        await switchTab(window.__pickerSourceTabId);
        state.setState('kanbanCompletionColumns', ['urgent']);
        editor.setEditorContent('A long paragraph ');
        const view = editor.getEditorView();
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
    });
    await expect.poll(() => page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const state = await import('/js/state.js');
        return {
            source: editor.getEditorView().state.doc.toString(),
            columns: state.getState('kanbanCompletionColumns'),
            focused: editor.getEditorView().hasFocus,
        };
    }), {
        timeout: 3000,
        message: 'Restored editor autocomplete fixture did not settle before typing',
    }).toEqual({ source: 'A long paragraph ', columns: ['urgent'], focused: true });
    await page.keyboard.type('#ur');
    await expect(completionLabels).toHaveText(['#urgent']);
    await page.keyboard.press('Escape');

    const source = 'Before\nPrepare release \nAfter';
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        const view = window.__tagDueView = editor.getEditorView();
        const taggedLineEnd = markdown.indexOf('\nAfter');
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: taggedLineEnd },
        });
        view.focus();
    }, source);
    await page.keyboard.type('#todo ');
    await expect(completionLabels).toHaveText([
        'Add due date…', 'Due today', 'Due tomorrow',
    ]);
    await page.evaluate(() => {
        const view = window.__tagDueView;
        const rect = view.coordsAtPos(view.state.selection.main.head);
        window.__tagDueCursorRect = {
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
        };
    });
    await page.keyboard.press('Enter');

    const picker = page.locator('.ui-date-picker[aria-label="Choose due date"]');
    await expect(picker).toBeVisible();
    await expect(picker.locator('.ui-date-picker-grid')).toHaveAttribute('aria-busy', 'false');
    const calendarParity = await page.evaluate(() => {
        const dates = window.__pickerCalendarParity;
        const workspaceGrid = document.getElementById('calendar-grid');
        const pickerGrid = document.querySelector('.ui-date-picker-grid');
        const sharedState = element => [...element.classList]
            .filter(name => name === 'selected'
                || name === 'is-weekend'
                || name === 'has-note'
                || name === 'has-due-task'
                || name.startsWith('ui-date-picker-day'))
            .sort();
        const visual = element => {
            const style = getComputedStyle(element);
            return {
                background: style.backgroundColor,
                border: style.borderColor,
                color: style.color,
                radius: style.borderRadius,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
            };
        };
        const compareDate = date => {
            const workspace = workspaceGrid.querySelector(`[data-date="${date}"]`);
            const popup = pickerGrid.querySelector(`[data-date="${date}"]`);
            return {
                workspaceState: sharedState(workspace),
                popupState: sharedState(popup),
                workspaceVisual: visual(workspace),
                popupVisual: visual(popup),
            };
        };
        const weekend = workspaceGrid.querySelector('[data-date].ui-date-picker-day--weekend').dataset.date;
        return {
            weekdays: [...workspaceGrid.querySelectorAll('.cal-day-header')].map(day => day.textContent.trim()),
            popupWeekdays: [...document.querySelectorAll('.ui-date-picker-weekdays .cal-day-header')]
                .map(day => day.textContent.trim()),
            todaySelected: pickerGrid.querySelector(`[data-date="${dates.today}"]`).classList.contains('selected'),
            todayCurrent: pickerGrid.querySelector(`[data-date="${dates.today}"]`).getAttribute('aria-current'),
            today: compareDate(dates.today),
            activity: compareDate(dates.activityDate),
            due: compareDate(dates.dueDate),
            weekend: compareDate(weekend),
        };
    });
    expect(calendarParity.popupWeekdays).toEqual(calendarParity.weekdays);
    expect(calendarParity.todaySelected).toBe(true);
    expect(calendarParity.todayCurrent).toBe('date');
    for (const state of ['today', 'activity', 'due', 'weekend']) {
        expect(calendarParity[state].popupState).toEqual(calendarParity[state].workspaceState);
        expect(calendarParity[state].popupVisual).toEqual(calendarParity[state].workspaceVisual);
    }
    const placement = await page.evaluate(() => {
        const cursor = window.__tagDueCursorRect;
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
    await expect.poll(() => page.evaluate(() => window.__tagDueView.state.doc.toString()))
        .toMatch(/^Before\nPrepare release #todo \[due \d{4}-\d{2}-\d{2}\]\(\d{4}-\d{2}-\d{2}\.md\)\nAfter$/);
    await content.press('ArrowDown');
    expect(await page.evaluate(() => window.__tagDueView.state.doc.lineAt(
        window.__tagDueView.state.selection.main.head,
    ).number)).toBe(3);
    await content.press('ArrowUp');
    expect(await page.evaluate(() => window.__tagDueView.state.doc.lineAt(
        window.__tagDueView.state.selection.main.head,
    ).number)).toBe(2);

    const drag = await page.evaluate(() => {
        const view = window.__tagDueView;
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
        const view = window.__tagDueView;
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
    await expect(page.locator('.select-combobox-trigger')).toHaveCount(3);
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

test('keeps rendered block source footprints stable and chains code wheel input at scroll limits', async ({ page }) => {
    await openWelcomeEditor(page);
    const fence = '`'.repeat(3);
    const longCodeLine = `const answer = "${'wrapped source '.repeat(10)}";`;
    const source = [
        'Before',
        '',
        fence + 'javascript',
        longCodeLine,
        fence,
        '',
        '$$',
        '\\frac{a}{b} + \\sum_{i=1}^{n} i',
        '$$',
        '',
        fence + 'mermaid',
        'flowchart TD',
        '  A --> B',
        fence,
        '',
        '| Name | State |',
        '| --- | --- |',
        '| Alpha | Ready |',
        '',
        'Inline $z$ remains inline.',
        '',
        'After',
    ].join('\n');

    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        window.__sourceFootprintView = view;
    }, source);
    await page.waitForFunction(() => window.__sourceFootprintView?.state.doc.toString().endsWith('After'));
    await page.evaluate(() => {
        const view = window.__sourceFootprintView;
        view.dispatch({ selection: { anchor: view.state.doc.line(22).to } });
        view.focus();
    });

    await expect(page.locator('.cm-codeblock-widget')).toHaveCount(1);
    await expect(page.locator('.cm-math-block')).toHaveCount(1);
    await expect(page.locator('.cm-live-diagram')).toHaveCount(1);
    await expect(page.locator('.cm-block-widget--table')).toHaveCount(1);
    await expect(page.locator('.cm-math-inline')).toHaveCount(1);

    const renderedCode = page.locator('.cm-codeblock-widget');
    await expect(renderedCode.locator('.cm-codeblock-line:not(.cm-codeblock-fence)')).toHaveCount(1);
    expect(await renderedCode.locator('.cm-codeblock-fence').evaluateAll(elements => (
        elements.every(element => getComputedStyle(element).display === 'none')
    ))).toBe(true);
    expect(await renderedCode.locator('.cm-codeblock-line:not(.cm-codeblock-fence)').evaluate(element => ({
        content: getComputedStyle(element, '::before').content,
        increment: getComputedStyle(element).counterIncrement,
    }))).toEqual({ content: 'counter(code-block-line)', increment: 'code-block-line 1' });

    await expect.poll(() => page.evaluate(() => {
        const view = window.__sourceFootprintView;
        const code = document.querySelector('.cm-source-footprint[data-source-footprint="code"]');
        return code.getBoundingClientRect().height > Number(code.dataset.sourceLines) * view.defaultLineHeight + 2;
    })).toBe(true);
    const footprints = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.cm-source-footprint')).map(element => ({
            kind: element.dataset.sourceFootprint,
            lines: Number(element.dataset.sourceLines),
            actualHeight: element.getBoundingClientRect().height,
            overflowY: getComputedStyle(element).overflowY,
            surfaceOverflowY: element.dataset.sourceFootprint === 'table'
                ? getComputedStyle(element.querySelector('.cm-live-table')).overflowY
                : null,
            state: element.dataset.sourceFootprintState,
        }));
    });
    expect(footprints.map(item => item.kind).sort()).toEqual(['code', 'math', 'mermaid', 'table']);
    for (const footprint of footprints) {
        expect(footprint.actualHeight).toBeGreaterThan(0);
    }
    expect(footprints.find(item => item.kind === 'code').overflowY).toBe('auto');
    expect(footprints.find(item => item.kind === 'code').state).toBe('underflow');
    expect(footprints.find(item => item.kind === 'table').overflowY).toBe('hidden');
    expect(footprints.find(item => item.kind === 'table').surfaceOverflowY).toBe('auto');
    expect(await page.locator('.cm-math-inline').evaluate(element => (
        element.classList.contains('cm-source-footprint')
    ))).toBe(false);

    const afterTop = () => page.evaluate(() => {
        const view = window.__sourceFootprintView;
        return view.coordsAtPos(view.state.doc.line(22).from).top;
    });
    const renderedAfterTop = await afterTop();
    for (const item of [
        { line: 4, selector: '.cm-codeblock-widget' },
        { line: 8, selector: '.cm-math-block' },
        { line: 12, selector: '.cm-live-diagram' },
    ]) {
        await page.evaluate(line => {
            const view = window.__sourceFootprintView;
            view.dispatch({ selection: { anchor: view.state.doc.line(line).from } });
            view.focus();
        }, item.line);
        await expect(page.locator(item.selector)).toHaveCount(0);
        const revealedAfterTop = await afterTop();
        expect(Math.abs(revealedAfterTop - renderedAfterTop), item.selector).toBeLessThan(2);

        await page.evaluate(() => {
            const view = window.__sourceFootprintView;
            view.dispatch({ selection: { anchor: view.state.doc.line(22).to } });
            view.focus();
        });
        await expect(page.locator(item.selector)).toHaveCount(1);
        expect(Math.abs((await afterTop()) - renderedAfterTop)).toBeLessThan(2);
    }

    const mathPoints = await page.evaluate(() => {
        const view = window.__sourceFootprintView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 3, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            before: point(view.state.doc.line(6).from),
            after: point(view.state.doc.line(10).from),
        };
    });
    for (const [point, line] of [[mathPoints.before, 6], [mathPoints.after, 10]]) {
        await page.mouse.click(point.x, point.y);
        expect(await page.evaluate(() => {
            const view = window.__sourceFootprintView;
            return view.state.doc.lineAt(view.state.selection.main.head).number;
        })).toBe(line);
    }

    const content = page.locator('.cm-content');
    for (const { line, key, min, max } of [
        { line: 2, key: 'ArrowDown', min: 3, max: 5 },
        { line: 6, key: 'ArrowUp', min: 3, max: 5 },
        { line: 6, key: 'ArrowDown', min: 7, max: 9 },
        { line: 10, key: 'ArrowUp', min: 7, max: 9 },
        { line: 10, key: 'ArrowDown', min: 11, max: 14 },
        { line: 15, key: 'ArrowUp', min: 11, max: 14 },
    ]) {
        await page.evaluate(currentLine => {
            const view = window.__sourceFootprintView;
            view.dispatch({ selection: { anchor: view.state.doc.line(currentLine).from } });
            view.focus();
        }, line);
        await content.press(key);
        const landed = await page.evaluate(() => {
            const view = window.__sourceFootprintView;
            return view.state.doc.lineAt(view.state.selection.main.head).number;
        });
        expect(landed).toBeGreaterThanOrEqual(min);
        expect(landed).toBeLessThanOrEqual(max);
    }

    const points = await page.evaluate(() => {
        const view = window.__sourceFootprintView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 3, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            before: point(view.state.doc.line(1).from),
            after: point(view.state.doc.line(15).from),
            firstBlock: view.state.doc.line(3).from,
            lastBlock: view.state.doc.line(14).to,
        };
    });
    for (const [start, end] of [[points.before, points.after], [points.after, points.before]]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 10 });
        await page.mouse.up();
        const selection = await page.evaluate(() => window.__sourceFootprintView.state.selection.main);
        expect(selection.from).toBeLessThanOrEqual(points.firstBlock);
        expect(selection.to).toBeGreaterThanOrEqual(points.lastBlock);
    }

    // A scrollbar press is a native browser boundary. Keep the rendered code
    // mounted and the root selection unchanged while the track owns the input.
    const scrollbarSource = [
        'Before',
        '',
        fence + 'javascript',
        longCodeLine,
        fence,
        '',
        'After',
    ].join('\n');
    await page.evaluate(markdown => {
        const view = window.__sourceFootprintView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: markdown.length },
        });
        view.focus();
    }, scrollbarSource);
    await expect(renderedCode).toHaveCount(1);
    const scrollbarDimensions = await renderedCode.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
    }));
    expect(scrollbarDimensions.scrollWidth).toBeGreaterThan(scrollbarDimensions.clientWidth + 1);
    const selectionBeforeScrollbar = await page.evaluate(() => (
        window.__sourceFootprintView.state.selection.main.head
    ));
    expect(await page.evaluate(async () => {
        const { codeBlockScrollbarGuardExtension } = await import('/js/codeBlockInteraction.js');
        return Boolean(window.__sourceFootprintView.plugin(codeBlockScrollbarGuardExtension));
    })).toBe(true);
    const codeBox = await renderedCode.boundingBox();
    await page.evaluate(() => {
        window.__codeScrollbarDefaultPrevented = null;
        document.addEventListener('mousedown', event => {
            const widget = event.target?.closest?.('.cm-codeblock-widget');
            if (!widget) return;
            const style = getComputedStyle(widget);
            window.__codeScrollbarPress = {
                viewContainsWidget: window.__sourceFootprintView.dom.contains(widget),
                pathContainsView: event.composedPath().includes(window.__sourceFootprintView.dom),
                clientX: event.clientX,
                clientY: event.clientY,
                rect: widget.getBoundingClientRect().toJSON(),
                clientWidth: widget.clientWidth,
                clientHeight: widget.clientHeight,
                offsetWidth: widget.offsetWidth,
                offsetHeight: widget.offsetHeight,
                scrollWidth: widget.scrollWidth,
                scrollHeight: widget.scrollHeight,
                borderTop: Number.parseFloat(style.borderTopWidth) || 0,
                borderRight: Number.parseFloat(style.borderRightWidth) || 0,
                borderBottom: Number.parseFloat(style.borderBottomWidth) || 0,
                borderLeft: Number.parseFloat(style.borderLeftWidth) || 0,
            };
        }, { capture: true, once: true });
        document.addEventListener('mousedown', event => {
            window.__codeScrollbarDefaultPrevented = event.defaultPrevented;
        }, { once: true });
    });
    await page.mouse.move(codeBox.x + codeBox.width * 0.65, codeBox.y + codeBox.height - 3);
    await page.mouse.down();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(renderedCode).toHaveCount(1);
    await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Chromium does not consistently page an overlay scrollbar from a
    // synthetic track press; the event must still remain native and must not
    // reveal source or leave the root caret at the temporary pointer position.
    expect(await page.evaluate(async () => {
        const { codeBlockScrollbarAxis } = await import('/js/core/codeBlockInteractionModel.js');
        return codeBlockScrollbarAxis(window.__codeScrollbarPress);
    })).toBe('horizontal');
    expect(await page.evaluate(() => ({
        defaultPrevented: window.__codeScrollbarDefaultPrevented,
        viewContainsWidget: window.__codeScrollbarPress.viewContainsWidget,
        pathContainsView: window.__codeScrollbarPress.pathContainsView,
    }))).toEqual({
        defaultPrevented: false,
        viewContainsWidget: true,
        pathContainsView: true,
    });
    await expect(renderedCode).toHaveCount(1);
    expect(await page.evaluate(() => window.__sourceFootprintView.state.selection.main.head))
        .toBe(selectionBeforeScrollbar);

    // Native wheel chaining is also a browser boundary. A vertically
    // overflowing preview scrolls first; after it reaches either edge,
    // continued wheel input resumes scrolling the CodeMirror document.
    const wheelChainSource = [
        ...Array.from({ length: 32 }, (_, index) => `Before wheel ${index + 1}`),
        fence + 'javascript',
        longCodeLine,
        fence,
        ...Array.from({ length: 32 }, (_, index) => `After wheel ${index + 1}`),
    ].join('\n');
    await page.evaluate(markdown => {
        const view = window.__sourceFootprintView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: markdown.length },
        });
        const widget = view.dom.querySelector('.cm-codeblock-widget');
        widget.scrollIntoView({ block: 'center' });
        widget.scrollTop = 0;
        view.focus();
    }, wheelChainSource);
    await expect(renderedCode).toHaveCount(1);
    const normalWheelDimensions = await renderedCode.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overscrollBehavior: getComputedStyle(element).overscrollBehavior,
    }));
    expect(normalWheelDimensions.scrollWidth).toBeGreaterThan(normalWheelDimensions.clientWidth + 1);
    expect(normalWheelDimensions.scrollHeight).toBeLessThanOrEqual(normalWheelDimensions.clientHeight + 1);
    expect(normalWheelDimensions.overscrollBehavior).toBe('auto');
    const selectionBeforeWheel = await page.evaluate(() => (
        window.__sourceFootprintView.state.selection.main.head
    ));
    await renderedCode.hover({ position: { x: 20, y: 20 } });
    const documentBeforeUnscrollableWheel = await page.evaluate(() => (
        window.__sourceFootprintView.scrollDOM.scrollTop
    ));
    await page.mouse.wheel(0, 60);
    await expect.poll(() => page.evaluate(() => window.__sourceFootprintView.scrollDOM.scrollTop))
        .toBeGreaterThan(documentBeforeUnscrollableWheel);
    expect(await renderedCode.evaluate(element => element.scrollTop)).toBe(0);

    const verticalDimensions = await renderedCode.evaluate(element => {
        for (const property of ['height', 'min-height', 'max-height']) {
            element.style.setProperty(property, '44px', 'important');
        }
        element.scrollIntoView({ block: 'center' });
        element.scrollTop = 0;
        return {
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
        };
    });
    expect(verticalDimensions.scrollHeight).toBeGreaterThan(verticalDimensions.clientHeight + 1);
    await renderedCode.hover({ position: { x: 20, y: 20 } });
    const documentBeforeInnerWheel = await page.evaluate(() => window.__sourceFootprintView.scrollDOM.scrollTop);
    await page.mouse.wheel(0, 60);
    await expect.poll(() => renderedCode.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__sourceFootprintView.scrollDOM.scrollTop))
        .toBe(documentBeforeInnerWheel);

    await renderedCode.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const documentBeforeBottomChain = await page.evaluate(() => window.__sourceFootprintView.scrollDOM.scrollTop);
    await page.mouse.wheel(0, 180);
    await expect.poll(() => page.evaluate(() => window.__sourceFootprintView.scrollDOM.scrollTop))
        .toBeGreaterThan(documentBeforeBottomChain);

    await renderedCode.evaluate(element => { element.scrollTop = 0; });
    const documentBeforeTopChain = await page.evaluate(() => window.__sourceFootprintView.scrollDOM.scrollTop);
    await page.mouse.wheel(0, -180);
    await expect.poll(() => page.evaluate(() => window.__sourceFootprintView.scrollDOM.scrollTop))
        .toBeLessThan(documentBeforeTopChain);
    await expect(renderedCode).toHaveCount(1);
    expect(await page.evaluate(() => window.__sourceFootprintView.state.selection.main.head))
        .toBe(selectionBeforeWheel);
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

test('keeps borderless sidebar search, its conditional count, and Quick note focused before collapse', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true && window.lucide?.icons?.Star && window.lucide?.icons?.Mail);

    const search = page.locator('#global-search-input');
    const searchCount = page.locator('#search-results-count');
    const quickNote = page.locator('#create-inbox-note');
    const controlPaint = locator => locator.evaluate(element => {
        const style = getComputedStyle(element);
        return {
            border: style.borderTopColor,
            background: style.backgroundColor,
            shadow: style.boxShadow,
        };
    });

    expect(await controlPaint(search)).toMatchObject({
        border: 'rgba(0, 0, 0, 0)',
    });
    expect((await controlPaint(search)).background).not.toBe('rgba(0, 0, 0, 0)');
    await expect(searchCount).toBeHidden();
    await page.evaluate(async () => {
        const { renderSearchResults } = await import('/js/views/searchView.js');
        renderSearchResults({
            results: [{
                name: 'Welcome.md',
                path: 'Welcome.md',
                matches: [{ line: 1, text: 'Welcome to Figaro' }],
                matchCount: 1,
            }],
            query: 'welcome',
            filters: { titleOnly: false, recentOnly: false, caseSensitive: false },
            selectedIndex: -1,
            onFilter() {},
            onOpen() {},
        });
    });
    await expect(searchCount).toBeVisible();
    await expect(searchCount).toHaveText('1 note');
    await page.evaluate(async () => {
        const { clearGlobalSearch } = await import('/js/controllers/searchController.js');
        clearGlobalSearch(false);
    });
    await expect(searchCount).toBeHidden();
    await search.hover();
    expect((await controlPaint(search)).border).toBe('rgba(0, 0, 0, 0)');
    await search.focus();
    expect(await controlPaint(search)).toMatchObject({
        border: 'rgba(0, 0, 0, 0)',
    });
    expect((await controlPaint(search)).shadow).not.toBe('none');

    await expect(quickNote).toContainText('Quick note');
    const quickNotePalette = await page.evaluate(() => {
        const probe = document.createElement('span');
        document.body.append(probe);
        probe.style.color = 'var(--text-dim)';
        const destination = getComputedStyle(probe).color;
        probe.style.color = 'var(--accent-color)';
        const accent = getComputedStyle(probe).color;
        probe.style.color = 'var(--text-muted)';
        const muted = getComputedStyle(probe).color;
        probe.style.backgroundColor = 'color-mix(in srgb, var(--text-color) 3%, var(--sidebar-bg))';
        const rest = getComputedStyle(probe).backgroundColor;
        probe.style.backgroundColor = 'var(--hover-bg)';
        const hover = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
            accent,
            destination,
            muted,
            rest,
            hover,
            label: getComputedStyle(document.querySelector('#create-inbox-note small')).color,
            actionIcon: getComputedStyle(document.querySelector('#create-inbox-note svg')).color,
        };
    });
    expect(quickNotePalette.label).toBe(quickNotePalette.destination);
    expect(quickNotePalette.actionIcon).toBe(quickNotePalette.accent);
    expect((await controlPaint(quickNote)).border).toBe('rgba(0, 0, 0, 0)');
    await expect.poll(async () => (await controlPaint(quickNote)).background)
        .toBe(quickNotePalette.rest);
    await quickNote.hover();
    expect((await controlPaint(quickNote)).border).toBe('rgba(0, 0, 0, 0)');
    await expect(quickNote).toHaveCSS('background-color', quickNotePalette.hover);
    await quickNote.focus();
    expect(await controlPaint(quickNote)).toMatchObject({
        border: 'rgba(0, 0, 0, 0)',
    });
    expect((await controlPaint(quickNote)).shadow).not.toBe('none');

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
            { id: 'active.md', type: 'file', path: 'active.md', dirty: false },
            { id: 'background.md', type: 'file', path: 'background.md', dirty: true },
        ]);
        state.setState('selectedFilePath', 'active.md');
        tree.renderFileTree();
    });

    const inboxIcon = page.locator('[data-path="Inbox"] .default-inbox-icon');
    await expect(inboxIcon).toBeVisible();
    await expect(inboxIcon).toHaveCSS('color', quickNotePalette.muted);
    await expect(page.locator('[data-path="active.md"] > .file-tree-node')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-path="active.md"] > .file-tree-node')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('[data-path="active.md"] > .file-tree-node')).not.toHaveClass(/selected/);
    await expect(page.locator('[data-path="background.md"] > .file-tree-node')).toHaveClass(/dirty-buffer/);
    await expect(page.locator('[data-path="background.md"] > .file-tree-node'))
        .toHaveAccessibleName(/background\.md.*Unsaved changes/i);
    await expect(page.locator('[data-path="closed.md"] > .file-tree-node')).not.toHaveClass(/dirty-buffer|selected/);

    await page.locator('[data-path="background.md"] > .file-tree-node').click({ button: 'right' });
    await page.locator('[data-action="customize-style"]').click();
    const dialogText = await page.locator('.file-tree-style-modal').textContent();
    expect(dialogText.match(/background\.md/g)).toHaveLength(1);
    await page.locator('.file-tree-style-modal .custom-modal-btn-cancel').click();
});

test('patches mounted file-tree current-document and dirty markers without rebuilding folders during fast tab transitions', async ({ page }) => {
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
            activeCurrent: active.getAttribute('aria-current'),
            backgroundCurrent: background.getAttribute('aria-current'),
            activeSelected: active.getAttribute('aria-selected'),
            backgroundSelected: background.getAttribute('aria-selected'),
            hiddenMounted: Boolean(document.querySelector('[data-path="Archive/hidden.md"]')),
        };
    });

    expect(result).toEqual(expect.objectContaining({
        preservedAfterDirty: true,
        preservedAfterSwitch: true,
        hiddenMounted: false,
    }));
    expect(result.activeClasses).toContain('dirty-buffer');
    expect(result.activeClasses).not.toContain('selected');
    expect(result.activeCurrent).toBeNull();
    expect(result.activeSelected).toBe('false');
    expect(result.backgroundClasses).not.toContain('selected');
    expect(result.backgroundClasses).not.toContain('dirty-buffer');
    expect(result.backgroundCurrent).toBe('page');
    expect(result.backgroundSelected).toBe('false');
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
            changesBeforeAction: Boolean(document.getElementById('history-count').compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
    });
    expect(highlighted.background).toBe('rgba(0, 0, 0, 0)');
    expect(highlighted.bottomBorder).not.toBe('rgba(0, 0, 0, 0)');
    expect(highlighted.cursor).toBe('pointer');
    expect(highlighted.changesBeforeAction).toBe(true);
    // The title-bar help button opens a real keyboard-contained popup whose
    // Markdown/Macros/Shortcuts topics use the normal accessible tab pattern; the closed
    // popup contributes no invisible controls to the Tab order.
    const cheatsheet = page.locator('#md-cheatsheet-trigger');
    await expect(cheatsheet).toHaveCSS('cursor', 'pointer');
    await cheatsheet.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#md-help-search')).toBeFocused();
    const helpPopup = page.locator('#md-cheatsheet-popup');
    await helpPopup.evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
    });
    const markdownHelpGeometry = await helpPopup.boundingBox();
    expect(markdownHelpGeometry.width).toBeGreaterThanOrEqual(600);
    expect(markdownHelpGeometry.height).toBeGreaterThanOrEqual(500);
    await page.locator('#md-help-macros-tab').click();
    await expect(page.locator('#md-help-macros-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#md-help-macros-panel')).toBeVisible();
    await expect(page.locator('#md-help-markdown-panel')).toBeHidden();
    expect(await helpPopup.boundingBox()).toEqual(markdownHelpGeometry);
    await page.locator('#md-help-macros-tab').press('ArrowLeft');
    await expect(page.locator('#md-help-markdown-tab')).toBeFocused();
    await expect(page.locator('#md-help-markdown-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#md-cheatsheet-popup')).toBeHidden();
    await expect(cheatsheet).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#md-help-search')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#md-cheatsheet-popup')).toBeHidden();
    await expect(page.locator('#topbar-settings')).toBeFocused();
    await gitStatus.focus();
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
        const fence = String.fromCharCode(96).repeat(3);
        await openPDFPreview({
            path: 'Welcome.md',
            title: 'Welcome',
            content: `# Worker preview\n\nA responsive editor stays responsive.\n\n${fence}javascript\nconst answer = 42;\n${fence}`,
        });
    });

    await expect.poll(() => page.evaluate(() => window.__pdfWorkerRequests.length)).toBe(1);
    await expect.poll(() => page.locator('.pdf-preview-status').textContent()).toContain('Live preview up to date');
    const preview = page.frameLocator('.pdf-preview-frame');
    await expect(preview.locator('.figaro-print-code .hljs-keyword')).toHaveText('const');
    await expect(preview.locator('.figaro-print-code .hljs-keyword')).toHaveCSS('color', 'rgb(207, 34, 46)');
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
    await page.locator('#history-count').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.history-item')).toHaveCount(2);
    await expect(page.locator('.history-list')).toHaveAttribute('role', 'listbox');
    await page.locator('.history-item').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.history-item').nth(1)).toBeFocused();
    await expect(page.locator('.history-item').nth(1)).toHaveAttribute('aria-selected', 'true');
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

test('keeps native status actions link-like and opens them from the keyboard', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const backend = (await import('/js/backend.js')).backend();
        const history = await import('/js/historyPanel.js');
        const relationships = await import('/js/backlinks.js');
        backend.GetCommitCount = async () => 8;
        backend.GetFileHistory = async () => [{ hash: 'latest', timestamp: 200, message: 'latest' }];
        backend.SearchBacklinks = async () => [{
            path: 'Linked.md', name: 'Linked.md', line_num: 1,
            context: 'See [Welcome](Welcome.md).', match_text: 'Welcome',
        }];
        backend.SearchUnlinkedMentions = async () => [];
        await history.updateHistoryCount('Welcome.md');
        await relationships.updateBacklinksForActiveTab();
    });

    const historyButton = page.locator('#history-count');
    const backlinksButton = page.locator('#backlinks-status');
    await expect(historyButton).toHaveText('8 changes');
    await expect(backlinksButton).toHaveText('1 backlink');
    for (const button of [historyButton, backlinksButton]) {
        await expect(button).toBeEnabled();
        expect(await button.evaluate(element => ({
            tag: element.tagName,
            cursor: getComputedStyle(element).cursor,
            background: getComputedStyle(element).backgroundColor,
        }))).toEqual({ tag: 'BUTTON', cursor: 'pointer', background: 'rgba(0, 0, 0, 0)' });
    }

    await historyButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#right-sidebar-title')).toHaveText('History');
    await expect(page.locator('.history-list')).toBeVisible();
    await page.locator('#right-sidebar-close').click();

    await backlinksButton.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.backlinks-view-wrapper')).toBeVisible();
});

test('keeps Markdown link syntax together and Figaro macros in their own help topic', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.locator('#md-cheatsheet-trigger').click();
    const rows = await page.locator('#md-help-markdown-panel tr').allTextContents();
    const markdownIndex = rows.findIndex(row => row.includes('[text](file.md)'));
    const wikiIndex = rows.findIndex(row => row.includes('[[wikilink.md|wikilink]]'));
    expect(wikiIndex).toBe(markdownIndex + 1);
    await expect(page.locator('#md-help-markdown-panel')).not.toContainText('@today');

    await page.locator('#md-help-macros-tab').click();
    await expect(page.locator('#md-help-macros-panel')).toContainText('@today');
    await expect(page.locator('#md-help-macros-panel')).toContainText('#custom-column');
    await expect(page.locator('#md-help-macros-panel')).toContainText('[due YYYY-MM-DD](YYYY-MM-DD.md)');
});

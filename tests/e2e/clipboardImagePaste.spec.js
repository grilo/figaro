import { expect, test } from '@playwright/test';

const tinyPNGBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('pastes a clipboard screenshot beside the note, renders it, and preserves adjacent cursor movement', async ({ page }) => {
    await page.route('**/vault/notes/image1.png', route => route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(tinyPNGBase64, 'base64'),
    }));
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async ({ png }) => {
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        const app = (await import('/js/backend.js')).backend();
        window.__clipboardImageCalls = [];

        await editor.initEditor();
        const view = editor.createEditorView();
		tabs.openTab('capture', 'Capture', 'file', { path: 'notes/capture.md', mtime: 1, isNew: true });
		while (editor.getEditorDocumentTabId() !== 'capture') {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
		editor.setEditorContent('Before\n\nAfter', 'capture');
		while (view.state.doc.toString() !== 'Before\n\nAfter') {
			await new Promise(resolve => setTimeout(resolve, 10));
		}
        app.SaveClipboardImage = async (notePath, mimeType, encodedData) => {
            window.__clipboardImageCalls.push({ notePath, mimeType, encodedData });
            return {
                success: true,
                path: 'notes/image1.png',
                markdown: '![Image1](image1.png)',
            };
        };
        app.GetFileTree = async () => [];
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();

        const bytes = Uint8Array.from(atob(png), character => character.charCodeAt(0));
        const image = new File([bytes], 'Screenshot.png', { type: 'image/png' });
        const transfer = new DataTransfer();
        transfer.items.add(image);
        view.contentDOM.dispatchEvent(new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        }));
        window.__clipboardImageView = view;
    }, { png: tinyPNGBase64 });

    await expect.poll(() => page.evaluate(() => window.__clipboardImageView.state.doc.toString()))
        .toBe('Before\n![Image1](image1.png)\nAfter');
    expect(await page.evaluate(() => window.__clipboardImageCalls.map(call => ({
        notePath: call.notePath,
        mimeType: call.mimeType,
        validPNG: call.encodedData.startsWith('iVBORw0KGgo'),
    })))).toEqual([{ notePath: 'notes/capture.md', mimeType: 'image/png', validPNG: true }]);
    expect(await page.evaluate(() => {
        const view = window.__clipboardImageView;
        const selection = view.state.selection.main;
        return {
            line: view.state.doc.lineAt(selection.head).number,
            column: selection.head - view.state.doc.lineAt(selection.head).from,
        };
    })).toEqual({ line: 2, column: '![Image1](image1.png)'.length });

    // Move away from the source so codemirror-live-markdown replaces it with
    // the rendered image using the note-relative /vault/notes base path.
    await page.evaluate(() => {
        const view = window.__clipboardImageView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
    });
    const renderedImage = page.locator('.cm-editor img[src$="/vault/notes/image1.png"]');
    await expect(renderedImage).toBeVisible();
    await expect(renderedImage).toHaveAttribute('alt', 'Image1');

    // The existing image widget must still hand Arrow movement to the exact
    // adjacent source lines after the asynchronous paste transaction.
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => {
        const view = window.__clipboardImageView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => {
        const view = window.__clipboardImageView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(3);

    const previewHTML = await page.evaluate(async () => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        const printable = pdf.renderPrintableMarkdown('![Image1](image1.png)', 'Screenshot note');
        return preview.buildPDFPreviewDocument(printable, { notePath: 'notes/capture.md' });
    });
    await page.setContent(previewHTML, { waitUntil: 'load' });
    const previewImage = page.locator('.figaro-print-document img[alt="Image1"]');
    await expect(previewImage).toBeVisible();
    await expect(previewImage).toHaveJSProperty('naturalWidth', 1);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(4000);
});

// Pointer capture, computed writing edges, and CodeMirror's retained widget DOM
// are browser-only boundaries; pure sizing and syntax matrices stay in unit tests.
test('resizes a rendered image in place and preserves its source-reveal geometry', async ({ page }) => {
    await page.route('**/vault/notes/portrait.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="153" viewBox="0 0 240 153"><rect width="240" height="153" fill="#7689d8"/></svg>',
    }));
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    const source = 'Before\n![Portrait|190x121](portrait.svg)\nAfter';
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        await editor.initEditor();
        const view = editor.getEditorView() || editor.createEditorView();
        tabs.openTab('sized-image', 'Sized image', 'file', {
            path: 'notes/sized-image.md',
            isNew: true,
        });
        while (editor.getEditorDocumentTabId() !== 'sized-image') {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        editor.setEditorContent(text, 'sized-image');
        while (view.state.doc.toString() !== text) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
        window.__sizedImageView = view;
    }, source);

    const widget = page.locator('.cm-image-widget');
    const frame = widget.locator('.cm-image-resize-frame');
    const image = frame.locator('img');
    const widthHandle = frame.locator('[data-resize-mode="width"]');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('alt', 'Portrait');
    await expect(frame.locator('.cm-image-resize-handle')).toHaveCount(3);
    await expect(frame).toHaveCSS('width', '190px');
    await expect(frame).toHaveCSS('height', '121px');

    await widget.hover();
    await page.getByRole('button', { name: 'Collapse image' }).click();
    await expect(widget).toHaveCount(0);
    await expect(page.locator('.cm-image-source-placeholder')).toHaveCount(0);
    await expect(page.locator('.cm-foldPlaceholder')).toBeVisible();
    expect(await page.locator('.cm-foldPlaceholder').evaluate(placeholder => (
        placeholder.closest('.cm-line').getBoundingClientRect().height
    ))).toBeLessThan(40);
    await page.getByRole('button', { name: 'Expand image' }).click();
    await expect(image).toBeVisible();
    await expect(frame).toHaveCSS('height', '121px');

    await widget.hover();
    const widthBox = await widthHandle.boundingBox();
    expect(widthBox.width).toBe(28);
    expect(widthBox.height).toBe(28);
    await expect(widthHandle).toHaveCSS('border-top-width', '0px');
    await page.mouse.move(widthBox.x + widthBox.width / 2, widthBox.y + widthBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(widthBox.x + widthBox.width / 2 + 1200, widthBox.y + widthBox.height / 2, {
        steps: 12,
    });
    await expect(widget).toHaveClass(/is-resizing/);
    await expect(frame.locator('.cm-image-resize-readout')).toBeVisible();
    await expect(frame.locator('.cm-image-resize-readout')).toHaveText(/\d+ × 121/);
    await expect(widthHandle).not.toHaveAttribute('data-ui-tooltip');
    expect(await page.evaluate(() => window.__sizedImageView.state.doc.toString())).toBe(source);
    await page.mouse.up();
    await expect(widthHandle).toHaveAttribute('data-ui-tooltip', 'Resize image width');

    const horizontal = await page.evaluate(() => {
        const view = window.__sizedImageView;
        const rendered = document.querySelector('.cm-image-resize-frame').getBoundingClientRect();
        const writing = document.querySelector('.cm-image-widget').getBoundingClientRect();
        return {
            source: view.state.doc.toString(),
            rightGap: writing.right - rendered.right,
            height: rendered.height,
            selectionLine: view.state.doc.lineAt(view.state.selection.main.head).number,
            sourceVisible: Boolean(document.querySelector('.cm-image-source')),
        };
    });
    expect(horizontal.source).toMatch(/!\[Portrait\|\d+x121\]\(portrait\.svg\)/);
    expect(horizontal.rightGap).toBeGreaterThanOrEqual(-1);
    expect(horizontal.rightGap).toBeLessThanOrEqual(1);
    expect(horizontal.height).toBeCloseTo(121, 0);
    expect(horizontal.selectionLine).toBe(1);
    expect(horizontal.sourceVisible).toBe(false);

    await widget.hover();
    const originalSize = page.getByRole('button', { name: 'Restore original image size' });
    await expect(originalSize).toBeEnabled();
    await originalSize.click();
    await expect.poll(() => page.evaluate(() => window.__sizedImageView.state.doc.toString()))
        .toBe('Before\n![Portrait](portrait.svg)\nAfter');
    await expect(frame).toHaveCSS('width', '240px');
    await expect(frame).toHaveCSS('height', '153px');

    const heightHandle = frame.locator('[data-resize-mode="height"]');
    await widget.hover();
    const heightBox = await heightHandle.boundingBox();
    await page.mouse.move(heightBox.x + heightBox.width / 2, heightBox.y + heightBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(heightBox.x + heightBox.width / 2, heightBox.y + heightBox.height / 2 + 1000, {
        steps: 12,
    });
    await page.mouse.up();

    const beforeReveal = await page.evaluate(() => {
        const view = window.__sizedImageView;
        const rendered = document.querySelector('.cm-image-resize-frame').getBoundingClientRect();
        return {
            source: view.state.doc.toString(),
            height: rendered.height,
            editorClientHeight: view.scrollDOM.clientHeight,
            followingTop: view.coordsAtPos(view.state.doc.line(3).from).top,
        };
    });
    expect(beforeReveal.source).toMatch(/!\[Portrait\|240x\d+\]\(portrait\.svg\)/);
    expect(beforeReveal.height).toBeGreaterThan(beforeReveal.editorClientHeight);

    await image.click({ position: { x: 20, y: 20 } });
    const sourcePlaceholder = page.locator('.cm-image-source-placeholder');
    await expect(sourcePlaceholder).toBeVisible();
    const afterReveal = await page.evaluate(() => {
        const view = window.__sizedImageView;
        const placeholder = document.querySelector('.cm-image-source-placeholder').getBoundingClientRect();
        return {
            placeholderHeight: placeholder.height,
            followingTop: view.coordsAtPos(view.state.doc.line(3).from).top,
            source: view.state.doc.toString(),
        };
    });
    expect(afterReveal.placeholderHeight).toBeCloseTo(beforeReveal.height, 0);
    expect(afterReveal.followingTop).toBeCloseTo(beforeReveal.followingTop, 0);
    expect(afterReveal.source).toBe(beforeReveal.source);

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => window.__sizedImageView.state.doc.lineAt(
        window.__sizedImageView.state.selection.main.head,
    ).number)).toBe(2);
});

test('themes a missing-image state and preserves its source-line geometry', async ({ page }) => {
    await page.route('**/vault/notes/missing.png', route => route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'missing',
    }));
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    const source = 'Before\n![Missing](missing.png)\nAfter';
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        await editor.initEditor();
        const view = editor.getEditorView() || editor.createEditorView();
        tabs.openTab('missing-image', 'Missing image', 'file', {
            path: 'notes/missing-image.md',
            isNew: true,
        });
        while (editor.getEditorDocumentTabId() !== 'missing-image') {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        editor.setEditorContent(text, 'missing-image');
        while (view.state.doc.toString() !== text) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
        window.__missingImageView = view;
    }, source);

    const error = page.locator('.cm-image-error');
    await expect(error).toBeVisible();
    const renderedAfterY = await page.evaluate(() => {
        const view = window.__missingImageView;
        return view.coordsAtPos(view.state.doc.line(3).from).top;
    });

    const themeStates = [];
    for (const theme of ['default', 'figaro-light', 'figaro-crt-phosphor']) {
        themeStates.push(await page.evaluate(async themeID => {
            const css = await (await fetch(`/themes/${themeID}.css`)).text();
            document.getElementById('theme-style').textContent = css;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const element = document.querySelector('.cm-image-error');
            const style = getComputedStyle(element);
            const probe = document.createElement('span');
            probe.style.color = 'var(--danger-color)';
            document.body.appendChild(probe);
            const danger = getComputedStyle(probe).color;
            probe.remove();
            return {
                background: style.backgroundColor,
                color: style.color,
                danger,
                height: element.getBoundingClientRect().height,
            };
        }, theme));
    }
    for (const state of themeStates) {
        expect(state.background).not.toBe('rgb(253, 232, 232)');
        expect(state.color.toLowerCase()).toBe(state.danger.toLowerCase());
        expect(state.height).toBeGreaterThan(20);
        expect(state.height).toBeLessThan(30);
    }
    expect(new Set(themeStates.map(state => state.background)).size).toBe(3);

    const errorBox = await error.boundingBox();
    await page.mouse.click(errorBox.x + errorBox.width / 2, errorBox.y + errorBox.height / 2);
    await expect(error).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
        const view = window.__missingImageView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);
    const sourceAfterY = await page.evaluate(() => {
        const view = window.__missingImageView;
        return view.coordsAtPos(view.state.doc.line(3).from).top;
    });
    expect(Math.abs(sourceAfterY - renderedAfterY)).toBeLessThanOrEqual(2);

    await page.evaluate(() => {
        const view = window.__missingImageView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
    });
    await expect(error).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__missingImageView.state.doc.lineAt(
        window.__missingImageView.state.selection.main.head,
    ).number)).toBe(2);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__missingImageView.state.doc.lineAt(
        window.__missingImageView.state.selection.main.head,
    ).number)).toBe(3);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__missingImageView.state.doc.lineAt(
        window.__missingImageView.state.selection.main.head,
    ).number)).toBe(2);

    await page.evaluate(() => {
        const view = window.__missingImageView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
    });
    await expect(error).toBeVisible();
    const dragPoints = await page.evaluate(() => {
        const view = window.__missingImageView;
        const start = view.coordsAtPos(view.state.doc.line(1).from + 1);
        const end = view.coordsAtPos(view.state.doc.line(3).to);
        return {
            start: { x: start.left + 1, y: (start.top + start.bottom) / 2 },
            end: { x: end.left - 1, y: (end.top + end.bottom) / 2 },
        };
    });
    await page.mouse.move(dragPoints.start.x, dragPoints.start.y);
    await page.mouse.down();
    await page.mouse.move(dragPoints.end.x, dragPoints.end.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
        const view = window.__missingImageView;
        const selection = view.state.selection.main;
        return selection.from <= view.state.doc.line(2).from
            && selection.to >= view.state.doc.line(2).to;
    })).toBe(true);
});

test('guides Draw.io images and invalidates their preview after file-tree deletion', async ({ page }) => {
    await page.route('**/vault/notes/flow.drawio.svg*', route => route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'missing',
    }));
    await page.route('https://embed.diagrams.net/**', route => route.abort());
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    const source = 'Before\n![Flow](flow.drawio.svg)\nAfter';
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        const tabs = await import('/js/tabManager.js');
        const app = (await import('/js/backend.js')).backend();
        window.__drawioImageCreateCalls = [];
        window.__drawioImageExists = false;
        window.__drawioImageContent = '';
        app.CreateFile = async (path, content) => {
            window.__drawioImageCreateCalls.push({ path, content });
            window.__drawioImageExists = true;
            return { success: true, path, mtime: 37 };
        };
        app.GetFileTree = () => new Promise(resolve => {
            window.__releaseDrawioImageTreeRefresh = () => resolve([{
                name: 'flow.drawio.svg',
                path: 'notes/flow.drawio.svg',
                type: 'file',
                mtime: 37,
            }]);
        });
        app.ReadDiagram = async path => window.__drawioImageExists
            ? { path, content: window.__drawioImageContent, mtime: 37 }
            : null;

        await editor.initEditor();
        const view = editor.getEditorView() || editor.createEditorView();
        tabs.openTab('drawio-image-note', 'Draw.io image', 'file', {
            path: 'notes/drawio-image.md',
            isNew: true,
        });
        while (editor.getEditorDocumentTabId() !== 'drawio-image-note') {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        editor.setEditorContent(text, 'drawio-image-note');
        while (view.state.doc.toString() !== text) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
        window.__drawioImageCreateView = view;
    }, source);

    const action = page.getByRole('button', { name: 'Create Draw.io diagram flow.drawio.svg' });
    await expect(action).toBeVisible();
    await expect(action).toHaveClass(/ui-button--accent/);
    await action.click();

    await expect.poll(() => page.evaluate(() => window.__drawioImageCreateCalls))
        .toEqual([{ path: 'notes/flow.drawio.svg', content: '' }]);
    await expect.poll(() => page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        const active = tabs.getActiveTab();
        return active && { type: active.type, path: active.path, title: active.title };
    })).toEqual({
        type: 'drawio',
        path: 'notes/flow.drawio.svg',
        title: 'flow.drawio.svg',
    });
    expect(await page.evaluate(() => window.__drawioImageCreateView.state.doc.toString())).toBe(source);

    await page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        await tabs.closeTab(tabs.getActiveTab().id);
    });
    await expect.poll(() => page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        const active = tabs.getActiveTab();
        return active && { type: active.type, path: active.path };
    })).toEqual({ type: 'file', path: 'notes/drawio-image.md' });

    const reopen = page.getByRole('button', { name: 'Open Draw.io diagram flow.drawio.svg' });
    await expect(reopen).toBeVisible();
    await expect(page.getByText('Creating diagram…')).toHaveCount(0);
    await reopen.click();
    await expect.poll(() => page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        const active = tabs.getActiveTab();
        return active && { type: active.type, path: active.path };
    })).toEqual({ type: 'drawio', path: 'notes/flow.drawio.svg' });
    expect(await page.evaluate(() => window.__drawioImageCreateCalls)).toEqual([
        { path: 'notes/flow.drawio.svg', content: '' },
    ]);

    await page.evaluate(async () => {
        window.__drawioImageContent = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40">',
            '<rect width="80" height="40" fill="#4f8"/>',
            '</svg>',
        ].join('');
        const tabs = await import('/js/tabManager.js');
        await tabs.closeTab(tabs.getActiveTab().id);
    });
    await expect(page.locator('.cm-image-widget img[alt="Flow"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Draw\.io diagram flow\.drawio\.svg/ }))
        .toHaveCount(0);

    const foldDiagram = page.getByRole('button', { name: 'Collapse Draw.io image' });
    const editDiagram = page.getByRole('button', { name: 'Open Draw.io editor for this diagram' });
    await page.locator('.cm-image-widget img[alt="Flow"]').hover();
    await expect(foldDiagram).toBeVisible();
    await expect(editDiagram).toBeVisible();
    await foldDiagram.click();
    await expect(page.locator('.cm-image-widget')).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand Draw.io image' }).click();
    await expect(page.locator('.cm-image-widget img[alt="Flow"]')).toBeVisible();

    await page.locator('.cm-image-widget img[alt="Flow"]').hover();
    await editDiagram.click();
    await expect.poll(() => page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        const active = tabs.getActiveTab();
        return active && { type: active.type, path: active.path };
    })).toEqual({ type: 'drawio', path: 'notes/flow.drawio.svg' });
    await page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        await tabs.closeTab(tabs.getActiveTab().id);
    });
    await expect(page.locator('.cm-image-widget img[alt="Flow"]')).toBeVisible();

    await page.evaluate(() => {
        window.__drawioImageExists = false;
        window.__drawioImageContent = '';
        document.dispatchEvent(new CustomEvent('vault-path-deleted', {
            detail: { path: 'notes/flow.drawio.svg', type: 'file' },
        }));
    });
    await expect(page.locator('.cm-image-widget img[alt="Flow"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create Draw.io diagram flow.drawio.svg' }))
        .toBeVisible();
    await page.evaluate(() => window.__releaseDrawioImageTreeRefresh());
});

test('uses Async Clipboard bytes when a Linux-style paste event exposes no image File', async ({ page }) => {
    await page.goto('/');
	await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async ({ png }) => {
        const state = await import('/js/state.js');
        const editor = await import('/js/editor.js');
        const app = (await import('/js/backend.js')).backend();
        await editor.initEditor();
        const view = editor.getEditorView() || editor.createEditorView();
        const tab = { id: 'linux-clipboard', type: 'file', path: 'notes/linux-clipboard.md', title: 'Linux clipboard' };
        state.setState('openTabs', [tab]);
        state.setState('activeTabId', tab.id);
        editor.setEditorContent('', tab.id);
        while (editor.getEditorDocumentTabId() !== tab.id) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        const bytes = Uint8Array.from(atob(png), character => character.charCodeAt(0));
        const image = new Blob([bytes], { type: 'image/png' });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { read: async () => [{ types: ['image/png'], getType: async () => image }] },
        });
        window.__linuxClipboardCalls = [];
        app.SaveClipboardImage = async (notePath, mimeType, encodedData) => {
            window.__linuxClipboardCalls.push({ notePath, mimeType, encodedData });
            return { success: true, path: 'notes/image1.png', markdown: '![Image1](image1.png)' };
        };

        const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(paste, 'clipboardData', {
            value: {
                types: ['image/png'],
                items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }],
                files: [],
            },
        });
        view.contentDOM.dispatchEvent(paste);
        window.__linuxClipboardPrevented = paste.defaultPrevented;
        window.__linuxClipboardView = view;
    }, { png: tinyPNGBase64 });

    await expect.poll(() => page.evaluate(() => window.__linuxClipboardView.state.doc.toString()))
        .toBe('![Image1](image1.png)');
    expect(await page.evaluate(() => ({
        prevented: window.__linuxClipboardPrevented,
        calls: window.__linuxClipboardCalls.map(call => ({
            notePath: call.notePath,
            mimeType: call.mimeType,
            validPNG: call.encodedData.startsWith('iVBORw0KGgo'),
        })),
    }))).toEqual({
        prevented: true,
        calls: [{ notePath: 'notes/linux-clipboard.md', mimeType: 'image/png', validPNG: true }],
    });
});

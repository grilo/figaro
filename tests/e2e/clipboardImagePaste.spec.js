import { expect, test } from '@playwright/test';

const tinyPNGBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('pastes a clipboard screenshot beside the note, renders it, and preserves adjacent cursor movement', async ({ page }) => {
    await page.route('**/vault/notes/image1.png', route => route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(tinyPNGBase64, 'base64'),
    }));
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true && typeof window.pywebview?.api?.save_clipboard_image === 'function');

    await page.evaluate(async ({ png }) => {
        const editor = await import('/js/editor.js');
		const tabs = await import('/js/tabManager.js');
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
        window.pywebview.api.save_clipboard_image = async (notePath, mimeType, encodedData) => {
            window.__clipboardImageCalls.push({ notePath, mimeType, encodedData });
            return {
                success: true,
                path: 'notes/image1.png',
                markdown: '![Image1](image1.png)',
            };
        };
        window.pywebview.api.get_file_tree = async () => [];
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

test('uses Async Clipboard bytes when a Linux-style paste event exposes no image File', async ({ page }) => {
    await page.goto('/');
	await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async ({ png }) => {
        const state = await import('/js/state.js');
        const editor = await import('/js/editor.js');
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
        window.pywebview.api.save_clipboard_image = async (notePath, mimeType, encodedData) => {
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

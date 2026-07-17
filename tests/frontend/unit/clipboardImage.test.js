var mockState = {
    activeTabId: 'capture-tab',
    openTabs: [{ id: 'capture-tab', type: 'file', path: 'notes/capture.md' }],
};

jest.mock('../frontend/js/state.js', () => ({
    getState: jest.fn(key => mockState[key]),
    setState: jest.fn(),
    subscribe: jest.fn(),
}));

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() },
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    errorDialog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../frontend/js/log.js', () => ({
    log: { warn: jest.fn() },
}));

jest.mock('../frontend/js/fileTree.js', () => ({
    refreshFileTree: jest.fn().mockResolvedValue(undefined),
}));

import { errorDialog } from '../frontend/js/dialogs.js';
import { refreshFileTree } from '../frontend/js/fileTree.js';
import {
    MAX_CLIPBOARD_IMAGE_BYTES,
    clipboardImageBase64,
    clipboardImageFile,
    handleClipboardImagePaste,
    pasteClipboardImage,
    readClipboardImage,
    shouldReadClipboardImageAsync,
} from '../frontend/js/clipboardImage.js';

function testView(text = 'Before selected after') {
    const view = {
        isDestroyed: false,
        state: {
            doc: { toString: () => text },
            selection: { main: { from: 7, to: 15 } },
        },
        dispatch: jest.fn(),
    };
    return view;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockState = {
        activeTabId: 'capture-tab',
        openTabs: [{ id: 'capture-tab', type: 'file', path: 'notes/capture.md' }],
    };
    window.pywebview.api.save_clipboard_image = jest.fn().mockResolvedValue({
        success: true,
        path: 'notes/image1.png',
        markdown: '![Image1](image1.png)',
    });
    window.pywebview.api.get_file_tree.mockResolvedValue([]);
});

describe('clipboard image paste', () => {
    test('finds an image clipboard item without claiming normal text pastes', () => {
        const image = new File([new Uint8Array([1, 2, 3])], 'screenshot.png', { type: 'image/png' });
        const imageItem = { kind: 'file', type: 'image/png', getAsFile: () => image };
        const textItem = { kind: 'string', type: 'text/plain', getAsFile: () => null };

        expect(clipboardImageFile({ items: [textItem, imageItem] })).toBe(image);
        expect(clipboardImageFile({ items: [textItem] })).toBeNull();

        const preventDefault = jest.fn();
        expect(handleClipboardImagePaste({ clipboardData: { items: [textItem] }, preventDefault }, testView())).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
    });

    test('accepts WebKitGTK image files whose paste metadata omits the MIME type', () => {
        const image = new File([new Uint8Array([1, 2, 3])], 'screenshot', { type: '' });
        const item = { kind: 'file', type: '', getAsFile: () => image };

        expect(clipboardImageFile({ items: [item] })).toBe(image);
    });

    test('uses Async Clipboard image data when WebKitGTK does not expose a paste File', async () => {
        const image = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
        const read = jest.fn().mockResolvedValue([{
            types: ['image/png'],
            getType: jest.fn().mockResolvedValue(image),
        }]);
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
        const preventDefault = jest.fn();
        const view = testView();

        try {
            expect(handleClipboardImagePaste({
                clipboardData: {
                    types: ['image/png'],
                    items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }],
                },
                preventDefault,
            }, view)).toBe(true);
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(preventDefault).toHaveBeenCalledTimes(1);
            expect(read).toHaveBeenCalledTimes(1);
            expect(window.pywebview.api.save_clipboard_image).toHaveBeenCalledWith(
                'notes/capture.md',
                'image/png',
                'AQIDBA=='
            );
            expect(view.dispatch).toHaveBeenCalled();
        } finally {
            if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
            else delete navigator.clipboard;
        }
    });

    test('does not invoke the Linux fallback for an ordinary text paste', () => {
        const clipboard = { read: jest.fn() };
        expect(shouldReadClipboardImageAsync(
            { types: ['text/plain'] },
            'Mozilla/5.0 (X11; Linux) AppleWebKit/605.1',
            clipboard
        )).toBe(false);
        expect(clipboard.read).not.toHaveBeenCalled();
    });

    test('reads the first image representation from the Async Clipboard API', async () => {
        const png = new Blob([new Uint8Array([9])], { type: 'image/png' });
        const clipboard = { read: jest.fn().mockResolvedValue([
            { types: ['text/plain'], getType: jest.fn() },
            { types: ['image/png'], getType: jest.fn().mockResolvedValue(png) },
        ]) };

        await expect(readClipboardImage(clipboard)).resolves.toBe(png);
    });

    test('encodes the clipboard file, saves it beside the note, and replaces the selection with relative Markdown', async () => {
        const image = new File([new Uint8Array([1, 2, 3, 4])], 'screenshot.png', { type: 'image/png' });
        const view = testView();

        await expect(pasteClipboardImage(view, image)).resolves.toBe(true);

        expect(window.pywebview.api.save_clipboard_image).toHaveBeenCalledWith(
            'notes/capture.md',
            'image/png',
            'AQIDBA=='
        );
        expect(view.dispatch).toHaveBeenCalledWith({
            changes: { from: 7, to: 15, insert: '![Image1](image1.png)' },
            selection: { anchor: 7 + '![Image1](image1.png)'.length },
            scrollIntoView: true,
            userEvent: 'input.paste',
        });
        expect(refreshFileTree).toHaveBeenCalled();
        expect(errorDialog).not.toHaveBeenCalled();
    });

    test('claims an image paste event synchronously to suppress native file URLs', () => {
        const image = { type: 'image/png', size: MAX_CLIPBOARD_IMAGE_BYTES + 1 };
        const preventDefault = jest.fn();

        expect(handleClipboardImagePaste({
            clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }] },
            preventDefault,
        }, testView())).toBe(true);
        expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    test('does not insert Markdown when persistence fails', async () => {
        window.pywebview.api.save_clipboard_image.mockResolvedValueOnce({ success: false, error: 'Disk is full' });
        const image = new File([new Uint8Array([1, 2])], 'screenshot.png', { type: 'image/png' });
        const view = testView();

        await expect(pasteClipboardImage(view, image)).resolves.toBe(false);

        expect(view.dispatch).not.toHaveBeenCalled();
        expect(errorDialog).toHaveBeenCalledWith(
            'Couldn’t paste image',
            expect.objectContaining({ message: 'Disk is full' }),
            'The clipboard image could not be saved.'
        );
    });

    test('rejects oversized images before encoding or calling the backend', async () => {
        const image = { type: 'image/png', size: MAX_CLIPBOARD_IMAGE_BYTES + 1 };
        const view = testView();

        await expect(pasteClipboardImage(view, image)).resolves.toBe(false);

        expect(window.pywebview.api.save_clipboard_image).not.toHaveBeenCalled();
        expect(view.dispatch).not.toHaveBeenCalled();
        expect(errorDialog).toHaveBeenCalledWith(
            'Couldn’t paste image',
            'Clipboard images must be 25 MB or smaller.',
            'The clipboard image could not be saved.'
        );
    });

    test('base64 helper preserves binary bytes', async () => {
        const image = new Blob([new Uint8Array([0, 255, 7, 128])], { type: 'image/png' });
        await expect(clipboardImageBase64(image)).resolves.toBe('AP8HgA==');
    });
});

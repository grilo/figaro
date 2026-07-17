import { errorDialog } from './dialogs.js';
import { log } from './log.js';
import { getState } from './state.js';
import { statusBar } from './statusBar.js';

export const MAX_CLIPBOARD_IMAGE_BYTES = 25 * 1024 * 1024;

/** Return the first image file supplied by a native clipboard paste event. */
export function clipboardImageFile(clipboardData) {
    const items = Array.from(clipboardData?.items || []);
    for (const item of items) {
        if (item?.kind !== 'file') continue;
        const file = item.getAsFile?.();
        if (!file) continue;
        const itemType = String(item.type || '').toLowerCase();
        const fileType = String(file.type || '').toLowerCase();
        // WebKitGTK may expose raw screenshot bytes as an unnamed File with
        // no MIME metadata. Go performs the authoritative byte sniff later.
        if (itemType.startsWith('image/') || fileType.startsWith('image/') || (!itemType && !fileType)) {
            return file;
        }
    }
    return Array.from(clipboardData?.files || []).find(file => {
        const type = String(file?.type || '').toLowerCase();
        return type.startsWith('image/') || !type;
    }) || null;
}

function clipboardTypes(clipboardData) {
    return Array.from(clipboardData?.types || clipboardData?.items || [])
        .map(value => String(value?.type || value || '').toLowerCase())
        .filter(Boolean);
}

/** Read the first raw image exposed by the modern Async Clipboard API. */
export async function readClipboardImage(clipboard = navigator.clipboard) {
    if (typeof clipboard?.read !== 'function') return null;
    const entries = await clipboard.read();
    for (const entry of entries || []) {
        const type = Array.from(entry?.types || []).find(candidate =>
            String(candidate || '').toLowerCase().startsWith('image/'));
        if (!type) continue;
        const blob = await entry.getType(type);
        if (blob) return blob;
    }
    return null;
}

/**
 * Older WebKitGTK paste events can omit the image File even when raw image
 * data is on the clipboard. Claim only image-advertising or otherwise empty
 * Linux/WebKit events, so normal text and rich-text paste still fall through.
 */
export function shouldReadClipboardImageAsync(clipboardData, userAgent = navigator.userAgent, clipboard = navigator.clipboard) {
    if (typeof clipboard?.read !== 'function') return false;
    const types = clipboardTypes(clipboardData);
    if (types.some(type => type.startsWith('image/'))) return true;
    if (types.some(type => ['text/plain', 'text/html', 'text/uri-list'].includes(type))) return false;
    return /linux/i.test(String(userAgent || '')) && /applewebkit/i.test(String(userAgent || ''));
}

/** Encode a browser Blob for the JSON-safe Wails bridge. */
export function clipboardImageBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Could not read the clipboard image.'));
        reader.onload = () => {
            const dataURL = String(reader.result || '');
            const separator = dataURL.indexOf(',');
            if (separator < 0) {
                reject(new Error('The clipboard image could not be encoded.'));
                return;
            }
            resolve(dataURL.slice(separator + 1));
        };
        reader.readAsDataURL(blob);
    });
}

function activeFileTab() {
    return (getState('openTabs') || []).find(tab =>
        tab.id === getState('activeTabId') && tab.type === 'file' && tab.path
    ) || null;
}

async function refreshPastedImageInTree() {
    try {
        const { refreshFileTree } = await import('./fileTree.js');
        await refreshFileTree();
    } catch (error) {
        log.warn('Pasted image was saved, but the file tree could not refresh:', error);
    }
}

function reportImagePasteFailure(error) {
    statusBar.set('Image paste failed');
    void errorDialog('Couldn’t paste image', error, 'The clipboard image could not be saved.');
}

/** Save one clipboard image beside the active note and insert its Markdown. */
export async function pasteClipboardImage(view, imageFile) {
    const tab = activeFileTab();
    if (!tab) {
        reportImagePasteFailure('Open a Markdown file before pasting an image.');
        return false;
    }
    const declaredType = String(imageFile?.type || '').toLowerCase();
    if (!imageFile || (declaredType && !declaredType.startsWith('image/'))) return false;
    if (Number(imageFile.size) > MAX_CLIPBOARD_IMAGE_BYTES) {
        reportImagePasteFailure('Clipboard images must be 25 MB or smaller.');
        return false;
    }

    const originalDocument = view.state.doc.toString();
    const originalRange = view.state.selection.main;
    statusBar.set('Saving pasted image…');
    try {
        const encodedData = await clipboardImageBase64(imageFile);
        const result = await window.pywebview.api.save_clipboard_image(tab.path, imageFile.type || '', encodedData);
        if (!result?.success || !result?.markdown) {
            throw new Error(result?.error || 'The clipboard image could not be saved.');
        }

        const currentTab = activeFileTab();
        if (!currentTab || currentTab.id !== tab.id || currentTab.path !== tab.path || view.isDestroyed) {
            await refreshPastedImageInTree();
            statusBar.set(`Saved ${result.path || 'pasted image'}; return to the original note to insert it`);
            return false;
        }

        const range = view.state.doc.toString() === originalDocument
            ? originalRange
            : view.state.selection.main;
        const markdown = String(result.markdown);
        view.dispatch({
            changes: { from: range.from, to: range.to, insert: markdown },
            selection: { anchor: range.from + markdown.length },
            scrollIntoView: true,
            userEvent: 'input.paste',
        });
        await refreshPastedImageInTree();
        statusBar.set(`Pasted ${result.path || 'image'}`);
        setTimeout(() => statusBar.set('Ready'), 1500);
        return true;
    } catch (error) {
        log.warn('Could not paste clipboard image:', error);
        reportImagePasteFailure(error);
        return false;
    }
}

async function pasteClipboardImageFromAsyncClipboard(view) {
    try {
        const image = await readClipboardImage();
        if (!image) throw new Error('The Linux clipboard did not expose readable image data.');
        return pasteClipboardImage(view, image);
    } catch (error) {
        log.warn('Could not read a Linux clipboard image:', error);
        reportImagePasteFailure(error);
        return false;
    }
}

/**
 * CodeMirror paste handler. Image events are claimed synchronously so the
 * webview never inserts an object replacement character or a local file URL.
 */
export function handleClipboardImagePaste(event, view) {
    const imageFile = clipboardImageFile(event?.clipboardData);
    if (!imageFile) {
        if (!shouldReadClipboardImageAsync(event?.clipboardData)) return false;
        event.preventDefault();
        void pasteClipboardImageFromAsyncClipboard(view);
        return true;
    }
    event.preventDefault();
    void pasteClipboardImage(view, imageFile);
    return true;
}

import { errorDialog } from './dialogs.js';
import { log } from './log.js';
import { getState } from './state.js';
import { statusBar } from './statusBar.js';

export const MAX_CLIPBOARD_IMAGE_BYTES = 25 * 1024 * 1024;

/** Return the first image file supplied by a native clipboard paste event. */
export function clipboardImageFile(clipboardData) {
    const items = Array.from(clipboardData?.items || []);
    for (const item of items) {
        if (item?.kind === 'file' && String(item.type || '').toLowerCase().startsWith('image/')) {
            const file = item.getAsFile?.();
            if (file) return file;
        }
    }
    return Array.from(clipboardData?.files || []).find(file =>
        String(file?.type || '').toLowerCase().startsWith('image/')
    ) || null;
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
    if (!imageFile || !String(imageFile.type || '').toLowerCase().startsWith('image/')) return false;
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

/**
 * CodeMirror paste handler. Image events are claimed synchronously so the
 * webview never inserts an object replacement character or a local file URL.
 */
export function handleClipboardImagePaste(event, view) {
    const imageFile = clipboardImageFile(event?.clipboardData);
    if (!imageFile) return false;
    event.preventDefault();
    void pasteClipboardImage(view, imageFile);
    return true;
}

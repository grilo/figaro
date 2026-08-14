import {
    clipboardImageFile,
    handleClipboardImagePaste,
    pasteClipboardImage,
    shouldReadClipboardImageAsync,
} from './clipboardImage.js';
import {
    clipboardPayloadIsTableOnly,
    clipboardTablePayload,
    insertClipboardTable,
} from './clipboardTable.js';
import { markdownTableFromClipboard } from './markdownTableConversion.js';
import {
    richMarkdownInsertion,
    richPastePlan,
    richPastePreflightPlan,
} from './core/richPasteModel.js';
import { richMarkdownFromClipboard } from './richPaste.js';

export const FIGARO_MARKDOWN_CLIPBOARD_TYPE = 'application/x-figaro-markdown';
const plainPasteViews = new WeakSet();

function clipboardTypes(clipboardData) {
    return Array.from(clipboardData?.types || clipboardData?.items || [])
        .map(value => String(value?.type || value || '').toLowerCase());
}

function clipboardText(clipboardData, type) {
    try {
        return String(clipboardData?.getData?.(type) || '');
    } catch (_) {
        return '';
    }
}

export function clipboardMarkdownPayload(clipboardData) {
    const tablePayload = clipboardTablePayload(clipboardData);
    return {
        ...tablePayload,
        html: tablePayload.html || clipboardText(clipboardData, 'text/html'),
        text: tablePayload.text || clipboardText(clipboardData, 'text/plain'),
        internal: clipboardTypes(clipboardData).includes(FIGARO_MARKDOWN_CLIPBOARD_TYPE),
    };
}

function insertClipboardText(view, text, options = {}) {
    if (!view || view.state.selection.ranges.length !== 1) return false;
    const range = view.state.selection.main;
    const insertion = richMarkdownInsertion(
        view.state.doc.toString(),
        range,
        String(text ?? ''),
        options.block === true,
    );
    view.dispatch({
        changes: { from: range.from, to: range.to, insert: insertion.insert },
        selection: { anchor: range.from + insertion.cursorOffset },
        scrollIntoView: true,
        userEvent: 'input.paste',
    });
    return true;
}

function tableConversion(payload, inlineOnly) {
    if (inlineOnly || !clipboardPayloadIsTableOnly(payload)) return null;
    return markdownTableFromClipboard(payload);
}

function richConversion(payload, inlineOnly) {
    return richMarkdownFromClipboard(payload, { inlineOnly });
}

function imageCandidate(clipboardData) {
    return Boolean(clipboardImageFile(clipboardData)) || shouldReadClipboardImageAsync(clipboardData);
}

/** Track the conventional plain-paste chord while leaving native clipboard access intact. */
export function handlePlainPasteKeydown(event, view) {
    const modifier = event?.ctrlKey || event?.metaKey;
    if (modifier && event?.shiftKey && !event?.altKey && String(event?.key || '').toLowerCase() === 'v') {
        plainPasteViews.add(view);
    }
    return false;
}

export function handlePlainPasteKeyup(event, view) {
    if (String(event?.key || '').toLowerCase() === 'v') plainPasteViews.delete(view);
    return false;
}

/** Run before URL-over-selection so the explicit plain-paste chord always wins. */
export function handlePlainPasteBypass(event, view) {
    if (!plainPasteViews.has(view)) return false;
    const text = clipboardText(event?.clipboardData, 'text/plain');
    if (!text) return false;
    plainPasteViews.delete(view);
    event.preventDefault();
    return insertClipboardText(view, text);
}

/** Put exact Markdown source on the OS clipboard plus a best-effort internal marker. */
export function handleMarkdownClipboardCopy(event, view) {
    const clipboardData = event?.clipboardData;
    const ranges = view?.state?.selection?.ranges || [];
    if (!clipboardData || ranges.length !== 1 || ranges[0].empty) return false;
    const selected = view.state.sliceDoc(ranges[0].from, ranges[0].to);
    try {
        clipboardData.setData('text/plain', selected);
    } catch (_) {
        return false;
    }
    try {
        clipboardData.setData(FIGARO_MARKDOWN_CLIPBOARD_TYPE, '1');
    } catch (_) {
        // Some native webviews reject custom MIME types. Exact text/plain is
        // still sufficient to keep Figaro source out of rich conversion.
    }
    event.preventDefault();
    return true;
}

/**
 * Central native paste coordinator. URL-over-selection runs in CodeMirror's
 * earlier Markdown handler; this owns image, table, rich, and plain fallback.
 */
export function handleClipboardPaste(event, view, options = {}) {
    const clipboardData = event?.clipboardData;
    if (!clipboardData || view?.state?.selection?.ranges?.length !== 1) return false;
    const plainBypass = plainPasteViews.delete(view);
    const internal = clipboardTypes(clipboardData).includes(FIGARO_MARKDOWN_CLIPBOARD_TYPE);
    const protectedContext = options.protectedContext === true;
    const earlyPlainText = plainBypass || protectedContext
        ? clipboardText(clipboardData, 'text/plain')
        : '';
    const preflight = richPastePreflightPlan({
        internal,
        plainBypass,
        hasPlainText: Boolean(earlyPlainText),
        image: imageCandidate(clipboardData),
        markdown: options.markdown === true,
        protectedContext,
    });
    if (preflight.action === 'native') return false;
    if (preflight.action === 'image') return handleClipboardImagePaste(event, view);
    if (preflight.action === 'plain') {
        event.preventDefault();
        return insertClipboardText(view, earlyPlainText);
    }

    const payload = clipboardMarkdownPayload(clipboardData);
    const table = options.markdown === true
        ? tableConversion(payload, options.inlineOnly === true)
        : null;
    if (table) {
        event.preventDefault();
        return insertClipboardTable(view, table);
    }
    const rich = options.markdown === true
        ? richConversion(payload, options.inlineOnly === true)
        : { converted: false };
    const plan = richPastePlan({
        internal: payload.internal,
        plainBypass,
        hasPlainText: Boolean(payload.text),
        markdown: options.markdown === true,
        rich: rich.converted,
    });

    if (plan.action === 'native') return false;
    event.preventDefault();
    return insertClipboardText(view, rich.markdown, { block: rich.block });
}

/** Apply the same table/rich/plain policy to the asynchronous context-menu path. */
export function pasteClipboardPayload(view, payload, options = {}) {
    if (!view || view.state.selection.ranges.length !== 1) return false;
    const preflight = richPastePreflightPlan({
        internal: payload?.internal === true,
        hasPlainText: Boolean(payload?.text),
        markdown: options.markdown === true,
        protectedContext: options.protectedContext === true,
    });
    if (preflight.action !== 'inspect') {
        return payload?.text ? insertClipboardText(view, payload.text) : false;
    }
    const table = options.markdown === true
        ? tableConversion(payload, options.inlineOnly === true)
        : null;
    if (table) return insertClipboardTable(view, table);
    const rich = options.markdown === true
        ? richConversion(payload, options.inlineOnly === true)
        : { converted: false };
    const plan = richPastePlan({
        hasPlainText: Boolean(payload?.text),
        markdown: options.markdown === true,
        rich: rich.converted,
    });
    if (plan.action === 'rich') return insertClipboardText(view, rich.markdown, { block: rich.block });
    if (payload?.text) return insertClipboardText(view, payload.text);
    return false;
}

/** Preserve the existing image-first context-menu behavior. */
export async function pasteClipboardItemImage(view, item) {
    const imageType = Array.from(item?.types || []).find(type =>
        String(type).toLowerCase().startsWith('image/')
    );
    if (!imageType) return false;
    return pasteClipboardImage(view, await item.getType(imageType));
}

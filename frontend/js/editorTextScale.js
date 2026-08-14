import {
    EDITOR_TEXT_SCALE_DEFAULT,
    editorTextScaleForBuffer,
    editorTextScaleStatus,
    normalizeEditorTextScale,
} from './core/editorTextScaleModel.js';
import { requestSourceFootprintMeasure } from './sourceFootprint.js';

export const EDITOR_TEXT_SCALE_STORAGE_KEY = 'editor-font-size';
const EDITOR_FONT_SIZE_PX = 16.2;
const EDITOR_LINE_HEIGHT = 1.65;
const editorTextScaleAnchorMeasures = [{}, {}, {}];

function defaultStorage() {
    try {
        return globalThis.localStorage;
    } catch (_) {
        return null;
    }
}

export function getConfiguredEditorTextScale(storage = defaultStorage()) {
    let saved;
    try {
        saved = storage?.getItem?.(EDITOR_TEXT_SCALE_STORAGE_KEY);
    } catch (_) {
        return EDITOR_TEXT_SCALE_DEFAULT;
    }
    return normalizeEditorTextScale(saved == null ? EDITOR_TEXT_SCALE_DEFAULT : saved);
}

export function persistConfiguredEditorTextScale(scale, storage = defaultStorage()) {
    const normalized = normalizeEditorTextScale(scale);
    try {
        storage?.setItem?.(EDITOR_TEXT_SCALE_STORAGE_KEY, String(normalized));
    } catch (_) { /* a live scale remains usable when webview storage is unavailable */ }
    return normalized;
}

export function getBufferEditorTextScale(tab, configuredScale = getConfiguredEditorTextScale()) {
    return editorTextScaleForBuffer(tab?._editorTextScale, configuredScale);
}

export function setBufferEditorTextScale(tab, scale) {
    if (!tab || tab.type !== 'file') return normalizeEditorTextScale(scale);
    const normalized = normalizeEditorTextScale(scale);
    tab._editorTextScale = normalized;
    return normalized;
}

export function resetBufferEditorTextScale(tab, configuredScale = getConfiguredEditorTextScale()) {
    if (tab && tab.type === 'file') delete tab._editorTextScale;
    return normalizeEditorTextScale(configuredScale);
}

function pointerAnchor(view, event) {
    if (!view?.posAtCoords || !view?.coordsAtPos || !event) return null;
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (!Number.isInteger(position)) return null;
    const rectangle = view.coordsAtPos(position);
    if (!rectangle || !Number.isFinite(rectangle.top)) return null;
    return { position, top: rectangle.top };
}

function preservePointerAnchor(view, anchor, correctionPass = 0) {
    if (!view?.requestMeasure || !anchor) return;
    view.requestMeasure({
        key: editorTextScaleAnchorMeasures[correctionPass],
        read: measuredView => measuredView.coordsAtPos(anchor.position)?.top ?? anchor.top,
        write: top => {
            if (!Number.isFinite(top) || !view.scrollDOM) return;
            view.scrollDOM.scrollTop += top - anchor.top;
            if (correctionPass === 0) {
                preservePointerAnchor(view, anchor, 1);
            } else if (correctionPass === 1) {
                requestAnimationFrame(() => {
                    if (!view.isDestroyed) preservePointerAnchor(view, anchor, 2);
                });
            }
        },
    });
}

/** Apply one effective scale and keep the document point below the wheel fixed. */
export function applyEditorTextScale(scale, {
    root = globalThis.document?.documentElement,
    view = null,
    anchorEvent = null,
} = {}) {
    const normalized = normalizeEditorTextScale(scale);
    const anchor = pointerAnchor(view, anchorEvent);
    const fontSize = Number((EDITOR_FONT_SIZE_PX * normalized / 100).toFixed(3));
    root?.style?.setProperty('--font-size-editor', `${fontSize}px`);
    // This is a ratio. Scaling it as well as the font size would enlarge rows twice.
    root?.style?.setProperty('--line-height-editor', String(EDITOR_LINE_HEIGHT));

    preservePointerAnchor(view, anchor);
    requestSourceFootprintMeasure(view);
    globalThis.document?.dispatchEvent?.(new CustomEvent('editor-text-scale-applied', {
        detail: { scale: normalized },
    }));
    return normalized;
}

export function renderEditorTextScaleStatus(tab, {
    configuredScale = getConfiguredEditorTextScale(),
    button = globalThis.document?.getElementById?.('editor-scale-status'),
    separator = globalThis.document?.getElementById?.('editor-scale-separator'),
} = {}) {
    const scale = tab?.type === 'file'
        ? getBufferEditorTextScale(tab, configuredScale)
        : configuredScale;
    const presentation = editorTextScaleStatus({
        bufferType: tab?.type,
        scale,
        configuredScale,
    });
    if (button) {
        button.hidden = presentation.hidden;
        button.textContent = presentation.label;
        button.setAttribute('aria-label', presentation.ariaLabel);
        button.title = presentation.title;
    }
    if (separator) separator.hidden = presentation.hidden;
    return presentation;
}

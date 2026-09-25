import { createLocalStateStorage } from './localStateStorage.js';
import {
    readDiagramSizeMemory,
    rememberDiagramSize,
    serializeDiagramSizeMemory,
} from '../core/diagramSizeModel.js';

export const DIAGRAM_SIZE_STORAGE_KEY = 'figaro.diagram-sizes.v1';
const NATURAL_SIZE_LIMIT = 400;
const BOX_HEIGHT_LIMIT = 256;
const WRITE_DELAY_MS = 1000;

/**
 * Remembered diagram geometry.
 *
 * Natural sizes (the rendered SVG's viewBox) are machine-local and survive
 * restarts in webview storage, so reopening a note reserves each diagram's box
 * before Mermaid runs. Pass `storage: null` for a memory that lasts only for
 * the session. Measured editor box heights are always session-only and belong
 * to the layout (column width and line height) set with `setLayout`, so
 * revealed source keeps exactly the height of the widget it replaced and never
 * reuses a height measured at another width.
 */
export function createDiagramSizeMemory({
    storage = createLocalStateStorage(),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = handle => clearTimeout(handle),
} = {}) {
    let natural;
    try {
        natural = readDiagramSizeMemory(storage?.read(DIAGRAM_SIZE_STORAGE_KEY));
    } catch (_) {
        natural = new Map();
    }
    const boxes = new Map();
    let layout = '';
    let pendingWrite = null;

    const flush = () => {
        if (pendingWrite !== null) cancel(pendingWrite);
        pendingWrite = null;
        if (!storage) return;
        try {
            storage.write(DIAGRAM_SIZE_STORAGE_KEY, serializeDiagramSizeMemory(natural));
        } catch (_) { /* sizes stay remembered for this session */ }
    };

    return {
        naturalSize: key => natural.get(key) || null,
        rememberNaturalSize(key, size) {
            if (!rememberDiagramSize(natural, key, size, NATURAL_SIZE_LIMIT) || !storage || pendingWrite !== null) return;
            pendingWrite = schedule(flush, WRITE_DELAY_MS);
        },
        setLayout(signature) {
            layout = String(signature);
        },
        boxHeight: key => boxes.get(`${layout}\u0000${key}`)?.height || 0,
        rememberBoxHeight(key, height) {
            rememberDiagramSize(boxes, `${layout}\u0000${key}`, { width: 1, height }, BOX_HEIGHT_LIMIT);
        },
        flush,
    };
}

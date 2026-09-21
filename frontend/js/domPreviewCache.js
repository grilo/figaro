import { ViewPlugin } from '@codemirror/view';
import { createPreviewCache } from './core/previewCache.js';

/** Retain content only. Each mount owns its controls, source positions and observers. */
export function createDOMPreviewCache({ maximumEntries = 32, maximumWeight = 4 * 1024 * 1024 } = {}) {
    const sessions = new WeakMap();
    const forView = view => {
        if (!view?.dom) return null;
        let session = sessions.get(view);
        if (!session) {
            const cache = createPreviewCache({ maximumEntries, maximumWeight });
            let active = true;
            session = {
                take(key, signature, renderer = null) {
                    const entry = cache.take(key);
                    return entry?.signature === signature && entry.renderer === renderer ? entry : null;
                },
                retain(key, entry) {
                    if (!active || !key || !entry || !cache.set(key, entry, entry.weight)) return false;
                    // CodeMirror is still updating its live DOM when it destroys
                    // a widget. Detach content after that transaction, before paint.
                    const parent = entry.node.parentNode;
                    queueMicrotask(() => {
                        if (entry.node.parentNode === parent) entry.node.remove();
                    });
                    return true;
                },
                dispose() { active = false; cache.clear(); },
                stats: () => cache.stats(),
            };
            sessions.set(view, session);
        }
        return session;
    };
    const extension = ViewPlugin.define(view => {
        const session = forView(view);
        return { destroy() { session.dispose(); sessions.delete(view); } };
    });
    return {
        extension,
        forView,
        // Estimate once when producing content, never while removing it during input.
        prepare(node, signature, renderer = null, additionalWeight = 0) {
            return { node, signature, renderer,
                weight: 2 * (signature.length + node.outerHTML.length)
                    + 256 * (node.querySelectorAll('*').length + 1) + additionalWeight };
        },
    };
}

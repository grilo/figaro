/**
 * Application logger — routes to Wails runtime (visible in Go terminal) when
 * running inside Wails, falls back to console when running tests or outside Wails.
 */

// Lazy-init: Wails runtime may not be available when this module first loads.
let _rt = null;
function rt() {
    if (_rt) return _rt;
    try {
        // Dynamic import works in ESM; synchronous path for Wails v2.
        if (window.runtime && window.runtime.LogDebug) {
            _rt = window.runtime;
        }
    } catch (_) { /* ignore */ }
    return _rt;
}

export const log = {
    debug(msg) {
        const r = rt();
        console.log('[DEBUG]', msg);
        if (r) r.LogDebug(String(msg));
    },
    info(msg) {
        const r = rt();
        console.info('[INFO]', msg);
        if (r) r.LogInfo(String(msg));
    },
    warn(msg) {
        const r = rt();
        console.warn('[WARN]', msg);
        if (r) r.LogWarning(String(msg));
    },
    error(msg) {
        const r = rt();
        console.error('[ERROR]', msg);
        if (r) r.LogError(String(msg));
    }
};

/**
 * Application logger — writes to the console and forwards a line to the native
 * runtime only for the levels that runtime publishes. The Wails v3 adapter
 * provides LogDebug alone, so logging a warning or an error must never depend
 * on a native method: these calls sit inside failure handlers.
 */

// Lazy-init: Wails runtime may not be available when this module first loads.
let _rt = null;
function rt() {
    if (_rt) return _rt;
    try {
        if (window.runtime && window.runtime.LogDebug) {
            _rt = window.runtime;
        }
    } catch (_) { /* ignore */ }
    return _rt;
}

function forward(method, msg, details) {
    const runtime = rt();
    if (typeof runtime?.[method] !== 'function') return;
    try {
        runtime[method]([msg, ...details].map(String).join(' '));
    } catch (_) { /* A logger must not turn a recoverable failure into a thrown one. */ }
}

export const log = {
    debug(msg, ...details) {
        console.log('[DEBUG]', msg, ...details);
        forward('LogDebug', msg, details);
    },
    info(msg, ...details) {
        console.info('[INFO]', msg, ...details);
        forward('LogInfo', msg, details);
    },
    warn(msg, ...details) {
        console.warn('[WARN]', msg, ...details);
        forward('LogWarning', msg, details);
    },
    error(msg, ...details) {
        console.error('[ERROR]', msg, ...details);
        forward('LogError', msg, details);
    }
};

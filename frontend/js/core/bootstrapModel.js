export const DEBUG_BACKEND_AFTER_TRIES = 40;

export function startupBackendDecision({
    hasBackend,
    protocol,
    tries,
}) {
    if (hasBackend) return 'start';
    if (protocol === 'wails:') return 'wait';
    if (tries > DEBUG_BACKEND_AFTER_TRIES) return 'debug';
    return 'wait';
}

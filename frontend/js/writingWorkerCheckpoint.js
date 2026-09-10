/** Worker adapter: yield to messages at bounded checkpoints, then reject stale
 * work. Synchronous package calls remain protected by the client's watchdog.
 */
export function createWritingWorkerCheckpoint(cancelled) {
    let lastYield = performance.now();
    return async () => {
        if (performance.now() - lastYield >= 8) {
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYield = performance.now();
        }
        if (cancelled()) throw new Error('Writing analysis cancelled');
    };
}

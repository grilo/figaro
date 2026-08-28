function browserFrame(callback) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
    return setTimeout(callback, 0);
}

/** Reveal the hydrated workspace only after mounted editor geometry has settled. */
export function revealStartupWorkspace({
    root = document,
    scheduleFrame = browserFrame,
} = {}) {
    return new Promise(resolve => {
        scheduleFrame(() => {
            scheduleFrame(() => {
                root.getElementById?.('app')?.removeAttribute('data-startup-hydrating');
                resolve();
            });
        });
    });
}

export default { revealStartupWorkspace };

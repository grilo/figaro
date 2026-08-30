/**
 * Coordinate the state that must be authoritative before a restored editor is
 * exposed. Every port starts in the same turn so the correctness barrier does
 * not serialize independent settings and session reads.
 */
export function createStartupHydration({
    loadSession,
    loadTabSize,
    loadLinkStyle,
    loadAutomation,
    loadEditorPreferences,
}) {
    const loaders = [
        loadSession,
        loadTabSize,
        loadLinkStyle,
        loadAutomation,
        loadEditorPreferences,
    ];
    let hydrationPromise = null;

    return {
        hydrate() {
            if (!hydrationPromise) {
                const tasks = loaders.map(load => {
                    try {
                        return Promise.resolve(load());
                    } catch (error) {
                        return Promise.reject(error);
                    }
                });
                hydrationPromise = Promise.all(tasks).then(() => undefined);
            }
            return hydrationPromise;
        },
    };
}

/**
 * Load a coherent file-tree snapshot through injected ports. Request
 * generations prevent an older backend response from replacing newer state.
 */
export function createFileTreeRefresh({
    readTree,
    readStyles,
    fallbackStyles,
    publish,
    onLoading = () => {},
    onReady = () => {},
    onStylesFailed = () => {},
    onFailed = () => {},
}) {
    let generation = 0;

    async function refresh() {
        const requestGeneration = ++generation;
        onLoading();
        try {
            const [tree, styles] = await Promise.all([
                readTree(),
                readStyles().catch(error => {
                    onStylesFailed(error);
                    return fallbackStyles();
                }),
            ]);
            if (requestGeneration !== generation) return null;
            await publish({ tree, styles });
            onReady();
            return { tree, styles };
        } catch (error) {
            if (requestGeneration !== generation) return null;
            onFailed(error);
            return null;
        }
    }

    return {
        refresh,
        invalidate() {
            generation += 1;
        },
    };
}

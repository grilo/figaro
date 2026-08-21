/**
 * Coordinate a batch transfer without knowing about the DOM, dialogs, or
 * global application state. The file-tree adapter injects its filesystem,
 * tab-save, refresh, and status effects at the composition boundary.
 */
export function createFileTreeTransfer({ prepareCopy, copyPath, refresh, onPrepare, onCopy }) {
    if (typeof prepareCopy !== 'function' || typeof copyPath !== 'function') {
        throw new TypeError('file-tree transfer requires copy preparation and copy effects');
    }

    return {
        async copy(entries, targetDirectory) {
            const copiedPaths = [];
            let remaining = entries.slice();
            const refreshAfterPartial = async () => {
                try {
                    if (typeof refresh === 'function') await refresh();
                } catch {
                    // The original mutation result is still useful to the
                    // adapter; its next refresh can reconcile the projection.
                }
            };
            try {
                for (let index = 0; index < entries.length; index += 1) {
                    const source = entries[index];
                    remaining = entries.slice(index);
                    onPrepare?.(source);
                    const saveState = await prepareCopy(source.path);
                    if (!saveState?.success) {
                        await refreshAfterPartial();
                        return { success: false, stage: 'prepare', error: saveState?.error, remaining, copiedPaths };
                    }
                    onCopy?.(source);
                    const result = await copyPath(source.path, targetDirectory);
                    if (!result?.success) {
                        await refreshAfterPartial();
                        return { success: false, stage: 'copy', error: result?.error, remaining, copiedPaths };
                    }
                    if (result.path) copiedPaths.push(result.path);
                    remaining = entries.slice(index + 1);
                }
                try {
                    if (typeof refresh === 'function') await refresh();
                } catch (error) {
                    return { success: false, stage: 'refresh', error, remaining: [], copiedPaths };
                }
            } catch (error) {
                await refreshAfterPartial();
                return { success: false, stage: 'exception', error, remaining, copiedPaths };
            }
            return { success: true, stage: 'complete', error: null, remaining, copiedPaths };
        },
    };
}

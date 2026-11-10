/**
 * Merge notes into the first one without losing text held only in editors.
 *
 * The backend merges what is on disk, so unsaved edits in any of the notes
 * are saved first; a note that cannot be saved stops the merge before
 * anything changes. Afterwards the merged-away notes' tabs close and the
 * surviving note's open tab is reloaded: left stale, its next save would
 * replace the merged file with the text from before the merge.
 */
export function createNoteMerge({ prepareTabs, merge, closeDeletedTabs, reloadTabs }) {
    if (![prepareTabs, merge, closeDeletedTabs, reloadTabs].every(port => typeof port === 'function')) {
        throw new TypeError('Note merge ports are incomplete');
    }

    return async function mergeNotes(paths) {
        const [master, ...sources] = Array.isArray(paths) ? paths : [];
        if (!master || !sources.length) return { success: false, error: 'Choose at least two notes to merge.' };

        const prepared = await prepareTabs([master, ...sources]);
        if (!prepared?.success) {
            return { success: false, error: prepared?.error || 'Open notes could not be saved before merging.' };
        }

        const result = await merge([master, ...sources]);
        if (!result?.success) {
            return { success: false, error: result?.error || 'The selected notes could not be merged.' };
        }

        for (const source of sources) closeDeletedTabs(source);
        await reloadTabs([master]);
        return { success: true, master };
    };
}

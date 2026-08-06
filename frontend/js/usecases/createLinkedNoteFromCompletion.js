// Coordinate the explicit autocomplete creation action through injected ports.
// The caller owns editor transactions, dialogs, backend I/O, and tree refresh.
export async function createLinkedNoteFromCompletion({
    tree,
    plan,
    reviewName,
    createFile,
    applyLink,
    refreshTree,
    openExisting,
}) {
    if (!plan) return { kind: 'invalid' };

    let existingLinkApplied = false;
    try {
        const review = await reviewName({
            tree,
            parentDirectory: plan.parentDirectory,
            proposedName: plan.fileName,
            operation: 'create',
            open: async path => {
                existingLinkApplied = await applyLink(path);
                if (existingLinkApplied) await openExisting(path);
            },
        });
        if (review === 'opened') {
            return existingLinkApplied ? { kind: 'used-existing' } : { kind: 'stale' };
        }
        if (review !== 'proceed') return { kind: 'cancelled' };

        const created = await createFile(plan.path, plan.content);
        if (!created?.success) return { kind: 'failed', error: created?.error };
        const path = created.path || plan.path;
        const applied = await applyLink(path);
        await refreshTree();
        return applied ? { kind: 'created', path } : { kind: 'created-stale', path };
    } catch (error) {
        return { kind: 'failed', error };
    }
}

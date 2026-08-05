import { planSameDirectoryNoteName } from '../core/similarNotes.js';

// Coordinates the review prompt through injected UI/navigation ports. The
// caller remains responsible for performing the eventual create or rename.
export async function reviewSameDirectoryNoteName({
    tree,
    parentDirectory,
    proposedName,
    currentPath = '',
    operation = 'create',
    confirm,
    open,
}) {
    const plan = planSameDirectoryNoteName({ tree, parentDirectory, proposedName, currentPath });
    if (plan.kind === 'none') return 'proceed';

    const exact = plan.kind === 'exact';
    const operationLabel = operation === 'rename' ? 'Rename anyway' : 'Create anyway';
    const choice = await confirm(
        exact ? 'Note already exists' : 'Similar note name',
        exact
            ? `“${plan.path}” already has this name.`
            : `“${plan.path}” differs only by spacing, punctuation, or capitalization.`,
        false,
        false,
        {
            tone: 'warning',
            icon: 'warning',
            description: exact
                ? 'Open the existing note instead.'
                : 'Open the existing note to compare them. Figaro will not merge or change either note.',
            confirmLabel: 'Open existing',
            cancelLabel: 'Cancel',
            ...(exact ? {} : { extraLabel: operationLabel }),
        }
    );

    if (choice === 'confirm' || choice === true) {
        await open(plan.path);
        return 'opened';
    }
    if (!exact && choice === 'extra') return 'proceed';
    return 'cancelled';
}

export async function reviewMissingLinkedNote({
    tree,
    targetPath,
    confirm,
    read,
    replaceTarget,
    open,
}) {
    const normalizedTarget = String(targetPath || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    const separator = normalizedTarget.lastIndexOf('/');
    const plan = planSameDirectoryNoteName({
        tree,
        parentDirectory: separator >= 0 ? normalizedTarget.slice(0, separator) : '',
        proposedName: separator >= 0 ? normalizedTarget.slice(separator + 1) : normalizedTarget,
    });
    if (plan.kind === 'none') return 'no-match';

    const exact = plan.kind === 'exact';
    const choice = await confirm(
        exact ? 'Linked note already exists' : 'Similar linked note',
        exact
            ? `“${plan.path}” already has this name.`
            : `“${plan.path}” differs only by spacing, punctuation, or capitalization.`,
        false,
        false,
        {
            tone: 'warning',
            icon: 'warning',
            description: 'Use the existing note to update only this link’s destination. Its visible label will stay unchanged, and Figaro will not merge notes.',
            confirmLabel: 'Use existing note',
            cancelLabel: 'Cancel',
            ...(exact ? {} : { extraLabel: 'Create anyway' }),
        }
    );

    if (choice === 'confirm' || choice === true) {
        let existing;
        try {
            existing = await read(plan.path);
        } catch {
            return 'unavailable';
        }
        if (!existing) return 'unavailable';
        if (!await replaceTarget(plan.path)) return 'stale';
        await open(plan.path, existing);
        return 'used-existing';
    }
    if (!exact && choice === 'extra') return 'create';
    return 'cancelled';
}

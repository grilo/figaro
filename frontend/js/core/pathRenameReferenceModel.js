export function renameReferenceReviewPlan(paths, { oldName = '', newName = '' } = {}) {
    const references = [...new Set((Array.isArray(paths) ? paths : [])
        .map(path => String(path || '').replaceAll('\\', '/').trim())
        .filter(Boolean))].sort((left, right) => left.localeCompare(right));
    if (!references.length) return null;
    const count = references.length;
    const noteLabel = count === 1 ? 'Markdown note references' : 'Markdown notes reference';
    return {
        references,
        title: 'Update Markdown references?',
        message: `${count} ${noteLabel} “${oldName}”. Update all of them to “${newName}”? Keeping the old references may leave broken links or images.`,
        options: {
            confirmLabel: 'Update references',
            extraLabel: 'Keep references unchanged',
            cancelLabel: 'Cancel rename',
            dismissOnBackdrop: false,
        },
    };
}

export function renameReferenceChoice(value) {
    if (value === 'confirm' || value === true) return { proceed: true, updateLinks: true };
    if (value === 'extra') return { proceed: true, updateLinks: false };
    return { proceed: false, updateLinks: false };
}

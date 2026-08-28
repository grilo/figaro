/** Decide whether application status is idle and whether focused writing may recede. */
export function statusBarPresentationModel({
    editorFocused = false,
    statusText = '',
    hasAction = false,
    activityVisible = false,
    vaultLoading = false,
} = {}) {
    const applicationIdle = statusText === 'Ready'
        && !hasAction
        && !activityVisible
        && !vaultLoading;

    return {
        applicationIdle,
        writingRest: Boolean(editorFocused) && applicationIdle,
    };
}

/** Preserve the focused-writing predicate for existing consumers. */
export function statusBarWritingRest(input = {}) {
    return statusBarPresentationModel(input).writingRest;
}

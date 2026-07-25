export const RIGHT_SIDEBAR_MINIMUM = 240;
export const RIGHT_SIDEBAR_MAXIMUM = 480;
export const PDF_PREVIEW_MINIMUM = 340;
export const PDF_EDITOR_MINIMUM = 320;
export const PDF_COMPACT_EDITOR_THRESHOLD = 560;

export function rightSidebarWidth({
    startX,
    currentX,
    startWidth,
    workspaceWidth,
    pdfPreview = false,
}) {
    const minimum = pdfPreview ? PDF_PREVIEW_MINIMUM : RIGHT_SIDEBAR_MINIMUM;
    const maximum = pdfPreview
        ? Math.max(minimum, Number(workspaceWidth) - PDF_EDITOR_MINIMUM)
        : RIGHT_SIDEBAR_MAXIMUM;
    const requested = Number(startWidth) + Number(startX) - Number(currentX);
    return Math.min(maximum, Math.max(minimum, requested));
}

export function compactEditorRequired({
    sidebarOpen = false,
    pdfPreview = false,
    editorWidth = 0,
}) {
    return Boolean(
        sidebarOpen
        && pdfPreview
        && Number(editorWidth) > 0
        && Number(editorWidth) < PDF_COMPACT_EDITOR_THRESHOLD
    );
}

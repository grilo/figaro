export const RIGHT_SIDEBAR_MINIMUM = 240;
export const RIGHT_SIDEBAR_MAXIMUM = 480;
export const PDF_PREVIEW_MINIMUM = 340;
export const PDF_EDITOR_MINIMUM = 320;
export const PDF_COMPACT_EDITOR_THRESHOLD = 560;
export const OVERLAY_EDITOR_VISIBLE_MINIMUM = 180;

export function rightSidebarPresentation({
    workspaceWidth,
    preferredWidth,
    pdfPreview = false,
} = {}) {
    const available = Math.max(0, Number(workspaceWidth) || 0);
    const minimum = pdfPreview ? PDF_PREVIEW_MINIMUM : RIGHT_SIDEBAR_MINIMUM;
    const fallback = pdfPreview ? 480 : 320;
    const preferred = Math.max(minimum, Number(preferredWidth) || fallback);
    const canDock = available >= minimum + PDF_EDITOR_MINIMUM;

    if (!canDock) {
        const overlayMaximum = Math.max(minimum, available - OVERLAY_EDITOR_VISIBLE_MINIMUM);
        return {
            overlay: true,
            width: Math.min(available, preferred, overlayMaximum),
            editorWidth: available,
        };
    }

    const width = Math.min(preferred, available - PDF_EDITOR_MINIMUM);
    return {
        overlay: false,
        width,
        editorWidth: available - width,
    };
}

export function rightSidebarBounds({ workspaceWidth, pdfPreview = false, overlay = false } = {}) {
    const available = Math.max(0, Number(workspaceWidth) || 0);
    const baseMinimum = pdfPreview ? PDF_PREVIEW_MINIMUM : RIGHT_SIDEBAR_MINIMUM;
    const minimum = overlay ? Math.min(available, baseMinimum) : baseMinimum;
    return {
        minimum,
        maximum: overlay
            ? Math.min(available, Math.max(minimum, available - OVERLAY_EDITOR_VISIBLE_MINIMUM))
            : pdfPreview
                ? Math.max(minimum, Number(workspaceWidth) - PDF_EDITOR_MINIMUM)
                : RIGHT_SIDEBAR_MAXIMUM,
    };
}

export function rightSidebarWidth({
    startX,
    currentX,
    startWidth,
    workspaceWidth,
    pdfPreview = false,
    overlay = false,
}) {
    const { minimum, maximum } = rightSidebarBounds({ workspaceWidth, pdfPreview, overlay });
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

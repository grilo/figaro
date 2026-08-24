/**
 * Decide whether one event belongs to a rendered table's scroll surface.
 * The caller supplies browser measurements; this module performs no DOM work.
 */
export function tablePreviewOwnsInteraction({
    type = '',
    pointerType = '',
    targetKind = 'outside',
    clientX,
    clientY,
    deltaX = 0,
    deltaY = 0,
    rect,
    clientWidth = 0,
    clientHeight = 0,
    scrollWidth = 0,
    scrollHeight = 0,
    minimumScrollbarSize = 8,
} = {}) {
    if (!['root', 'surface', 'content'].includes(targetKind)) return false;
    const eventType = String(type || '');
    const verticalOverflow = scrollHeight > clientHeight + 1;
    const horizontalOverflow = scrollWidth > clientWidth + 1;
    if (eventType === 'wheel') {
        const horizontalIntent = Math.abs(Number(deltaX) || 0) > Math.abs(Number(deltaY) || 0);
        return horizontalIntent ? horizontalOverflow : verticalOverflow;
    }
    if (eventType.startsWith('touch') || pointerType === 'touch') {
        return verticalOverflow || horizontalOverflow;
    }
    if (targetKind === 'root' || targetKind === 'surface') return true;

    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !rect) return false;

    const verticalGutter = Math.max(minimumScrollbarSize, rect.width - clientWidth);
    const horizontalGutter = Math.max(minimumScrollbarSize, rect.height - clientHeight);
    const hitsVertical = verticalOverflow
        && x >= rect.right - verticalGutter
        && x <= rect.right;
    const hitsHorizontal = horizontalOverflow
        && y >= rect.bottom - horizontalGutter
        && y <= rect.bottom;
    return hitsVertical || hitsHorizontal;
}

export default { tablePreviewOwnsInteraction };

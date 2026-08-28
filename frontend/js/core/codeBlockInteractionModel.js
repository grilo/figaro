const OVERLAY_SCROLLBAR_HIT_SIZE = 12;
const OVERFLOW_TOLERANCE = 1;

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;

/**
 * Identify a scrollbar track press without depending on browser DOM objects.
 *
 * Conventional scrollbars consume client-box space. Overlay scrollbars do
 * not, so a small edge fallback keeps their visible track interactive in
 * WebKitGTK, WebView2, and Chromium.
 */
export function codeBlockScrollbarAxis({
    clientX,
    clientY,
    rect,
    clientWidth,
    clientHeight,
    offsetWidth,
    offsetHeight,
    scrollWidth,
    scrollHeight,
    borderTop = 0,
    borderRight = 0,
    borderBottom = 0,
    borderLeft = 0,
} = {}) {
    const box = {
        top: finite(rect?.top),
        right: finite(rect?.right),
        bottom: finite(rect?.bottom),
        left: finite(rect?.left),
    };
    const point = { x: finite(clientX), y: finite(clientY) };
    const borders = {
        top: Math.max(0, finite(borderTop)),
        right: Math.max(0, finite(borderRight)),
        bottom: Math.max(0, finite(borderBottom)),
        left: Math.max(0, finite(borderLeft)),
    };
    const sizes = {
        clientWidth: Math.max(0, finite(clientWidth)),
        clientHeight: Math.max(0, finite(clientHeight)),
        offsetWidth: Math.max(0, finite(offsetWidth)),
        offsetHeight: Math.max(0, finite(offsetHeight)),
        scrollWidth: Math.max(0, finite(scrollWidth)),
        scrollHeight: Math.max(0, finite(scrollHeight)),
    };
    if (
        point.x < box.left || point.x > box.right
        || point.y < box.top || point.y > box.bottom
    ) return null;

    const hasVerticalScrollbar = sizes.scrollHeight > sizes.clientHeight + OVERFLOW_TOLERANCE;
    const hasHorizontalScrollbar = sizes.scrollWidth > sizes.clientWidth + OVERFLOW_TOLERANCE;
    const verticalTrackWidth = Math.max(
        OVERLAY_SCROLLBAR_HIT_SIZE,
        sizes.offsetWidth - sizes.clientWidth - borders.left - borders.right,
    );
    const horizontalTrackHeight = Math.max(
        OVERLAY_SCROLLBAR_HIT_SIZE,
        sizes.offsetHeight - sizes.clientHeight - borders.top - borders.bottom,
    );
    const contentRight = box.right - borders.right;
    const contentBottom = box.bottom - borders.bottom;

    if (
        hasVerticalScrollbar
        && point.x >= contentRight - verticalTrackWidth
        && point.x <= contentRight
        && point.y >= box.top + borders.top
        && point.y <= contentBottom
    ) return 'vertical';
    if (
        hasHorizontalScrollbar
        && point.y >= contentBottom - horizontalTrackHeight
        && point.y <= contentBottom
        && point.x >= box.left + borders.left
        && point.x <= contentRight
    ) return 'horizontal';
    return null;
}

/**
 * Place a compact tooltip below its anchor when possible, flip it above near
 * the viewport bottom, and clamp the complete surface inside every edge.
 */
export function tooltipPosition(anchorRect, tooltipRect, viewport = {}, options = {}) {
    const margin = Math.max(0, Number(options.margin) || 8);
    const gap = Math.max(0, Number(options.gap) || 7);
    const viewportWidth = Math.max(0, Number(viewport.width ?? viewport.innerWidth) || 0);
    const viewportHeight = Math.max(0, Number(viewport.height ?? viewport.innerHeight) || 0);
    const tooltipWidth = Math.max(0, Number(tooltipRect?.width) || 0);
    const tooltipHeight = Math.max(0, Number(tooltipRect?.height) || 0);
    const anchorLeft = Number(anchorRect?.left) || 0;
    const anchorRight = Number(anchorRect?.right) || anchorLeft;
    const anchorTop = Number(anchorRect?.top) || 0;
    const anchorBottom = Number(anchorRect?.bottom) || anchorTop;
    const centeredLeft = anchorLeft + ((anchorRight - anchorLeft - tooltipWidth) / 2);
    const maximumLeft = Math.max(margin, viewportWidth - tooltipWidth - margin);
    const maximumTop = Math.max(margin, viewportHeight - tooltipHeight - margin);
    const below = anchorBottom + gap;
    const above = anchorTop - tooltipHeight - gap;
    const useAbove = below + tooltipHeight > viewportHeight - margin && above >= margin;

    return {
        left: Math.max(margin, Math.min(centeredLeft, maximumLeft)),
        top: Math.max(margin, Math.min(useAbove ? above : below, maximumTop)),
        placement: useAbove ? 'top' : 'bottom',
    };
}

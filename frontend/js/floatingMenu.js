import { planFloatingMenuPlacement } from './core/floatingMenuModel.js';

/**
 * Move an open menu to the document overlay layer while keeping its geometry
 * attached to the invoking control. Portalling avoids transformed, clipped,
 * and scrolling ancestors changing the meaning of fixed coordinates.
 */
export function mountFloatingMenu(anchor, menu, {
    maximumHeight = 310,
    maximumWidth = 280,
    gap = 6,
    margin = 8,
} = {}) {
    if (!anchor?.isConnected || !menu?.isConnected) return null;
    const parent = menu.parentNode;
    const nextSibling = menu.nextSibling;
    const quietOwner = menu.closest('.ui-picker--quiet');
    let mounted = true;

    menu.dataset.floating = 'true';
    if (quietOwner) menu.dataset.ownerQuiet = 'true';
    menu.style.position = 'fixed';
    document.body.append(menu);

    const position = () => {
        if (!mounted || !anchor.isConnected || !menu.isConnected) return;
        const trigger = anchor.getBoundingClientRect();
        const intrinsicWidth = menu.scrollWidth || trigger.width;
        const requestedWidth = Math.max(trigger.width, Math.min(maximumWidth, intrinsicWidth));
        const placement = planFloatingMenuPlacement({
            trigger,
            menuHeight: menu.scrollHeight,
            menuWidth: requestedWidth,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            maximumHeight,
            gap,
            margin,
        });
        menu.dataset.placement = placement.placement;
        menu.style.top = `${placement.top}px`;
        menu.style.left = `${placement.left}px`;
        menu.style.width = `${placement.width}px`;
        menu.style.maxHeight = `${placement.maxHeight}px`;
    };
    const close = () => {
        if (!mounted) return;
        mounted = false;
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        delete menu.dataset.floating;
        delete menu.dataset.placement;
        delete menu.dataset.ownerQuiet;
        for (const property of ['position', 'top', 'left', 'width', 'max-height']) menu.style.removeProperty(property);
        if (parent) parent.insertBefore(menu, nextSibling?.parentNode === parent ? nextSibling : null);
    };

    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return { close, position };
}

export default mountFloatingMenu;

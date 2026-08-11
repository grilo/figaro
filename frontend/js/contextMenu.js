import {
    contextMenuNavigationIndex,
    isContextMenuNavigationKey,
} from './core/contextMenuModel.js';

const menuState = new WeakMap();

export function enabledContextMenuItems(menu) {
    return [...(menu?.querySelectorAll?.('.context-menu-item') || [])].filter(item => (
        !item.classList.contains('disabled')
        && item.getAttribute('aria-disabled') !== 'true'
        && !item.disabled
    ));
}

function focusMenuItem(menu, item) {
    for (const candidate of enabledContextMenuItems(menu)) candidate.tabIndex = candidate === item ? 0 : -1;
    item?.focus?.({ preventScroll: true });
}

/** Remove a configured menu and optionally return focus to its invoking control. */
export function dismissContextMenu(menu, { restoreFocus = true } = {}) {
    if (!menu) return;
    const state = menuState.get(menu);
    menu.remove();
    menuState.delete(menu);
    state?.onDismiss?.();
    if (restoreFocus && typeof state?.returnFocus === 'function') {
        state.returnFocus();
    } else if (restoreFocus && state?.returnFocus?.isConnected) {
        state.returnFocus.focus?.({ preventScroll: true });
    }
}

/**
 * Apply the shared WAI-ARIA menu contract without changing menu presentation.
 * Call after the menu is mounted and all optional items have been appended.
 */
export function configureContextMenu(menu, {
    label = 'Context menu',
    returnFocus = document.activeElement,
    onDismiss = null,
} = {}) {
    if (!menu) return null;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', label);

    for (const separator of menu.querySelectorAll('.context-menu-separator')) {
        separator.setAttribute('role', 'separator');
    }
    for (const item of menu.querySelectorAll('.context-menu-item')) {
        if (item.dataset.action || (!item.classList.contains('disabled') && item.getAttribute('aria-disabled') !== 'true')) {
            item.setAttribute('role', 'menuitem');
        }
        item.tabIndex = -1;
    }

    menuState.set(menu, { returnFocus, onDismiss });
    const firstItem = enabledContextMenuItems(menu)[0] || null;
    if (firstItem) focusMenuItem(menu, firstItem);

    menu.addEventListener('keydown', event => {
        const items = enabledContextMenuItems(menu);
        if (isContextMenuNavigationKey(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            const currentIndex = items.indexOf(document.activeElement);
            const nextIndex = contextMenuNavigationIndex(event.key, currentIndex, items.length);
            focusMenuItem(menu, items[nextIndex]);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            dismissContextMenu(menu, { restoreFocus: true });
        }
    });

    menu.addEventListener('focusout', () => {
        setTimeout(() => {
            if (menu.isConnected && !menu.contains(document.activeElement)) {
                dismissContextMenu(menu, { restoreFocus: false });
            }
        }, 0);
    });

    return firstItem;
}

/** Use the invoking element when keyboard context-menu events report (0, 0). */
export function contextMenuAnchorPoint(event, target) {
    if (Number(event?.clientX) || Number(event?.clientY)) {
        return { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
    }
    const rect = target?.getBoundingClientRect?.();
    if (!rect) return { x: 8, y: 8 };
    return {
        x: rect.left + Math.min(24, Math.max(8, rect.width / 2)),
        y: rect.top + Math.min(rect.height, 24),
    };
}

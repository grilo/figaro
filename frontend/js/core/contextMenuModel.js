/** Resolve the next enabled menu-item index for standard menu navigation. */
export function contextMenuNavigationIndex(key, currentIndex, itemCount) {
    if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
    const safeIndex = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : 0;
    if (key === 'Home') return 0;
    if (key === 'End') return itemCount - 1;
    if (key === 'ArrowDown') return (safeIndex + 1) % itemCount;
    if (key === 'ArrowUp') return (safeIndex - 1 + itemCount) % itemCount;
    return safeIndex;
}

export function isContextMenuNavigationKey(key) {
    return ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key);
}

export function isContextMenuInvocationKey(event) {
    return event?.key === 'ContextMenu' || (event?.key === 'F10' && event.shiftKey);
}

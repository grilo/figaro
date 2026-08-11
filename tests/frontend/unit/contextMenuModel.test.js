import {
    contextMenuNavigationIndex,
    isContextMenuInvocationKey,
    isContextMenuNavigationKey,
} from '../frontend/js/core/contextMenuModel.js';

describe('context-menu keyboard model', () => {
    test('wraps arrows and supports Home and End', () => {
        expect(contextMenuNavigationIndex('ArrowDown', 2, 3)).toBe(0);
        expect(contextMenuNavigationIndex('ArrowUp', 0, 3)).toBe(2);
        expect(contextMenuNavigationIndex('Home', 2, 3)).toBe(0);
        expect(contextMenuNavigationIndex('End', 0, 3)).toBe(2);
        expect(contextMenuNavigationIndex('ArrowDown', -1, 0)).toBe(-1);
    });

    test('recognizes menu navigation and keyboard invocation keys', () => {
        expect(isContextMenuNavigationKey('ArrowDown')).toBe(true);
        expect(isContextMenuNavigationKey('Enter')).toBe(false);
        expect(isContextMenuInvocationKey({ key: 'ContextMenu' })).toBe(true);
        expect(isContextMenuInvocationKey({ key: 'F10', shiftKey: true })).toBe(true);
        expect(isContextMenuInvocationKey({ key: 'F10', shiftKey: false })).toBe(false);
    });
});

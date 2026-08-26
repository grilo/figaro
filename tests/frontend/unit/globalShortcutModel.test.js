import { globalShortcutAction, isSidebarToggleShortcut } from '../frontend/js/core/globalShortcutModel.js';

describe('global shortcut policy', () => {
    test('reserves unshifted Ctrl/Cmd+B for Bold and shifts the sidebar shortcut', () => {
        expect(isSidebarToggleShortcut({ key: 'b', ctrlKey: true })).toBe(false);
        expect(isSidebarToggleShortcut({ key: 'B', metaKey: true, shiftKey: true })).toBe(true);
        expect(isSidebarToggleShortcut({ key: 'b', ctrlKey: true, shiftKey: true, altKey: true })).toBe(false);
    });

    test('distinguishes document Find from shifted global search with real shifted key casing', () => {
        expect(globalShortcutAction({ key: 'f', ctrlKey: true })).toBe('document-find');
        expect(globalShortcutAction({ key: 'F', ctrlKey: true, shiftKey: true })).toBe('global-search');
        expect(globalShortcutAction({ key: 'F', metaKey: true, shiftKey: true })).toBe('global-search');
    });

    test('maps Quick Note and daily note while ignoring key repeat and Alt combinations', () => {
        expect(globalShortcutAction({ key: 'n', ctrlKey: true })).toBe('quick-note');
        expect(globalShortcutAction({ key: 'N', metaKey: true, shiftKey: true })).toBe('daily-note');
        expect(globalShortcutAction({ key: 'n', ctrlKey: true, repeat: true })).toBeNull();
        expect(globalShortcutAction({ key: 'n', ctrlKey: true, altKey: true })).toBeNull();
    });
});

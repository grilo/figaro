import {
    globalShortcutAction, isCloseTabShortcut, isSaveShortcut, isSidebarToggleShortcut, shortcutLetter,
} from '../frontend/js/core/globalShortcutModel.js';

describe('global shortcut policy', () => {
    test('opens writing lenses on Ctrl/Cmd+Shift+L without stealing unshifted keys', () => {
        expect(globalShortcutAction({ key: 'L', ctrlKey: true, shiftKey: true })).toBe('writing-lenses');
        expect(globalShortcutAction({ key: 'L', metaKey: true, shiftKey: true })).toBe('writing-lenses');
        expect(globalShortcutAction({ key: 'l', ctrlKey: true })).toBeNull();
        expect(globalShortcutAction({ key: 'L', ctrlKey: true, shiftKey: true, repeat: true })).toBeNull();
    });
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
    test('saves and closes under Caps Lock and on layouts whose keys are not Latin letters', () => {
        expect(isSaveShortcut({ key: 's', code: 'KeyS', ctrlKey: true })).toBe(true);
        expect(isSaveShortcut({ key: 's', code: 'KeyS', metaKey: true })).toBe(true);
        // Caps Lock reports the uppercase letter without Shift.
        expect(isSaveShortcut({ key: 'S', code: 'KeyS', ctrlKey: true })).toBe(true);
        // Russian and Greek layouts type their own letters on the physical S key.
        expect(isSaveShortcut({ key: 'ы', code: 'KeyS', ctrlKey: true })).toBe(true);
        expect(isSaveShortcut({ key: 'σ', code: 'KeyS', metaKey: true })).toBe(true);
        expect(isCloseTabShortcut({ key: 'ц', code: 'KeyW', ctrlKey: true })).toBe(true);
        expect(isCloseTabShortcut({ key: 'W', code: 'KeyW', ctrlKey: true })).toBe(true);
    });

    test('keeps a Latin layout\'s own letters and never fires on character input', () => {
        // Dvorak: the physical S key types "o"; its "s" lives on another key.
        expect(isSaveShortcut({ key: 'o', code: 'KeyS', ctrlKey: true })).toBe(false);
        expect(isSaveShortcut({ key: 's', code: 'Semicolon', ctrlKey: true })).toBe(true);
        // AltGr arrives as Ctrl+Alt on Windows and types a character (Polish ś).
        expect(isSaveShortcut({ key: 'ś', code: 'KeyS', ctrlKey: true, altKey: true })).toBe(false);
        expect(isSaveShortcut({ key: 's', code: 'KeyS' })).toBe(false);
        expect(isSaveShortcut({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true })).toBe(false);
        expect(isCloseTabShortcut({ key: 's', code: 'KeyS', ctrlKey: true })).toBe(false);
        expect(shortcutLetter({ key: 'Enter', code: 'Enter' })).toBe('enter');
        expect(shortcutLetter({ key: 'Process', code: 'KeyS' })).toBe('process');
        // The other global shortcuts follow the same physical-key fallback.
        expect(globalShortcutAction({ key: 'а', code: 'KeyF', ctrlKey: true })).toBe('document-find');
    });
});

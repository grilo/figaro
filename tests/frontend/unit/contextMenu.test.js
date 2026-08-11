import {
    configureContextMenu,
    dismissContextMenu,
} from '../frontend/js/contextMenu.js';

describe('shared context-menu accessibility', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="origin">Origin</button>
            <div id="menu" class="ui-menu context-menu">
                <button class="ui-menu-item context-menu-item">First</button>
                <button class="ui-menu-item context-menu-item disabled" aria-disabled="true">Disabled</button>
                <div class="ui-menu-separator context-menu-separator"></div>
                <button class="ui-menu-item context-menu-item">Last</button>
            </div>`;
    });

    test('labels the menu, skips disabled actions, and restores focus on Escape', () => {
        const origin = document.getElementById('origin');
        const menu = document.getElementById('menu');
        origin.focus();

        configureContextMenu(menu, { label: 'Document actions', returnFocus: origin });

        expect(menu.getAttribute('role')).toBe('menu');
        expect(menu.getAttribute('aria-label')).toBe('Document actions');
        expect(menu.querySelector('.context-menu-separator').getAttribute('role')).toBe('separator');
        expect(document.activeElement.textContent).toBe('First');

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect(document.activeElement.textContent).toBe('Last');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect(document.activeElement.textContent).toBe('First');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        expect(document.activeElement.textContent).toBe('Last');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

        expect(menu.isConnected).toBe(false);
        expect(document.activeElement).toBe(origin);
    });

    test('can dismiss without moving focus', () => {
        const menu = document.getElementById('menu');
        const onDismiss = jest.fn();
        configureContextMenu(menu, { onDismiss });
        dismissContextMenu(menu, { restoreFocus: false });
        expect(menu.isConnected).toBe(false);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test('can resolve a replacement focus target after its invoking row is repainted', () => {
        const original = document.getElementById('origin');
        const menu = document.getElementById('menu');
        const replacement = document.createElement('button');
        document.body.appendChild(replacement);
        original.focus();
        configureContextMenu(menu, { returnFocus: () => replacement.focus() });
        original.remove();

        menu.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true, cancelable: true,
        }));

        expect(document.activeElement).toBe(replacement);
    });
});

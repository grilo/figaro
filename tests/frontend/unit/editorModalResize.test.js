import { makeEditorModalResizable } from '../../../frontend/js/editorModalResize.js';
import { activateModal, createDialogShell } from '../../../frontend/js/dialogs.js';

function pointerEvent(type, { pointerId = 7, ...init } = {}) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    return event;
}

describe('resizable editor modal adapter', () => {
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };

    beforeEach(() => {
        document.body.innerHTML = '<section class="custom-modal"></section>';
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    });

    afterEach(() => {
        document.body.classList.remove('custom-modal-resizing');
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalViewport.width });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalViewport.height });
    });

    test('supports pointer resize, Escape cancellation, keyboard resize, and reset', () => {
        const modal = document.querySelector('.custom-modal');
        modal.getBoundingClientRect = () => ({
            left: 100, top: 80, right: 700, bottom: 480, width: 600, height: 400,
        });
        const controller = makeEditorModalResizable(modal);
        const { handle, readout } = controller;

        expect(modal.classList.contains('custom-modal--resizable')).toBe(true);
        expect(handle.classList.contains('ui-image-resize-handle')).toBe(true);
        expect(handle.getAttribute('aria-describedby')).toBe(readout.id);
        expect(handle.getAttribute('aria-keyshortcuts')).toContain('ArrowRight');

        handle.dispatchEvent(pointerEvent('pointerdown', { clientX: 700, clientY: 480 }));
        document.dispatchEvent(pointerEvent('pointermove', { clientX: 820, clientY: 550 }));
        expect(modal.style.width).toBe('720px');
        expect(modal.style.height).toBe('470px');
        expect(document.body.classList.contains('custom-modal-resizing')).toBe(true);

        window.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true, cancelable: true,
        }));
        expect(modal.style.width).toBe('');
        expect(modal.style.height).toBe('');
        expect(modal.classList.contains('is-user-sized')).toBe(false);
        expect(document.body.classList.contains('custom-modal-resizing')).toBe(false);

        handle.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }));
        expect(modal.style.width).toBe('624px');
        expect(readout.textContent).toBe('624 × 400px');
        handle.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true,
        }));
        expect(modal.style.height).toBe('392px');

        handle.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Home', bubbles: true, cancelable: true,
        }));
        expect(modal.classList.contains('is-user-sized')).toBe(false);
        expect(modal.style.width).toBe('');
        expect(readout.textContent).toBe('Default size');

        controller.destroy();
        expect(modal.querySelector('.custom-modal-resize-handle')).toBeNull();
        expect(modal.classList.contains('custom-modal--resizable')).toBe(false);
    });

    test('leaves the CSS-managed default intact when a pointer gesture does not move', () => {
        const modal = document.querySelector('.custom-modal');
        modal.getBoundingClientRect = () => ({
            left: 100, top: 80, right: 700, bottom: 480, width: 600, height: 400,
        });
        const controller = makeEditorModalResizable(modal);

        controller.handle.dispatchEvent(pointerEvent('pointerdown', { clientX: 700, clientY: 480 }));
        document.dispatchEvent(pointerEvent('pointerup', { clientX: 700, clientY: 480 }));

        expect(modal.classList.contains('is-user-sized')).toBe(false);
        expect(modal.style.width).toBe('');
        expect(modal.style.height).toBe('');
        controller.destroy();
    });

    test('fits an existing user size back into a smaller viewport', () => {
        const modal = document.querySelector('.custom-modal');
        modal.getBoundingClientRect = () => ({
            left: 100, top: 80, right: 700, bottom: 480, width: 600, height: 400,
        });
        const controller = makeEditorModalResizable(modal);
        controller.handle.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }));

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 560 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 440 });
        window.dispatchEvent(new Event('resize'));

        expect(modal.style.left).toBe('24px');
        expect(modal.style.top).toBe('24px');
        expect(modal.style.width).toBe('512px');
        expect(modal.style.height).toBe('392px');
        controller.destroy();
    });

    test('uses Escape to cancel an active resize before the modal can close', () => {
        document.body.innerHTML = '';
        const { overlay, modal } = createDialogShell({ title: 'Resizable editor' });
        modal.getBoundingClientRect = () => ({
            left: 100, top: 80, right: 700, bottom: 480, width: 600, height: 400,
        });
        const controller = makeEditorModalResizable(modal);
        const onDismiss = jest.fn();
        activateModal(overlay, { initialFocus: controller.handle, onDismiss });

        controller.handle.dispatchEvent(pointerEvent('pointerdown', { clientX: 700, clientY: 480 }));
        document.dispatchEvent(pointerEvent('pointermove', { clientX: 800, clientY: 540 }));
        window.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true, cancelable: true,
        }));

        expect(overlay.isConnected).toBe(true);
        expect(onDismiss).not.toHaveBeenCalled();
        expect(modal.style.width).toBe('');

        controller.handle.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true, cancelable: true,
        }));
        expect(overlay.isConnected).toBe(false);
        expect(onDismiss).toHaveBeenCalledTimes(1);
        controller.destroy();
    });
});

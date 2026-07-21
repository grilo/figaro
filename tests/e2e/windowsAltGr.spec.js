import { test, expect } from '@playwright/test';

test('inserts a tilde for an AltGraph-only Windows AltGr+4 event', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    const result = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const platformDescriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });

        try {
            await editor.initEditor();
            const view = editor.getEditorView() || editor.createEditorView();
            editor.setEditorContent('');

            const event = new KeyboardEvent('keydown', {
                key: 'Dead',
                code: 'Digit4',
                bubbles: true,
                cancelable: true,
            });
            Object.defineProperty(event, 'getModifierState', {
                configurable: true,
                value: modifier => modifier === 'AltGraph',
            });

            view.contentDOM.dispatchEvent(event);
            return { defaultPrevented: event.defaultPrevented, content: view.state.doc.toString() };
        } finally {
            if (platformDescriptor) {
                Object.defineProperty(navigator, 'platform', platformDescriptor);
            } else {
                delete navigator.platform;
            }
        }
    });

    expect(result).toEqual({ defaultPrevented: true, content: '~' });
});

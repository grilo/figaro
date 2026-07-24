import { test, expect } from '@playwright/test';

test('preserves Windows Spanish dead keys for ñ, ü, accents, spacing, and cancellation', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    // Let the application's deferred initial document mount finish before the
    // synthetic compatibility events exercise the shared EditorView.
    await page.waitForTimeout(100);

    const result = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const platformDescriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });

        try {
            await editor.initEditor();
            const view = editor.getEditorView() || editor.createEditorView();
            const dispatchKey = ({ key, code, altGraph = false, shiftKey = false }) => {
                const event = new KeyboardEvent('keydown', {
                    key,
                    code,
                    shiftKey,
                    bubbles: true,
                    cancelable: true,
                });
                if (altGraph) {
                    Object.defineProperty(event, 'getModifierState', {
                        configurable: true,
                        value: modifier => modifier === 'AltGraph',
                    });
                }
                view.contentDOM.dispatchEvent(event);
                return event;
            };
            const deadKey = () => dispatchKey({ key: 'Dead', code: 'Digit4', altGraph: true });

            editor.setEditorContent('');
            const composeEnye = deadKey();
            const enye = dispatchKey({ key: 'n', code: 'KeyN' });
            const enyeResult = view.state.doc.toString();

            const composeTilde = deadKey();
            const tilde = dispatchKey({ key: ' ', code: 'Space' });
            const tildeResult = view.state.doc.toString();

            const composeUmlaut = dispatchKey({ key: 'Dead', code: 'Semicolon', shiftKey: true });
            const umlaut = dispatchKey({ key: 'u', code: 'KeyU' });
            dispatchKey({ key: 'Dead', code: 'Semicolon' });
            const acute = dispatchKey({ key: 'a', code: 'KeyA' });
            dispatchKey({ key: 'Dead', code: 'BracketLeft' });
            const grave = dispatchKey({ key: 'a', code: 'KeyA' });
            dispatchKey({ key: 'Dead', code: 'BracketLeft', shiftKey: true });
            const circumflex = dispatchKey({ key: 'a', code: 'KeyA' });
            const accentResult = view.state.doc.toString();
            deadKey();
            const spacingFallback = dispatchKey({ key: 'q', code: 'KeyQ' });
            const spacingFallbackResult = view.state.doc.toString();

            const contentBeforeCancellation = view.state.doc.toString();
            deadKey();
            const backspace = dispatchKey({ key: 'Backspace', code: 'Backspace' });
            const plainN = dispatchKey({ key: 'n', code: 'KeyN' });
            deadKey();
            const escape = dispatchKey({ key: 'Escape', code: 'Escape' });
            const plainNAfterEscape = dispatchKey({ key: 'n', code: 'KeyN' });

            return {
                composeEnyePrevented: composeEnye.defaultPrevented,
                enyePrevented: enye.defaultPrevented,
                enyeResult,
                composeTildePrevented: composeTilde.defaultPrevented,
                tildePrevented: tilde.defaultPrevented,
                tildeResult,
                composeUmlautPrevented: composeUmlaut.defaultPrevented,
                umlautPrevented: umlaut.defaultPrevented,
                acutePrevented: acute.defaultPrevented,
                gravePrevented: grave.defaultPrevented,
                circumflexPrevented: circumflex.defaultPrevented,
                accentResult,
                spacingFallbackPrevented: spacingFallback.defaultPrevented,
                spacingFallbackResult,
                backspacePrevented: backspace.defaultPrevented,
                backspaceResult: view.state.doc.toString(),
                contentBeforeCancellation,
                plainNPrevented: plainN.defaultPrevented,
                escapePrevented: escape.defaultPrevented,
                plainNAfterEscapePrevented: plainNAfterEscape.defaultPrevented,
            };
        } finally {
            if (platformDescriptor) {
                Object.defineProperty(navigator, 'platform', platformDescriptor);
            } else {
                delete navigator.platform;
            }
        }
    });

    expect(result).toEqual({
        composeEnyePrevented: true,
        enyePrevented: true,
        enyeResult: 'ñ',
        composeTildePrevented: true,
        tildePrevented: true,
        tildeResult: 'ñ~',
        composeUmlautPrevented: true,
        umlautPrevented: true,
        acutePrevented: true,
        gravePrevented: true,
        circumflexPrevented: true,
        accentResult: 'ñ~üáàâ',
        spacingFallbackPrevented: true,
        spacingFallbackResult: 'ñ~üáàâ~q',
        backspacePrevented: true,
        backspaceResult: 'ñ~üáàâ~q',
        contentBeforeCancellation: 'ñ~üáàâ~q',
        plainNPrevented: false,
        escapePrevented: true,
        plainNAfterEscapePrevented: false,
    });
});

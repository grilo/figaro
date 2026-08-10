import { test, expect } from '@playwright/test';

test('keeps one Vim backtick across Windows composition timing while preserving Spanish dead keys', async ({ page }) => {
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
            const { Vim, getCM } = await import('@replit/codemirror-vim');
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
            const dispatchKeyup = ({ key, code }) => {
                const event = new KeyboardEvent('keyup', {
                    key,
                    code,
                    bubbles: true,
                    cancelable: true,
                });
                view.contentDOM.dispatchEvent(event);
                return event;
            };
            const dispatchText = ({ type, inputType, data, cancelable }) => {
                const event = new InputEvent(type, {
                    inputType,
                    data,
                    bubbles: true,
                    cancelable,
                });
                view.contentDOM.dispatchEvent(event);
                return event;
            };
            const replaceDocument = (content, anchor = 0) => {
                view.dispatch({
                    changes: { from: 0, to: view.state.doc.length, insert: content },
                    selection: { anchor },
                });
            };
            const deadKey = () => dispatchKey({ key: 'Dead', code: 'Digit4', altGraph: true });

            replaceDocument('');
            await editor.toggleVim(true);
            Vim.handleKey(getCM(view), 'i', 'user');
            dispatchKey({ key: 'Dead', code: 'BracketLeft' });
            const spacingGrave = dispatchKey({ key: ' ', code: 'Space' });
            const nativeComposition = dispatchText({
                type: 'beforeinput',
                inputType: 'insertCompositionText',
                data: '`',
                cancelable: true,
            });
            if (!nativeComposition.defaultPrevented) editor.insertTextAtCursor(view, '`');
            dispatchText({
                type: 'input',
                inputType: 'insertCompositionText',
                data: '`',
                cancelable: false,
            });
            await new Promise(resolve => setTimeout(resolve, 0));
            const delayedLegacyText = dispatchText({
                type: 'beforeinput',
                inputType: 'insertText',
                data: '`',
                cancelable: true,
            });
            if (!delayedLegacyText.defaultPrevented) editor.insertTextAtCursor(view, '`');
            const vimBacktickResult = view.state.doc.toString();

            replaceDocument('');
            dispatchKey({ key: 'Dead', code: 'BracketLeft' });
            dispatchKey({ key: ' ', code: 'Space' });
            dispatchKeyup({ key: ' ', code: 'Space' });
            const fallbackBacktickResult = view.state.doc.toString();
            const nonCancelableComposition = dispatchText({
                type: 'beforeinput',
                inputType: 'insertCompositionText',
                data: '`',
                cancelable: false,
            });
            if (!nonCancelableComposition.defaultPrevented) editor.insertTextAtCursor(view, '`');
            dispatchText({
                type: 'input',
                inputType: 'insertCompositionText',
                data: '`',
                cancelable: false,
            });
            await new Promise(resolve => setTimeout(resolve, 0));
            const repairedBacktickResult = view.state.doc.toString();

            replaceDocument('');
            dispatchKey({ key: 'Dead', code: 'BracketLeft' });
            dispatchKey({ key: ' ', code: 'Space' });
            dispatchKeyup({ key: ' ', code: 'Space' });
            const line = view.contentDOM.querySelector('.cm-line');
            const textNode = line?.firstChild;
            if (!(textNode instanceof Text)) throw new Error('Expected the backtick text node');
            textNode.nodeValue += '`';
            window.getSelection()?.collapse(textNode, textNode.nodeValue.length);
            dispatchText({
                type: 'input',
                inputType: 'insertCompositionText',
                data: null,
                cancelable: false,
            });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const nativeDomMutationResult = view.state.doc.toString();

            replaceDocument('');
            for (let index = 0; index < 3; index += 1) {
                dispatchKey({ key: 'Dead', code: 'BracketLeft' });
                dispatchKey({ key: ' ', code: 'Space' });
                dispatchKeyup({ key: ' ', code: 'Space' });
                const codeFenceLine = view.contentDOM.querySelector('.cm-line');
                const codeFenceText = codeFenceLine?.firstChild;
                if (!(codeFenceText instanceof Text)) throw new Error('Expected code-fence text');
                codeFenceText.nodeValue += '`';
                window.getSelection()?.collapse(codeFenceText, codeFenceText.nodeValue.length);
                dispatchText({
                    type: 'input',
                    inputType: 'insertCompositionText',
                    data: null,
                    cancelable: false,
                });
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }
            const nativeCodeFenceResult = view.state.doc.toString();

            replaceDocument('top\n`\nbottom', 5);
            view.focus();
            dispatchKey({ key: 'ArrowDown', code: 'ArrowDown' });
            await new Promise(resolve => setTimeout(resolve, 0));
            const arrowDownLine = view.state.doc.lineAt(view.state.selection.main.head).number;
            dispatchKey({ key: 'ArrowUp', code: 'ArrowUp' });
            await new Promise(resolve => setTimeout(resolve, 0));
            const arrowUpLine = view.state.doc.lineAt(view.state.selection.main.head).number;
            await editor.toggleVim(false);

            replaceDocument('');
            await new Promise(resolve => setTimeout(resolve, 80));
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
                vimBacktickResult,
                fallbackBacktickResult,
                repairedBacktickResult,
                nativeDomMutationResult,
                nativeCodeFenceResult,
                arrowDownLine,
                arrowUpLine,
                spacingGravePrevented: spacingGrave.defaultPrevented,
                nativeCompositionPrevented: nativeComposition.defaultPrevented,
                delayedLegacyTextPrevented: delayedLegacyText.defaultPrevented,
                nonCancelableCompositionPrevented: nonCancelableComposition.defaultPrevented,
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
        vimBacktickResult: '`',
        fallbackBacktickResult: '`',
        repairedBacktickResult: '`',
        nativeDomMutationResult: '`',
        nativeCodeFenceResult: '```',
        arrowDownLine: 3,
        arrowUpLine: 2,
        spacingGravePrevented: true,
        nativeCompositionPrevented: false,
        delayedLegacyTextPrevented: true,
        nonCancelableCompositionPrevented: false,
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

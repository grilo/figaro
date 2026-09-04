import { test, expect } from '@playwright/test';

test('keeps browser-supplied text intact while emulating Windows platform detection', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.waitForTimeout(100);

    const platformDescriptor = await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
        return descriptor ? {
            configurable: descriptor.configurable,
            enumerable: descriptor.enumerable,
            value: descriptor.value,
            writable: descriptor.writable,
        } : null;
    });

    try {
        await page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            await editor.initEditor();
            const view = editor.getEditorView() || editor.createEditorView();
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: '' },
                selection: { anchor: 0 },
            });
            view.focus();
        });
        await page.locator('.cm-content').click();

        await page.keyboard.insertText('`');
        await expect.poll(() => page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            return editor.getEditorView().state.doc.toString();
        })).toBe('`');

        await page.keyboard.insertText('``');
        await page.keyboard.insertText(' João ã');
        await expect.poll(() => page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            return editor.getEditorView().state.doc.toString();
        })).toBe('``` João ã');

        const regularDeadKeys = await page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            const view = editor.getEditorView();
            const dispatch = ({ key, code, altGraph = false }) => {
                const event = new KeyboardEvent('keydown', {
                    key,
                    code,
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
                return event.defaultPrevented;
            };
            return {
                backtick: dispatch({ key: '`', code: 'BracketLeft' }),
                tilde: dispatch({ key: 'Dead', code: 'Digit4', altGraph: true }),
                bracket: dispatch({ key: 'Dead', code: 'BracketLeft' }),
            };
        });
        expect(regularDeadKeys).toEqual({ backtick: false, tilde: false, bracket: false });

        await page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            const { Vim, getCM } = await import('@replit/codemirror-vim');
            const view = editor.getEditorView();
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: '' },
                selection: { anchor: 0 },
            });
            await editor.toggleVim(true);
            Vim.handleKey(getCM(view), 'i', 'user');
            view.focus();
        });
        await page.locator('.cm-content').click();

        await page.keyboard.insertText('`');
        await page.keyboard.insertText('``');
        await page.keyboard.insertText(' ã');
        await expect.poll(() => page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            return editor.getEditorView().state.doc.toString();
        })).toBe('``` ã');

        const vimTildePrevented = await page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            const view = editor.getEditorView();
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
            return event.defaultPrevented;
        });
        expect(vimTildePrevented).toBe(false);

        const cursorLines = await page.evaluate(async () => {
            const editor = await import('/js/editor.js');
            const view = editor.getEditorView();
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: 'top\n```\nbottom' },
                selection: { anchor: 4 },
            });
            view.focus();
            const dispatchArrow = key => view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
                key,
                code: key,
                bubbles: true,
                cancelable: true,
            }));
            dispatchArrow('ArrowDown');
            await new Promise(resolve => setTimeout(resolve, 0));
            const down = view.state.doc.lineAt(view.state.selection.main.head).number;
            dispatchArrow('ArrowUp');
            await new Promise(resolve => setTimeout(resolve, 0));
            const up = view.state.doc.lineAt(view.state.selection.main.head).number;
            await editor.toggleVim(false);
            return { down, up };
        });
        expect(cursorLines).toEqual({ down: 3, up: 2 });
    } finally {
        if (!page.isClosed()) await page.evaluate((descriptor) => {
            if (descriptor) {
                Object.defineProperty(navigator, 'platform', descriptor);
            } else {
                delete navigator.platform;
            }
        }, platformDescriptor);
    }
});

import { expect, test } from '@playwright/test';

const tableSource = [
    'Before',
    '',
    '| Name | Status | Total |',
    '| :--- | :---: | ---: |',
    '| Alpha | Ready | 12 |',
    '| Beta | Waiting | 3 |',
    '',
    'After',
].join('\n');

async function activeCell(page) {
    return page.evaluate(() => {
        const cell = document.activeElement?.closest?.('.tbl-cell');
        return cell ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } : null;
    });
}

async function activeNestedEditorState(page) {
    return page.evaluate(() => {
        const rootView = window.__figaroTableTestView;
        const content = document.activeElement?.closest?.('.tbl-cell-editor .cm-content');
        const nestedView = content ? rootView.constructor.findFromDOM(content) : null;
        const cell = content?.closest('.tbl-cell');
        if (!nestedView || !cell) return null;
        const selection = nestedView.state.selection.main;
        return {
            row: Number(cell.dataset.row),
            col: Number(cell.dataset.col),
            text: nestedView.state.doc.toString(),
            anchor: selection.anchor,
            head: selection.head,
            mode: nestedView.dom.dataset.vimMode || null,
        };
    });
}

async function createMarkdownEditor(page, source) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('#editor-container > .cm-editor')).toBeVisible();
    await page.waitForFunction(async () => {
        const editor = await import('/js/editor.js');
        return editor.getEditorDocumentTabId() === 'Welcome.md';
    });
    await page.evaluate(async (content) => {
        const editor = await import('/js/editor.js');
        const view = editor.getEditorView();
        window.__figaroTableTestPreviousContent = view.state.doc.toString();
        editor.setEditorContent(content, 'Welcome.md');
        window.__figaroTableTestView = view;
    }, source);
    await page.waitForFunction(() => (
        window.__figaroTableTestView?.state.doc.toString()
        !== window.__figaroTableTestPreviousContent
    ));
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    });
}

test('deletes a whole table from its direct control and restores it with undo', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    const widget = page.locator('.tbl-table-widget');
    const deleteButton = page.getByRole('button', { name: 'Delete table' });
    await expect(widget).toBeVisible();
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toHaveClass(/ui-button--danger-ghost/);
    const sourceBeforeDelete = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    await deleteButton.click();
    await expect(widget).toHaveCount(0);
    await expect(deleteButton).toHaveCount(0);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).not.toContain('|');
    await expect(page.locator('#editor-container > .cm-editor')).toHaveClass(/cm-focused/);

    await page.keyboard.press('Control+z');
    await expect(widget).toBeVisible();
    await expect(deleteButton).toBeVisible();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(sourceBeforeDelete);
});

async function nestedInsertCaretState(page) {
    // CodeMirror measures and paints its cursor layer on an animation frame.
    // Wait for that paint rather than observing the previous modal cursor.
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    return page.evaluate(() => {
        const root = window.__figaroTableTestView.dom;
        const nestedEditor = document.activeElement.closest('.tbl-cell-editor .cm-editor');
        const outerLayers = Array.from(root.querySelectorAll(':scope > .cm-scroller > .cm-cursorLayer'));
        const cursorLayer = nestedEditor.querySelector(
            ':scope > .cm-scroller > .cm-cursorLayer:not(.cm-vimCursorLayer)',
        );
        const cursor = cursorLayer.querySelector('.cm-cursor');
        const layerStyle = getComputedStyle(cursorLayer);
        const cursorStyle = getComputedStyle(cursor);
        const cursorRect = cursor.getBoundingClientRect();
        const cellRect = nestedEditor.closest('.tbl-cell').getBoundingClientRect();
        const domSelection = document.getSelection();
        const domCaret = document.createRange();
        domCaret.setStart(domSelection.focusNode, domSelection.focusOffset);
        domCaret.collapse(true);
        const domCaretRect = domCaret.getClientRects()[0] || domCaret.getBoundingClientRect();
        return {
            rootHasCellFocus: root.classList.contains('cm-table-cell-focused'),
            outer: outerLayers.map(layer => getComputedStyle(layer).visibility),
            mode: nestedEditor.dataset.vimMode,
            layer: {
                display: layerStyle.display,
                visibility: layerStyle.visibility,
                opacity: layerStyle.opacity,
            },
            cursor: {
                visibility: cursorStyle.visibility,
                display: cursorStyle.display,
                opacity: cursorStyle.opacity,
                background: cursorStyle.backgroundColor,
                borderWidth: cursorStyle.borderLeftWidth,
                borderStyle: cursorStyle.borderLeftStyle,
                borderColor: cursorStyle.borderLeftColor,
                animationName: cursorStyle.animationName,
                rect: {
                    left: cursorRect.left,
                    right: cursorRect.right,
                    top: cursorRect.top,
                    bottom: cursorRect.bottom,
                    height: cursorRect.height,
                },
            },
            cell: {
                left: cellRect.left,
                right: cellRect.right,
                top: cellRect.top,
                bottom: cellRect.bottom,
            },
            domCaret: {
                left: domCaretRect.left,
                top: domCaretRect.top,
                bottom: domCaretRect.bottom,
            },
        };
    });
}

function expectNestedInsertCaret(caretState) {
    expect(caretState.rootHasCellFocus).toBe(true);
    expect(caretState.outer.length).toBeGreaterThan(0);
    expect(caretState.outer.every(visibility => visibility === 'hidden')).toBe(true);
    expect(caretState.mode).toBe('insert');
    expect(caretState.layer.display).not.toBe('none');
    expect(caretState.layer.visibility).toBe('visible');
    expect(Number.parseFloat(caretState.layer.opacity)).toBeGreaterThan(0.9);
    expect(caretState.cursor.visibility).toBe('visible');
    expect(caretState.cursor.display).not.toBe('none');
    expect(Number.parseFloat(caretState.cursor.opacity)).toBeGreaterThan(0.9);
    expect(caretState.cursor.background).toBe('rgba(0, 0, 0, 0)');
    expect(caretState.cursor.borderWidth).toBe('4px');
    expect(caretState.cursor.borderStyle).toBe('solid');
    expect(caretState.cursor.borderColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(caretState.cursor.animationName).toBe('none');
    expect(caretState.cursor.rect.height).toBeGreaterThan(10);
    expect(caretState.cursor.rect.left).toBeGreaterThanOrEqual(caretState.cell.left);
    expect(caretState.cursor.rect.right).toBeLessThanOrEqual(caretState.cell.right);
    expect(Math.abs(caretState.cursor.rect.left - caretState.domCaret.left)).toBeLessThanOrEqual(2);
    expect(caretState.cursor.rect.bottom).toBeGreaterThan(caretState.domCaret.top);
    expect(caretState.cursor.rect.top).toBeLessThan(caretState.domCaret.bottom);
}

async function nestedVimBlockCursorState(page) {
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    return page.evaluate(() => {
        const nestedEditor = document.activeElement?.closest('.tbl-cell-editor .cm-editor');
        const cursorLayer = nestedEditor?.querySelector(
            ':scope > .cm-scroller > .cm-vimCursorLayer',
        );
        const cursor = cursorLayer?.querySelector('.cm-fat-cursor');
        const cursorStyle = cursor ? getComputedStyle(cursor) : null;
        const cursorRect = cursor?.getBoundingClientRect();
        const cellRect = nestedEditor?.closest('.tbl-cell')?.getBoundingClientRect();
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--cursor-bg)';
        probe.style.color = 'var(--cursor-text)';
        nestedEditor?.appendChild(probe);
        const probeStyle = getComputedStyle(probe);
        const expected = {
            background: probeStyle.backgroundColor,
            color: probeStyle.color,
        };
        probe.remove();
        return {
            mode: nestedEditor?.dataset.vimMode || null,
            status: document.getElementById('file-type')?.textContent || '',
            expected,
            cursor: cursorStyle && cursorRect ? {
                background: cursorStyle.backgroundColor,
                color: cursorStyle.color,
                borderColor: cursorStyle.borderColor,
                opacity: cursorStyle.opacity,
                visibility: cursorStyle.visibility,
                width: cursorRect.width,
                height: cursorRect.height,
                left: cursorRect.left,
                right: cursorRect.right,
                top: cursorRect.top,
                bottom: cursorRect.bottom,
            } : null,
            cell: cellRect ? {
                left: cellRect.left,
                right: cellRect.right,
                top: cellRect.top,
                bottom: cellRect.bottom,
            } : null,
        };
    });
}

async function rootVimBlockCursorState(page) {
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    return page.evaluate(() => {
        const root = window.__figaroTableTestView.dom;
        const cursor = root.querySelector(
            ':scope > .cm-scroller > .cm-vimCursorLayer .cm-fat-cursor',
        );
        const cursorStyle = cursor ? getComputedStyle(cursor) : null;
        const cursorRect = cursor?.getBoundingClientRect();
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--cursor-bg)';
        probe.style.color = 'var(--cursor-text)';
        root.appendChild(probe);
        const probeStyle = getComputedStyle(probe);
        const expected = {
            background: probeStyle.backgroundColor,
            color: probeStyle.color,
        };
        probe.remove();
        return {
            activeElement: document.activeElement?.className || '',
            classes: root.className,
            hasFocus: root.classList.contains('cm-focused'),
            mode: document.getElementById('file-type')?.textContent || '',
            expected,
            cursor: cursorStyle && cursorRect ? {
                background: cursorStyle.backgroundColor,
                color: cursorStyle.color,
                outlineColor: cursorStyle.outlineColor,
                outlineStyle: cursorStyle.outlineStyle,
                visibility: cursorStyle.visibility,
                opacity: cursorStyle.opacity,
                width: cursorRect.width,
                height: cursorRect.height,
            } : null,
        };
    });
}

test('creates a table from the empty-line pipe autocomplete and keeps mouse and keyboard entry cursor-safe', async ({ page }) => {
    await createMarkdownEditor(page, 'Before\n\nAfter');
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });

    await page.keyboard.type('|');
    const completion = page.locator('.cm-tooltip-autocomplete');
    await expect(completion).toBeVisible();
    await expect(completion.locator('li')).toHaveCount(3);
    await expect(completion).toContainText('2×2 table');
    await expect(completion).toContainText('3×3 table');
    await expect(completion).toContainText('4×4 table');
    await page.keyboard.press('Enter');

    const widget = page.locator('.tbl-table-widget');
    await expect(widget).toBeVisible();
    await expect(widget.locator('thead .tbl-cell')).toHaveCount(2);
    await expect(widget.locator('tbody .tbl-table-row')).toHaveCount(1);

    // A real mouse click must land in the generated cell editor rather than
    // in the replaced Markdown source behind the block widget.
    await widget.locator('tbody .tbl-cell-view').first().click();
    await expect(widget.locator('tbody .tbl-cell').first().locator('.tbl-cell-editor .cm-content')).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    const webkitShiftTab = await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
            key: 'Unidentified',
            code: 'Tab',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        const dispatched = document.activeElement.dispatchEvent(event);
        return { dispatched, defaultPrevented: event.defaultPrevented };
    });
    expect(webkitShiftTab).toEqual({ dispatched: false, defaultPrevented: true });
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Enter');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });

    // The generated widget must also retain exact document-line transitions
    // from both surrounding source lines.
    const tableBounds = await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        const lines = view.state.doc.toString().split('\n');
        const startIndex = lines.findIndex(line => line.startsWith('|'));
        let afterIndex = startIndex;
        while (afterIndex < lines.length && lines[afterIndex].startsWith('|')) afterIndex += 1;
        return { start: startIndex + 1, end: afterIndex + 1 };
    });
    await page.evaluate(({ start }) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(start - 1).from } });
        view.focus();
    }, tableBounds);
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toEqual({ row: 0, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toBeNull();
    await page.evaluate(({ end }) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(end).from } });
        view.focus();
    }, tableBounds);
    await page.keyboard.press('ArrowUp');
    expect((await activeCell(page))?.col).toBe(1);
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toBeNull();

    // Drag selection must cross the replaced source cleanly in either
    // direction, without the table's cell-selection layer trapping the mouse.
    const dragPoints = await page.evaluate(({ start, end }) => {
        const view = window.__figaroTableTestView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 3, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            above: point(view.state.doc.line(start - 1).from),
            below: point(view.state.doc.line(end).from),
            tableFrom: view.state.doc.line(start).from,
            tableTo: view.state.doc.line(end - 1).to,
        };
    }, tableBounds);
    for (const [origin, target] of [[dragPoints.above, dragPoints.below], [dragPoints.below, dragPoints.above]]) {
        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        await page.mouse.move(target.x, target.y, { steps: 8 });
        await page.mouse.up();
        const selection = await page.evaluate(() => {
            const range = window.__figaroTableTestView.state.selection.main;
            return { from: range.from, to: range.to };
        });
        expect(selection.from).toBeLessThanOrEqual(dragPoints.tableFrom);
        expect(selection.to).toBeGreaterThanOrEqual(dragPoints.tableTo);
    }
});

test('normal keyboard and context-menu paste automatically convert clear clipboard tables but preserve ordinary text', async ({ page }) => {
    await createMarkdownEditor(page, 'Before\n\nAfter');
    const keyboardPaste = await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
        const transfer = new DataTransfer();
        transfer.setData('text/plain', 'Name\tCount\nAlpha\t2');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        const dispatched = view.contentDOM.dispatchEvent(event);
        return { dispatched, defaultPrevented: event.defaultPrevented };
    });
    expect(keyboardPaste).toEqual({ dispatched: false, defaultPrevented: true });
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
    await expect(page.locator('.tbl-table-widget tbody .tbl-table-row')).toHaveCount(1);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toContain('Alpha');

    // The existing Paste menu action follows the same conversion path; there
    // is deliberately no separate “Paste as table” command.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Before\n\nAfter' } });
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: async () => 'Item\tStatus\nDraft\tReady' },
        });
        const coords = view.coordsAtPos(view.state.doc.line(2).from);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    });
    await page.locator('.editor-context-menu [data-action="paste"]').click();
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toContain('Draft');

    const existingGFM = '| Existing | Count |\n| --- | --- |\n| Alpha | 2 |';
    await page.evaluate((source) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Before\n\nAfter' } });
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: async () => source },
        });
        const coords = view.coordsAtPos(view.state.doc.line(2).from);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    }, existingGFM);
    await page.locator('.editor-context-menu [data-action="paste"]').click();
    const pastedGFM = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    expect(pastedGFM).toContain('| Existing');
    expect(pastedGFM).toContain('| Alpha');
    expect(pastedGFM).not.toContain('| After');
    expect(pastedGFM).toMatch(/\n\nAfter$/);

    const plainFallthrough = await page.evaluate(async () => {
        const tables = await import('/js/clipboardTable.js');
        const view = window.__figaroTableTestView;
        const transfer = new DataTransfer();
        transfer.setData('text/plain', 'This remains ordinary prose.');
        const preventDefault = () => { window.__plainPastePrevented = true; };
        window.__plainPastePrevented = false;
        const claimed = tables.handleClipboardTablePaste({ clipboardData: transfer, preventDefault }, view);
        return { claimed, prevented: window.__plainPastePrevented };
    });
    expect(plainFallthrough).toEqual({ claimed: false, prevented: false });

    const nonMarkdownPaste = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const view = window.__figaroTableTestView;
        await editor.configureEditorForFile('notes/data.txt');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Before\n\nAfter' } });
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
        const transfer = new DataTransfer();
        transfer.setData('text/plain', 'Name\tCount\nAlpha\t2');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        view.contentDOM.dispatchEvent(event);
        return view.state.doc.toString();
    });
    expect(nonMarkdownPaste).not.toContain('| Name');
});

test('previews selection conversion and leaves the source untouched on cancellation before one undoable replacement', async ({ page }) => {
    const source = 'Before\n\nName,Count\nAlpha,2\nBeta,3\n\nAfter';
    await createMarkdownEditor(page, source);

    const openConversion = async () => page.evaluate(() => {
        const view = window.__figaroTableTestView;
        const text = view.state.doc.toString();
        const from = text.indexOf('Name,Count');
        const to = text.indexOf('\n\nAfter');
        view.dispatch({ selection: { anchor: from, head: to } });
        view.focus();
        const coords = view.coordsAtPos(from + 2);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    });

    await openConversion();
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();
    const dialog = page.locator('.table-conversion-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.table-conversion-summary')).toContainText('Comma detected');
    await expect(dialog.locator('.table-conversion-preview')).toContainText('| Name | Count |');
    await dialog.locator('.custom-modal-btn-cancel').click();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(source);

    await openConversion();
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: view.state.doc.length, insert: '\nConcurrent edit' } });
    });
    await page.locator('.table-conversion-modal .custom-modal-btn-confirm').click();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString()))
        .toBe(`${source}\nConcurrent edit`);
    await page.evaluate((original) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: original } });
    }, source);

    await openConversion();
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();
    await page.locator('.table-conversion-modal .custom-modal-btn-confirm').click();
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
    await expect(page.locator('.tbl-table-widget tbody .tbl-table-row')).toHaveCount(2);
    const converted = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    expect(converted).toContain('| Name');
    expect(converted).toContain('| Alpha');
    expect(converted).not.toContain('Name,Count');

    await page.evaluate(() => window.__figaroTableTestView.focus());
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(() => page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(source);
});

test('themes the table delimiter combobox and operates it by keyboard', async ({ page }) => {
    const source = 'Name,Count\nAlpha,2';
    await createMarkdownEditor(page, source);
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
        const coords = view.coordsAtPos(2);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    });
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();

    const trigger = page.locator('.table-conversion-combobox .select-combobox-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('role', 'combobox');
    const styles = await trigger.evaluate(element => {
        const computed = getComputedStyle(element);
        return { background: computed.backgroundColor, border: computed.borderStyle, radius: Number.parseFloat(computed.borderRadius) };
    });
    expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.border).toBe('solid');
    expect(styles.radius).toBeGreaterThanOrEqual(6);

    await trigger.press('ArrowDown');
    await trigger.press('End');
    await trigger.press('Enter');
    await expect(trigger).toContainText('Pipe');
    await page.locator('.table-conversion-modal .custom-modal-btn-cancel').click();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(source);
});

test('renders interactive Markdown tables and keeps cursor movement bounded to adjacent lines and cells', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);

    const widget = page.locator('.tbl-table-widget');
    await expect(widget).toBeVisible();
    await expect(widget.locator('thead .tbl-cell')).toHaveCount(3);
    await expect(widget.locator('tbody .tbl-table-row')).toHaveCount(2);
    await expect(widget.locator('tbody .tbl-cell').nth(1)).toHaveAttribute('align', 'center');
    await expect(widget.locator('tbody .tbl-cell').nth(2)).toHaveAttribute('align', 'right');

    // Arrow Down from the source line above enters the first cell; Arrow Up
    // leaves it on exactly that adjacent source line rather than skipping.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toEqual({ row: 0, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);

    // The reverse transition enters the final cell and returns to the source
    // line below, exercising CodeMirror's measured block height both ways.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(7).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 2, col: 2 });
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(7);

    // Clicking exposes the cell editor. Once active, Tab/Shift+Tab move
    // horizontally, Enter moves down, and Arrow Up returns up the column.
    await widget.locator('tbody .tbl-cell-view').first().click();
    await expect(widget.locator('tbody .tbl-cell').first().locator('.tbl-cell-editor .cm-content')).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    await page.keyboard.press('Shift+Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Enter');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
});

test('uses Vim Normal and Insert modes inside interactive Markdown table cells', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const firstBodyCell = page.locator('.tbl-table-widget tbody .tbl-cell-view').first();
    await firstBodyCell.click();
    const cellEditor = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').first();
    await expect(cellEditor).toBeFocused();
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    await cellEditor.press('j');
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);

    await cellEditor.press('i');
    await cellEditor.press('x');
    await cellEditor.press('Escape');
    const afterInsert = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    expect(afterInsert).not.toBe(before);
    expect(afterInsert).toContain('x');
    expect(afterInsert).not.toContain('j');
});

test('paints the nested Vim Insert caret at the active table-cell position', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const cellView = page.locator('.tbl-table-widget tbody .tbl-cell-view').first();
    await cellView.click();
    const cellEditor = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').first();
    await expect(cellEditor).toBeFocused();
    await cellEditor.press('i');
    expectNestedInsertCaret(await nestedInsertCaretState(page));
    await cellEditor.press('x');
    expectNestedInsertCaret(await nestedInsertCaretState(page));

    // WebKitGTK can leave this CodeMirror cursor layer empty. Exercise the
    // CSS fallback explicitly: the native caret must become visible only when
    // no custom cursor exists, avoiding a doubled caret in Chromium.
    const nativeFallback = await page.evaluate(() => {
        const nestedEditor = document.activeElement.closest('.tbl-cell-editor .cm-editor');
        const cursorLayer = nestedEditor.querySelector(
            ':scope > .cm-scroller > .cm-cursorLayer:not(.cm-vimCursorLayer)',
        );
        cursorLayer.replaceChildren();
        const content = nestedEditor.querySelector('.cm-content');
        return {
            layerEmpty: cursorLayer.matches(':empty'),
            caretColor: getComputedStyle(content).caretColor,
        };
    });
    expect(nativeFallback.layerEmpty).toBe(true);
    expect(nativeFallback.caretColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(nativeFallback.caretColor).not.toBe('transparent');
});

test('paints nested Vim Normal and Replace cursors and reports the focused cell mode', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    const cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();

    const expectVisibleCursor = (state, mode, status) => {
        expect(state.mode).toBe(mode);
        expect(state.status).toBe(status);
        expect(state.cursor).not.toBeNull();
        expect(state.cell).not.toBeNull();
        expect(state.cursor.visibility).toBe('visible');
        expect(Number.parseFloat(state.cursor.opacity)).toBeGreaterThan(0.9);
        expect(state.cursor.background).not.toBe('rgba(0, 0, 0, 0)');
        if (mode === 'normal') {
            expect(state.cursor.background).toBe(state.expected.background);
            expect(state.cursor.color).toBe(state.expected.color);
            expect(state.cursor.background).not.toBe('rgb(255, 150, 150)');
        }
        expect(state.cursor.width).toBeGreaterThan(1);
        expect(state.cursor.height).toBeGreaterThan(1);
        expect(state.cursor.left).toBeGreaterThanOrEqual(state.cell.left);
        expect(state.cursor.right).toBeLessThanOrEqual(state.cell.right);
        expect(state.cursor.top).toBeGreaterThanOrEqual(state.cell.top);
        expect(state.cursor.bottom).toBeLessThanOrEqual(state.cell.bottom);
    };

    expectVisibleCursor(await nestedVimBlockCursorState(page), 'normal', 'NORMAL');

    // A table move focuses a different embedded CodeMirror instance. Its
    // newly created Vim cursor must retain the same theme token mapping.
    await cellContent.press('j');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    expectVisibleCursor(await nestedVimBlockCursorState(page), 'normal', 'NORMAL');
    await page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content').press('k');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    expectVisibleCursor(await nestedVimBlockCursorState(page), 'normal', 'NORMAL');

    await cellContent.press('Shift+R');
    expectVisibleCursor(await nestedVimBlockCursorState(page), 'replace', 'REPLACE');

    await cellContent.press('Escape');
    expectVisibleCursor(await nestedVimBlockCursorState(page), 'normal', 'NORMAL');

    await cellContent.press('i');
    await expect(page.locator('#file-type')).toHaveText('INSERT');
    await cellContent.press('Escape');
    await expect(page.locator('#file-type')).toHaveText('NORMAL');

    await cellContent.press('v');
    await expect(page.locator('#file-type')).toHaveText('VISUAL');
    await cellContent.press('Escape');
    await cellContent.press('Shift+V');
    await expect(page.locator('#file-type')).toHaveText('VISUAL LINE');
    await cellContent.press('Escape');
    await cellContent.press('Control+v');
    await expect(page.locator('#file-type')).toHaveText('VISUAL BLOCK');
    await cellContent.press('Escape');

    // Focusing the root note returns the status bar to its own Normal state.
    // The table widget may retain or rebuild its embedded editor during that
    // handoff, so returning to the cell must report the mode of the editor
    // that actually received focus rather than a stale status from either one.
    await cellContent.press('i');
    await expect(page.locator('#file-type')).toHaveText('INSERT');
    await page.evaluate(() => window.__figaroTableTestView.focus());
    await expect(page.locator('#file-type')).toHaveText('NORMAL');
    const reenteredCell = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').first();
    await reenteredCell.focus();
    const reenteredMode = await page.evaluate(() => {
        const editor = document.activeElement?.closest('.tbl-cell-editor .cm-editor');
        return {
            mode: editor?.dataset.vimMode || null,
            status: document.getElementById('file-type')?.textContent || '',
        };
    });
    expect(['insert', 'normal']).toContain(reenteredMode.mode);
    expect(reenteredMode.status).toBe(reenteredMode.mode.toUpperCase());
    await reenteredCell.press('Escape');
    expectVisibleCursor(await nestedVimBlockCursorState(page), 'normal', 'NORMAL');
});

test('uses document Vim undo and redo inside a table cell without losing its cursor', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    const cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await cellContent.press('i');
    await cellContent.press('Z');
    await cellContent.press('Escape');

    const editedDocument = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    const editedCell = await activeNestedEditorState(page);
    expect(editedDocument).not.toBe(before);
    expect(editedCell).toMatchObject({ row: 1, col: 0, mode: 'normal' });

    await cellContent.press('u');
    await expect.poll(() => page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
    await expect.poll(() => activeNestedEditorState(page)).toMatchObject({
        row: 1,
        col: 0,
        anchor: editedCell.anchor,
        head: editedCell.head,
        mode: 'normal',
    });

    await cellContent.press('Control+r');
    await expect.poll(() => page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(editedDocument);
    await expect.poll(() => activeNestedEditorState(page)).toEqual(editedCell);
});

test('keeps the active table cell and cursor through non-Vim undo and redo', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    const cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await cellContent.press('End');
    await cellContent.press('!');

    const editedDocument = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    const editedCell = await activeNestedEditorState(page);
    expect(editedDocument).not.toBe(before);
    expect(editedCell).toMatchObject({ row: 1, col: 0, text: 'Alpha!' });

    await cellContent.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(() => page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
    await expect.poll(() => activeNestedEditorState(page)).toMatchObject({
        row: 1,
        col: 0,
        text: 'Alpha',
    });

    await cellContent.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y');
    await expect.poll(() => page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(editedDocument);
    await expect.poll(() => activeNestedEditorState(page)).toEqual(editedCell);
});

test('uses Normal h/l character motions and Visual h/j/k/l table-cell movement', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const firstBodyCell = page.locator('.tbl-table-widget tbody .tbl-cell-view').first();
    await firstBodyCell.click();
    const cellEditor = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').first();
    await expect(cellEditor).toBeFocused();
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    // In Normal mode h/l belong to Vim's nested CodeMirror editor. They move
    // one character and stop at a cell's source boundaries rather than moving
    // to a neighbouring table cell.
    await page.evaluate(position => {
        const content = document.activeElement.closest('.tbl-cell-editor .cm-content');
        const nestedView = window.__figaroTableTestView.constructor.findFromDOM(content);
        nestedView.dispatch({ selection: { anchor: position } });
        nestedView.focus();
    }, 0);
    await page.keyboard.press('h');
    expect(await activeNestedEditorState(page)).toMatchObject({ row: 1, col: 0, text: 'Alpha', anchor: 0, head: 0, mode: 'normal' });
    await page.keyboard.press('l');
    expect(await activeNestedEditorState(page)).toMatchObject({ row: 1, col: 0, text: 'Alpha', anchor: 1, head: 1, mode: 'normal' });
    await page.evaluate(position => {
        const content = document.activeElement.closest('.tbl-cell-editor .cm-content');
        const nestedView = window.__figaroTableTestView.constructor.findFromDOM(content);
        nestedView.dispatch({ selection: { anchor: position } });
        nestedView.focus();
    }, 'Alpha'.length);
    await page.keyboard.press('l');
    expect(await activeNestedEditorState(page)).toMatchObject({ row: 1, col: 0, text: 'Alpha', anchor: 4, head: 4, mode: 'normal' });
    await page.keyboard.press('l');
    expect(await activeNestedEditorState(page)).toMatchObject({ row: 1, col: 0, text: 'Alpha', anchor: 4, head: 4, mode: 'normal' });

    // Normal j/k retain the table's vertical cell transitions.
    await page.keyboard.press('j');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await page.keyboard.press('k');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });

    // Visual mode keeps cell directions instead of using the one-line Vim
    // selection motions inside the current cell.
    await page.keyboard.press('v');
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    await cellEditor.press('l');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    await cellEditor.press('j');
    expect(await activeCell(page)).toEqual({ row: 2, col: 1 });
    await cellEditor.press('h');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await cellEditor.press('k');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('keeps Visual Vim h/l within the current table row without creating rows at horizontal edges', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    let cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();

    // Visual h/l use table navigation. The first body column is a hard left
    // edge, not a link to the preceding header row. Repeated l presses stop
    // at this row's final column rather than wrapping into the next body row.
    await cellContent.press('v');
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    await cellContent.press('h');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await cellContent.press('l');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    await cellContent.press('l');
    expect(await activeCell(page)).toEqual({ row: 1, col: 2 });
    await cellContent.press('l');
    expect(await activeCell(page)).toEqual({ row: 1, col: 2 });

    // The right boundary retains Visual mode.
    await cellContent.press('l');
    expect(await activeCell(page)).toEqual({ row: 1, col: 2 });
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');

    // Exercise the actual beginning and end of the complete table as well as
    // the first column of its final row. None may prepend, append, or wrap.
    await page.locator('.tbl-table-widget tbody .tbl-cell-view').last().click();
    cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await cellContent.press('v');
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    await cellContent.press('l');
    expect(await activeCell(page)).toEqual({ row: 2, col: 2 });
    await cellContent.press('h');
    await cellContent.press('h');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await cellContent.press('h');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });

    await page.locator('.tbl-table-widget thead .tbl-cell-view').first().click();
    cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await cellContent.press('v');
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    await cellContent.press('h');
    expect(await activeCell(page)).toEqual({ row: 0, col: 0 });

    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('routes Vim Normal : commands and / searches through the document without adding table rows', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    let cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'normal');
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    // A cell starts in Normal mode after Vim is enabled or Insert mode is
    // escaped. This is the ordinary navigation state in which people invoke
    // :w and /, so exercise the complete command submission rather than only
    // the explicit Visual-selection path.
    await page.keyboard.press(':');
    const commandInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(commandInput).toBeFocused();
    expect(await commandInput.evaluate(input => !input.closest('.tbl-cell-editor'))).toBe(true);
    await page.keyboard.type('w');
    await page.keyboard.press('Enter');
    await expect(commandInput).toHaveCount(0);
    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').nth(1).click();
    cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'normal');
    await page.keyboard.press('/');
    const searchInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(searchInput).toBeFocused();
    expect(await searchInput.evaluate(input => !input.closest('.tbl-cell-editor'))).toBe(true);
    await page.keyboard.type('Before');
    await page.keyboard.press('Enter');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(1);

    // Cancelling a whole-document search returns to the same Normal-mode
    // table cell without leaving punctuation or an empty row behind.
    await page.locator('.tbl-table-widget tbody .tbl-cell-view').nth(1).click();
    cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await page.keyboard.press('/');
    const cancelInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(cancelInput).toBeFocused();
    await page.keyboard.type('After');
    await page.keyboard.press('Escape');
    await expect(cellContent).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'normal');

    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('routes Vim ? backward search across the document and returns to the originating cell on cancel', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    await page.locator('.tbl-table-widget tbody .tbl-cell-view').nth(1).click();
    let cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await page.keyboard.press('?');

    const backwardInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(backwardInput).toBeFocused();
    expect(await backwardInput.evaluate(input => !input.closest('.tbl-cell-editor'))).toBe(true);
    await backwardInput.fill('Before');
    await backwardInput.press('Enter');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(1);

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').nth(1).click();
    cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await cellContent.press('v');
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    await page.keyboard.press('?');
    const cancelInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(cancelInput).toBeFocused();
    await cancelInput.fill('After');
    await cancelInput.press('Escape');

    await expect(cellContent).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('routes Vim Visual : commands from table cells to the document command bar without adding rows', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const cellView = page.locator('.tbl-table-widget tbody .tbl-cell-view').first();
    await cellView.click();
    const cellEditor = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').first();
    await expect(cellEditor).toBeFocused();
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    await cellEditor.press('v');
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    // Exercise the cell-to-cell Visual bridge before invoking the prompts.
    // Punctuation must remain a Vim command rather than table navigation.
    await page.keyboard.press('l');
    await page.keyboard.press('j');
    await page.keyboard.press('h');
    await page.keyboard.press('k');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    // Use Playwright's browser-level keyboard path rather than a synthetic
    // event: this is the same trusted keydown/beforeinput sequence a person
    // sends to the nested contenteditable.
    await page.keyboard.press(':');

    const commandInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(commandInput).toBeFocused();
    expect(await commandInput.evaluate(input => !input.closest('.tbl-cell-editor'))).toBe(true);
    await commandInput.fill('wq');
    await expect(commandInput).toHaveValue('wq');
    await commandInput.press('Escape');

    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content')).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');

    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('routes Vim Visual / searches from table cells across the document and returns on cancel', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const cellView = page.locator('.tbl-table-widget tbody .tbl-cell-view').first();
    await cellView.click();
    const cellEditor = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').first();
    await expect(cellEditor).toBeFocused();
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    await cellEditor.press('v');
    await page.keyboard.press('l');
    await page.keyboard.press('j');
    await page.keyboard.press('h');
    await page.keyboard.press('k');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    const cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');

    await page.keyboard.press('/');

    const searchInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(searchInput).toBeFocused();
    expect(await searchInput.evaluate(input => !input.closest('.tbl-cell-editor'))).toBe(true);
    // "Before" is outside the table. A successful Vim search must therefore
    // leave the cell widget and select the matching root-document line.
    await searchInput.fill('Before');
    await searchInput.press('Enter');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(1);

    // Cancelling a later root-document search returns to the cell that
    // started it rather than focusing an unrelated source position.
    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    const returningCell = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(returningCell).toBeFocused();
    await returningCell.press('v');
    await returningCell.press('/');
    const cancelInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(cancelInput).toBeFocused();
    await cancelInput.press('Escape');
    await expect(returningCell).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');

    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('routes WebKit Unidentified Normal and Visual prompt text to the root Vim editor', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    const cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'normal');

    // WebKitGTK can report punctuation as Unidentified at keydown, then expose
    // its actual character only in beforeinput. That input must be claimed
    // before the nested editor's Vim input handler sees it. Start in Normal
    // mode—the common navigation state after leaving Insert mode—then repeat
    // the path with a Visual selection.
    const sendUnidentifiedPromptText = (target, { text, code }) => {
        const keydown = new KeyboardEvent('keydown', {
            key: 'Unidentified',
            code,
            bubbles: true,
            cancelable: true,
        });
        const keydownDispatched = target.dispatchEvent(keydown);
        const beforeinput = new InputEvent('beforeinput', {
            data: text,
            inputType: 'insertText',
            bubbles: true,
            cancelable: true,
        });
        const beforeinputDispatched = target.dispatchEvent(beforeinput);
        return {
            keydown: { dispatched: keydownDispatched, prevented: keydown.defaultPrevented },
            beforeinput: { dispatched: beforeinputDispatched, prevented: beforeinput.defaultPrevented },
        };
    };

    const colonDelivery = await cellContent.evaluate(sendUnidentifiedPromptText, { text: ':', code: 'Semicolon' });
    expect(colonDelivery).toEqual({
        keydown: { dispatched: true, prevented: false },
        beforeinput: { dispatched: false, prevented: true },
    });
    const commandInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(commandInput).toBeFocused();
    expect(await commandInput.evaluate(input => !input.closest('.tbl-cell-editor'))).toBe(true);
    await commandInput.press('Escape');
    await expect(cellContent).toBeFocused();
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'normal');

    await cellContent.press('v');
    await expect(page.locator('.tbl-cell-editor .cm-editor.cm-focused')).toHaveAttribute('data-vim-mode', 'visual');
    const slashDelivery = await cellContent.evaluate(sendUnidentifiedPromptText, { text: '/', code: 'Slash' });
    expect(slashDelivery).toEqual({
        keydown: { dispatched: true, prevented: false },
        beforeinput: { dispatched: false, prevented: true },
    });
    const searchInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(searchInput).toBeFocused();
    await searchInput.fill('Before');
    await searchInput.press('Enter');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(1);

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    await expect(cellContent).toBeFocused();
    const questionDelivery = await cellContent.evaluate(sendUnidentifiedPromptText, { text: '?', code: 'Slash' });
    expect(questionDelivery).toEqual({
        keydown: { dispatched: true, prevented: false },
        beforeinput: { dispatched: false, prevented: true },
    });
    const backwardInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(backwardInput).toBeFocused();
    await backwardInput.press('Escape');
    await expect(cellContent).toBeFocused();

    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('routes WebKit legacy textInput Visual prompt text to the root Vim editor', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    const cellContent = page.locator('.tbl-cell-editor .cm-editor.cm-focused .cm-content');
    await expect(cellContent).toBeFocused();
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    await cellContent.press('v');

    // WebKitGTK can deliver the punctuation character through its older
    // textInput event rather than beforeinput. That event does not carry an
    // insertText inputType, so it needs its own Visual-mode bridge.
    const legacyDelivery = await cellContent.evaluate(target => {
        const keydown = new KeyboardEvent('keydown', {
            key: 'Unidentified',
            code: 'Semicolon',
            bubbles: true,
            cancelable: true,
        });
        const keydownDispatched = target.dispatchEvent(keydown);
        const textInput = new InputEvent('textInput', {
            data: ':',
            bubbles: true,
            cancelable: true,
        });
        const textInputDispatched = target.dispatchEvent(textInput);
        return {
            keydown: { dispatched: keydownDispatched, prevented: keydown.defaultPrevented },
            textInput: { dispatched: textInputDispatched, prevented: textInput.defaultPrevented },
        };
    });
    expect(legacyDelivery).toEqual({
        keydown: { dispatched: true, prevented: false },
        textInput: { dispatched: false, prevented: true },
    });

    const commandInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(commandInput).toBeFocused();
    expect(await commandInput.evaluate(input => !input.closest('.tbl-cell-editor'))).toBe(true);
    await commandInput.press('Escape');
    await expect(cellContent).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });

    const backwardDelivery = await cellContent.evaluate(target => {
        const keydown = new KeyboardEvent('keydown', {
            key: 'Unidentified',
            code: 'Slash',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        const keydownDispatched = target.dispatchEvent(keydown);
        const textInput = new InputEvent('textInput', {
            data: '?',
            bubbles: true,
            cancelable: true,
        });
        const textInputDispatched = target.dispatchEvent(textInput);
        return {
            keydown: { dispatched: keydownDispatched, prevented: keydown.defaultPrevented },
            textInput: { dispatched: textInputDispatched, prevented: textInput.defaultPrevented },
        };
    });
    expect(backwardDelivery).toEqual({
        keydown: { dispatched: true, prevented: false },
        textInput: { dispatched: false, prevented: true },
    });
    const backwardInput = page.locator('#editor-container > .cm-editor > .cm-panels .cm-vim-panel input');
    await expect(backwardInput).toBeFocused();
    await backwardInput.press('Escape');
    await expect(cellContent).toBeFocused();

    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('keeps the root Vim cursor themed after leaving either table edge', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    const expectThemedRootCursor = async () => {
        await expect.poll(() => activeCell(page)).toBeNull();
        const rootCursor = await rootVimBlockCursorState(page);
        expect(rootCursor.classes).toContain('vim-normal');
        expect(rootCursor).toMatchObject({
            hasFocus: true,
            mode: 'NORMAL',
            cursor: {
                background: rootCursor.expected.background,
                color: rootCursor.expected.color,
                visibility: 'visible',
            },
        });
        expect(rootCursor.cursor.background).not.toBe('rgb(255, 150, 150)');
    };

    const lastBodyCell = page.locator('.tbl-table-widget tbody .tbl-cell-view').last();
    await lastBodyCell.click();
    const lastCellEditor = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').last();
    await expect(lastCellEditor).toBeFocused();
    await lastCellEditor.press('j');
    await expectThemedRootCursor();

    const firstHeaderCell = page.locator('.tbl-table-widget thead .tbl-cell-view').first();
    await firstHeaderCell.click();
    const firstCellEditor = page.locator('.tbl-table-widget thead .tbl-cell-editor .cm-content').first();
    await expect(firstCellEditor).toBeFocused();
    await firstCellEditor.press('k');
    await expectThemedRootCursor();

    await expect(page.locator('.tbl-table-widget tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);
});

test('optionally enters rendered blocks with Vim j/k instead of skipping visual widgets', async ({ page }) => {
    const source = [
        'Before',
        '',
        '```javascript',
        'const answer = 42;',
        '```',
        '',
        '| Name | Count |',
        '| --- | --- |',
        '| Alpha | 1 |',
        '',
        'After',
    ].join('\n');
    await createMarkdownEditor(page, source);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
        editor.setVimVisualRows(true);
        editor.setVimRevealBlocks(true);
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });

    const content = page.locator('.cm-editor > .cm-scroller > .cm-content');
    await content.press('j');
    await expect(page.locator('.cm-codeblock-widget')).toHaveCount(0);
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(3);

    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(6).from } });
        view.focus();
    });
    await content.press('j');
    expect(await activeCell(page)).toEqual({ row: 0, col: 0 });

    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(10).from } });
        view.focus();
    });
    await content.press('k');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
});

test('keeps aligned Markdown tables semantic and styled in PDF preview and generated PDF layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.markdownit === 'function');

    const rendered = await page.evaluate(async (source) => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        const printableHTML = pdf.renderPrintableMarkdown(source, 'Table report');
        const previewHTML = preview.buildPDFPreviewDocument(printableHTML, { notePath: 'reports/table.md' });
        const document = new DOMParser().parseFromString(previewHTML, 'text/html');
        const table = document.querySelector('.figaro-print-document table');
        return {
            previewHTML,
            rows: table.querySelectorAll('tbody tr').length,
            headerAlignments: Array.from(table.querySelectorAll('th')).map(cell => cell.style.textAlign),
            cellAlignments: Array.from(table.querySelectorAll('tbody tr:first-child td')).map(cell => cell.style.textAlign),
            previewBody: document.body.classList.contains('figaro-pdf-preview-body'),
        };
    }, tableSource);

    expect(rendered.rows).toBe(2);
    expect(rendered.headerAlignments).toEqual(['left', 'center', 'right']);
    expect(rendered.cellAlignments).toEqual(['left', 'center', 'right']);
    expect(rendered.previewBody).toBe(true);

    await page.setContent(rendered.previewHTML, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const layout = await page.locator('.figaro-print-document table').evaluate(table => {
        const firstCell = table.querySelector('tbody td');
        const styles = getComputedStyle(firstCell);
        return {
            display: getComputedStyle(table).display,
            width: table.getBoundingClientRect().width,
            height: table.getBoundingClientRect().height,
            borderStyle: styles.borderStyle,
            borderWidth: styles.borderWidth,
        };
    });
    expect(layout.display).toBe('table');
    expect(layout.width).toBeGreaterThan(200);
    expect(layout.height).toBeGreaterThan(40);
    expect(layout.borderStyle).toBe('solid');
    expect(Number.parseFloat(layout.borderWidth)).toBeGreaterThan(0);

    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(5000);
});

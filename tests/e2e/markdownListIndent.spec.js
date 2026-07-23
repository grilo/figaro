import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('keeps wrapped bullet and ordered list bodies hanging beneath their markers', async ({ page }) => {
    await openWelcomeEditor(page);
    const words = Array.from({ length: 96 }, (_, index) => `word${index}`).join(' ');
    const source = `- Bullet ${words}\n1. Ordered ${words}\nAfter the lists`;
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(text);
        const view = editor.getEditorView();
        await new Promise(resolve => setTimeout(resolve, 80));
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        view.focus();
        window.__markdownListView = view;
    }, source);

    await expect(page.locator('.cm-line.cm-markdown-list-item')).toHaveCount(2);
    const geometry = await page.evaluate(() => {
        const view = window.__markdownListView;
        const checkLine = lineNumber => {
            const line = view.state.doc.line(lineNumber);
            const body = lineNumber === 1 ? 'Bullet' : 'Ordered';
            const element = [...document.querySelectorAll('.cm-line.cm-markdown-list-item')]
                .find(candidate => candidate.textContent.includes(lineNumber === 1 ? 'Bullet' : 'Ordered'));
            const firstText = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.includes(body));
            const rectAt = offset => {
                const range = document.createRange();
                range.setStart(firstText, offset);
                range.setEnd(firstText, offset + 1);
                return range.getBoundingClientRect();
            };
            const firstOffset = firstText.nodeValue.indexOf(body);
            const firstRect = rectAt(firstOffset);
            const wrappedRect = Array.from(
                { length: firstText.nodeValue.length - firstOffset - 1 },
                (_, offset) => ({
                    character: firstText.nodeValue[firstOffset + offset + 1],
                    rect: rectAt(firstOffset + offset + 1),
                })
            ).find(item => /\S/.test(item.character) && item.rect.top > firstRect.top).rect;
            return {
                firstLeft: firstRect.left,
                wrappedLeft: wrappedRect.left,
                firstTop: firstRect.top,
                wrappedTop: wrappedRect.top,
                paddingLeft: getComputedStyle(element).paddingLeft,
                textIndent: getComputedStyle(element).textIndent,
            };
        };
        return { bullet: checkLine(1), ordered: checkLine(2) };
    });
    for (const item of [geometry.bullet, geometry.ordered]) {
        expect(item.wrappedTop).toBeGreaterThan(item.firstTop);
        expect(Math.abs(item.wrappedLeft - item.firstLeft)).toBeLessThanOrEqual(1);
        expect(Number.parseFloat(item.paddingLeft)).toBeGreaterThan(0);
        expect(Number.parseFloat(item.textIndent)).toBeLessThan(0);
    }

    const content = page.locator('.cm-content');
    const start = await page.evaluate(() => {
        const view = window.__markdownListView;
        return view.state.doc.line(1).from + 2;
    });
    await page.evaluate(position => {
        const view = window.__markdownListView;
        view.dispatch({ selection: { anchor: position } });
        view.focus();
    }, start);
    await expect(page.locator('.cm-line.cm-markdown-list-item .cm-bullet')).toHaveCount(1);
    const activeGeometry = await page.evaluate(() => {
        const view = window.__markdownListView;
        const element = [...document.querySelectorAll('.cm-line.cm-markdown-list-item')]
            .find(candidate => candidate.textContent.includes('Bullet'));
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = null;
        let candidate;
        while ((candidate = walker.nextNode())) {
            if (candidate.nodeValue.includes('Bullet')) {
                textNode = candidate;
                break;
            }
        }
        if (!textNode) throw new Error('Could not find the active bullet-list body text');
        const rectAt = offset => {
            const range = document.createRange();
            range.setStart(textNode, offset);
            range.setEnd(textNode, offset + 1);
            return range.getBoundingClientRect();
        };
        const firstOffset = textNode.nodeValue.indexOf('Bullet');
        const firstRect = rectAt(firstOffset);
        const wrappedRect = Array.from(
            { length: textNode.nodeValue.length - firstOffset - 1 },
            (_, offset) => ({
                character: textNode.nodeValue[firstOffset + offset + 1],
                rect: rectAt(firstOffset + offset + 1),
            })
        ).find(item => /\S/.test(item.character) && item.rect.top > firstRect.top).rect;
        return {
            firstLeft: firstRect.left,
            wrappedLeft: wrappedRect.left,
            firstTop: firstRect.top,
            wrappedTop: wrappedRect.top,
            paddingLeft: getComputedStyle(element).paddingLeft,
        };
    });
    expect(activeGeometry.wrappedTop).toBeGreaterThan(activeGeometry.firstTop);
    expect(Math.abs(activeGeometry.wrappedLeft - activeGeometry.firstLeft)).toBeLessThanOrEqual(1);

    const before = await page.evaluate(() => {
        const view = window.__markdownListView;
        return { head: view.state.selection.main.head, coords: view.coordsAtPos(view.state.selection.main.head) };
    });
    await content.press('ArrowDown');
    const afterDown = await page.evaluate(() => {
        const view = window.__markdownListView;
        return { head: view.state.selection.main.head, coords: view.coordsAtPos(view.state.selection.main.head) };
    });
    expect(afterDown.head).toBeGreaterThan(before.head);
    expect(afterDown.coords.top).toBeGreaterThan(before.coords.top);
    await content.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__markdownListView.state.selection.main.head)).toBe(start);

    const drag = await page.evaluate(() => {
        const view = window.__markdownListView;
        const line = view.state.doc.line(1);
        const first = view.coordsAtPos(line.from + 2);
        const later = view.coordsAtPos(line.from + 220);
        return {
            first: { x: first.left + 2, y: (first.top + first.bottom) / 2 },
            later: { x: later.left + 2, y: (later.top + later.bottom) / 2 },
        };
    });
    await page.mouse.move(drag.first.x, drag.first.y);
    await page.mouse.down();
    await page.mouse.move(drag.later.x, drag.later.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
        const selection = window.__markdownListView.state.selection.main;
        return { from: selection.from, to: selection.to };
    })).toEqual(expect.objectContaining({ from: expect.any(Number), to: expect.any(Number) }));
    expect(await page.evaluate(() => {
        const selection = window.__markdownListView.state.selection.main;
        return selection.to - selection.from;
    })).toBeGreaterThan(20);
});

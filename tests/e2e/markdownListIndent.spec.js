import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('exits an empty second list item with one Enter and preserves cursor geometry', async ({ page }) => {
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const source = '- First item\n- ';
        editor.setEditorContent(source);
        const view = editor.getEditorView();
        await new Promise(resolve => setTimeout(resolve, 80));
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        window.__figaroListExitView = view;
    });

    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => ({
        source: window.__figaroListExitView.state.doc.toString(),
        head: window.__figaroListExitView.state.selection.main.head,
    }))).toEqual({ source: '- First item\n', head: 13 });

    await page.keyboard.type('After list');
    await expect.poll(() => page.evaluate(() => window.__figaroListExitView.state.doc.toString()))
        .toBe('- First item\nAfter list');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__figaroListExitView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(1);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__figaroListExitView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);

    const points = await page.evaluate(() => {
        const view = window.__figaroListExitView;
        const start = view.coordsAtPos(view.state.doc.line(1).from + 2);
        const end = view.coordsAtPos(view.state.doc.line(2).to);
        return {
            start: { x: start.left + 1, y: (start.top + start.bottom) / 2 },
            end: { x: end.left - 1, y: (end.top + end.bottom) / 2 },
        };
    });
    await page.mouse.click(points.end.x, points.end.y);
    await expect.poll(() => page.evaluate(() => {
        const view = window.__figaroListExitView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);
    await page.mouse.move(points.start.x, points.start.y);
    await page.mouse.down();
    await page.mouse.move(points.end.x, points.end.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
        const selection = window.__figaroListExitView.state.selection.main;
        const lineBreak = window.__figaroListExitView.state.doc.line(1).to;
        return selection.from < lineBreak && selection.to > lineBreak;
    })).toBe(true);
});

test('keeps wrapped list and blockquote bodies hanging beneath their markers', async ({ page }) => {
    await openWelcomeEditor(page);
    const words = Array.from({ length: 96 }, (_, index) => `word${index}`).join(' ');
    const source = `- Bullet ${words}\n1. Ordered ${words}\n> Quote ${words}\nAfter the blocks`;
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(text);
        const view = editor.getEditorView();
        await new Promise(resolve => setTimeout(resolve, 80));
        view.dispatch({ selection: { anchor: view.state.doc.line(4).from } });
        view.focus();
        window.__markdownListView = view;
    }, source);

    await expect(page.locator('.cm-line.cm-markdown-list-item')).toHaveCount(2);
    await expect(page.locator('.cm-line.cm-blockquote-line')).toHaveCount(1);
    const geometry = await page.evaluate(() => {
        const view = window.__markdownListView;
        const checkLine = ({ lineNumber, selector, body }) => {
            const element = [...document.querySelectorAll(selector)]
                .find(candidate => candidate.textContent.includes(body));
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let firstText = null;
            let candidate;
            while ((candidate = walker.nextNode())) {
                if (candidate.nodeValue.includes(body)) {
                    firstText = candidate;
                    break;
                }
            }
            if (!firstText) throw new Error(`Could not find ${body} body text`);
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
        return {
            bullet: checkLine({
                lineNumber: 1,
                selector: '.cm-line.cm-markdown-list-item',
                body: 'Bullet',
            }),
            ordered: checkLine({
                lineNumber: 2,
                selector: '.cm-line.cm-markdown-list-item',
                body: 'Ordered',
            }),
            blockquote: checkLine({
                lineNumber: 3,
                selector: '.cm-line.cm-blockquote-line',
                body: 'Quote',
            }),
        };
    });
    for (const item of [geometry.bullet, geometry.ordered, geometry.blockquote]) {
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

    const quoteStart = await page.evaluate(() => {
        const view = window.__markdownListView;
        return view.state.doc.line(3).from + 2;
    });
    await page.evaluate(position => {
        const view = window.__markdownListView;
        view.dispatch({ selection: { anchor: position } });
        view.focus();
    }, quoteStart);
    await expect.poll(() => page.locator(
        '.cm-line.cm-blockquote-line .cm-formatting-block'
    ).evaluate(marker => marker.getBoundingClientRect().width)).toBeGreaterThan(9);
    const activeQuoteGeometry = await page.evaluate(() => {
        const element = document.querySelector('.cm-line.cm-blockquote-line');
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = null;
        let candidate;
        while ((candidate = walker.nextNode())) {
            if (candidate.nodeValue.includes('Quote')) {
                textNode = candidate;
                break;
            }
        }
        if (!textNode) throw new Error('Could not find the active blockquote body text');
        const rectAt = offset => {
            const range = document.createRange();
            range.setStart(textNode, offset);
            range.setEnd(textNode, offset + 1);
            return range.getBoundingClientRect();
        };
        const firstOffset = textNode.nodeValue.indexOf('Quote');
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
        };
    });
    expect(activeQuoteGeometry.wrappedTop).toBeGreaterThan(activeQuoteGeometry.firstTop);
    expect(Math.abs(activeQuoteGeometry.wrappedLeft - activeQuoteGeometry.firstLeft)).toBeLessThanOrEqual(1);

    const beforeQuoteDown = await page.evaluate(() => {
        const view = window.__markdownListView;
        return { head: view.state.selection.main.head };
    });
    await content.press('ArrowDown');
    const afterQuoteDown = await page.evaluate(() => {
        const view = window.__markdownListView;
        const head = view.state.selection.main.head;
        return { head, line: view.state.doc.lineAt(head).number };
    });
    expect(afterQuoteDown.head).toBeGreaterThan(beforeQuoteDown.head);
    expect(afterQuoteDown.line).toBe(3);
    await content.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__markdownListView.state.selection.main.head))
        .toBe(quoteStart);

    const afterLineStart = await page.evaluate(() => {
        const view = window.__markdownListView;
        const position = view.state.doc.line(4).from;
        view.dispatch({ selection: { anchor: position } });
        view.focus();
        return position;
    });
    await content.press('ArrowUp');
    expect(await page.evaluate(() => {
        const view = window.__markdownListView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(3);
    await content.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__markdownListView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(4);
    expect(await page.evaluate(() => window.__markdownListView.state.selection.main.head))
        .toBe(afterLineStart);

    const quotePointerTargets = await page.evaluate(() => {
        const view = window.__markdownListView;
        const line = view.state.doc.line(3);
        const click = view.coordsAtPos(line.from + 18);
        const first = view.coordsAtPos(line.from + 2);
        const later = view.coordsAtPos(line.from + 220);
        return {
            click: { x: click.left + 1, y: (click.top + click.bottom) / 2 },
            first: { x: first.left + 2, y: (first.top + first.bottom) / 2 },
            later: { x: later.left + 2, y: (later.top + later.bottom) / 2 },
        };
    });
    await page.mouse.click(quotePointerTargets.click.x, quotePointerTargets.click.y);
    expect(await page.evaluate(() => {
        const view = window.__markdownListView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(3);
    await page.mouse.move(quotePointerTargets.first.x, quotePointerTargets.first.y);
    await page.mouse.down();
    await page.mouse.move(quotePointerTargets.later.x, quotePointerTargets.later.y, { steps: 6 });
    await page.mouse.up();
    expect(await page.evaluate(() => {
        const selection = window.__markdownListView.state.selection.main;
        return selection.to - selection.from;
    })).toBeGreaterThan(20);
});

test('keeps a list immediately following a heading visible in live preview, PDF preview, and print output', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = '# Such as this\n* hello \n * world';
    await page.evaluate(async text => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(text);
        const view = editor.getEditorView();
        await new Promise(resolve => setTimeout(resolve, 80));
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
        window.__markdownHeadingListView = view;
    }, source);

    await expect(page.locator('.cm-bullet')).toHaveCount(2);
    await expect(page.locator('.cm-bullet').nth(0)).toHaveText('•');
    await expect(page.locator('.cm-bullet').nth(1)).toHaveText('•');

    const rendered = await page.evaluate(async markdown => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        const printableHTML = pdf.renderPrintableMarkdown(markdown, 'Heading list');
        const previewHTML = preview.buildPDFPreviewDocument(printableHTML, { notePath: 'notes/list.md' });
        const printable = new DOMParser().parseFromString(printableHTML, 'text/html');
        const printablePreview = new DOMParser().parseFromString(previewHTML, 'text/html');
        return {
            exportItems: Array.from(printable.querySelectorAll('main > ul > li')).map(item => item.textContent),
            previewItems: Array.from(printablePreview.querySelectorAll('main > ul > li')).map(item => item.textContent),
        };
    }, source);

    expect(rendered.exportItems).toEqual(['hello', 'world']);
    expect(rendered.previewItems).toEqual(['hello', 'world']);
});

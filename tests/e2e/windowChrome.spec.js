import { expect, test } from '@playwright/test';

test('draws a subtle full frameless-window outline with a stronger top highlight', async ({ page }) => {
    await page.goto('/');

    const chrome = await page.locator('#app').evaluate(app => {
        const surface = getComputedStyle(app);
        const outline = getComputedStyle(app, '::after');
        return {
            position: surface.position,
            radius: surface.borderTopLeftRadius,
            content: outline.content,
            pointerEvents: outline.pointerEvents,
            topWidth: outline.borderTopWidth,
            rightWidth: outline.borderRightWidth,
            bottomWidth: outline.borderBottomWidth,
            leftWidth: outline.borderLeftWidth,
            topStyle: outline.borderTopStyle,
            rightStyle: outline.borderRightStyle,
            bottomStyle: outline.borderBottomStyle,
            leftStyle: outline.borderLeftStyle,
            topColor: outline.borderTopColor,
            rightColor: outline.borderRightColor,
            bottomColor: outline.borderBottomColor,
            leftColor: outline.borderLeftColor,
            outlineRadius: outline.borderTopLeftRadius,
            inset: [outline.top, outline.right, outline.bottom, outline.left],
        };
    });

    expect(chrome.position).toBe('relative');
    expect(chrome.content).not.toBe('none');
    expect(chrome.pointerEvents).toBe('none');
    expect([chrome.topWidth, chrome.rightWidth, chrome.bottomWidth, chrome.leftWidth])
        .toEqual(['1px', '1px', '1px', '1px']);
    expect([chrome.topStyle, chrome.rightStyle, chrome.bottomStyle, chrome.leftStyle])
        .toEqual(['solid', 'solid', 'solid', 'solid']);
    expect(chrome.rightColor).toBe(chrome.bottomColor);
    expect(chrome.bottomColor).toBe(chrome.leftColor);
    expect(chrome.topColor).not.toBe(chrome.rightColor);
    expect(chrome.outlineRadius).toBe(chrome.radius);
    expect(chrome.inset).toEqual(['0px', '0px', '0px', '0px']);
});

test('keeps frameless resize edges above scrollers only in the desktop webview', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    const edgeTargets = () => page.evaluate(() => {
        const describe = element => element?.dataset.edge || element?.className || element?.tagName;
        const middleX = Math.round(innerWidth / 2);
        const middleY = Math.round(innerHeight / 2);
        return {
            right: describe(document.elementFromPoint(innerWidth - 1, middleY)),
            rightInside: describe(document.elementFromPoint(innerWidth - 6, middleY)),
            bottom: describe(document.elementFromPoint(middleX, innerHeight - 1)),
            bottomInside: describe(document.elementFromPoint(middleX, innerHeight - 6)),
        };
    });

    const browser = await edgeTargets();
    expect([browser.right, browser.bottom]).not.toContain('right');
    expect([browser.right, browser.bottom]).not.toContain('bottom');

    await page.evaluate(() => document.documentElement.setAttribute('data-desktop-webview', ''));
    const desktop = await edgeTargets();
    // Wails' default resize zone is the 5px nearest each border.
    expect(desktop.right).toBe('right');
    expect(desktop.bottom).toBe('bottom');
    expect(desktop.rightInside).not.toBe('right');
    expect(desktop.bottomInside).not.toBe('bottom');
});

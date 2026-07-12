import { expect, test } from '@playwright/test';

const bridgeChannel = 'figaro-pdf-preview-v1';

test('keeps link activation inside the sandboxed PDF preview bridge', async ({ page }) => {
    await page.goto('/');
    await page.setContent('<iframe id="preview" title="PDF preview" sandbox="allow-scripts" src="/pdf/preview-frame.html" style="width: 800px; height: 600px; border: 0"></iframe>');
    await page.evaluate(() => {
        window.previewBridgeMessages = [];
        window.addEventListener('message', event => window.previewBridgeMessages.push(event.data));
    });

    const frameLocator = page.frameLocator('#preview');
    // The bridge starts with an intentionally empty body, so wait for its
    // nonce-protected script rather than asserting visual body dimensions.
    await expect(frameLocator.locator('script[nonce="figaro-pdf-preview-bridge"]')).toHaveCount(1);

    const token = 'playwright-preview-token';
    const printable = `<!doctype html><html><head>
        <base href="/vault/notes/">
        <style>html, body { background-color: rgb(0, 0, 0); color: rgb(255, 255, 0); }</style>
    </head><body>
        <a id="external" href="https://example.test/guide">External guide</a>
        <a id="reference" href="#footnote1">1</a>
        <p id="footnote1">Footnote <a id="return" href="#footnote-ref1">↩</a></p>
        <sup id="footnote-ref1">Reference origin</sup>
    </body></html>`;
    await page.evaluate(({ channel, token, printable }) => {
        document.getElementById('preview').contentWindow.postMessage({
            channel,
            type: 'render',
            token,
            html: printable,
            documentProgress: 0,
        }, '*');
    }, { channel: bridgeChannel, token, printable });

    await expect(frameLocator.locator('#external')).toBeVisible();
    await expect(frameLocator.locator('html')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(frameLocator.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await frameLocator.locator('#external').click();
    await expect.poll(() => page.evaluate(() => window.previewBridgeMessages
        .some(message => message?.type === 'link' && message.href === 'https://example.test/guide'))).toBe(true);

    const iframe = await page.locator('#preview').elementHandle();
    const frame = await iframe.contentFrame();
    expect(frame.url()).toContain('/pdf/preview-frame.html');

    await frameLocator.locator('#reference').click();
    await frameLocator.locator('#return').click();
    expect(frame.url()).toContain('/pdf/preview-frame.html');
    const linkMessages = await page.evaluate(() => window.previewBridgeMessages
        .filter(message => message?.type === 'link'));
    expect(linkMessages).toEqual([expect.objectContaining({ href: 'https://example.test/guide', token })]);
});

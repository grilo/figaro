import { expect, test } from '@playwright/test';

const bridgeChannel = 'figaro-pdf-preview-v1';

test('loads a sized note-relative image inside the sandboxed PDF preview', async ({ page }) => {
    await page.route('**/vault/notes/portrait.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="153" viewBox="0 0 240 153"><rect width="240" height="153" fill="#7689d8"/></svg>',
    }));
    await page.goto('/');
    await page.setContent('<iframe id="preview" title="PDF preview" sandbox="allow-scripts" src="/pdf/preview-frame.html" style="width: 800px; height: 600px; border: 0"></iframe>');
    const frameLocator = page.frameLocator('#preview');
    await expect(frameLocator.locator('script[nonce="figaro-pdf-preview-bridge"]')).toHaveCount(1);

    const printable = await page.evaluate(async () => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        return preview.buildPDFPreviewDocument(
            pdf.renderPrintableMarkdown('![Portrait|190x121](portrait.svg)', 'Sized image'),
            { notePath: 'notes/report.md' },
        );
    });
    const token = 'sized-image-token';
    await page.evaluate(({ channel, token, printable }) => {
        document.getElementById('preview').contentWindow.postMessage({
            channel,
            type: 'render',
            token,
            html: printable,
            documentProgress: 0,
        }, '*');
    }, { channel: bridgeChannel, token, printable });

    const image = frameLocator.locator('.figaro-print-document img[alt="Portrait"]');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', '/vault/notes/portrait.svg');
    await expect(image).toHaveJSProperty('naturalWidth', 240);
    await expect(image).toHaveCSS('width', '190px');
    await expect(image).toHaveCSS('height', '121px');
});

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

test('coalesces high-frequency scroll reports without slowing the preview frame', async ({ page }) => {
    await page.goto('/');
    await page.setContent('<iframe id="preview" title="PDF preview" sandbox="allow-scripts" src="/pdf/preview-frame.html" style="width: 800px; height: 600px; border: 0"></iframe>');
    await page.evaluate(() => {
        window.previewBridgeMessages = [];
        window.addEventListener('message', event => window.previewBridgeMessages.push(event.data));
    });

    const frameLocator = page.frameLocator('#preview');
    await expect(frameLocator.locator('script[nonce="figaro-pdf-preview-bridge"]')).toHaveCount(1);
    const token = 'scroll-rate-token';
    const printable = `<!doctype html><html><head><style>
        html, body { margin: 0; }
        .scroll-spacer { height: 18000px; }
    </style></head><body><div id="scroll-marker" class="scroll-spacer">Long preview</div></body></html>`;
    await page.evaluate(({ channel, token, printable }) => {
        document.getElementById('preview').contentWindow.postMessage({
            channel,
            type: 'render',
            token,
            html: printable,
            documentProgress: 0,
        }, '*');
    }, { channel: bridgeChannel, token, printable });
    await expect(frameLocator.locator('#scroll-marker')).toBeVisible();
    await page.waitForTimeout(80);
    await page.evaluate(() => { window.previewBridgeMessages = []; });

    const iframe = await page.locator('#preview').elementHandle();
    const frame = await iframe.contentFrame();
    // Playwright's wheel protocol itself can take longer than a display frame.
    // Drive a known 5ms burst inside the frame so this regression measures the
    // bridge's coalescing budget rather than transport latency in the harness.
    await frame.evaluate(async () => {
        const root = document.scrollingElement;
        for (let index = 0; index < 36; index++) {
            root.scrollTop += 96;
            window.dispatchEvent(new Event('scroll'));
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    });
    await page.waitForTimeout(140);

    const scrollMessages = await page.evaluate(() => window.previewBridgeMessages
        .filter(message => message?.channel === 'figaro-pdf-preview-v1' && message.type === 'scroll'));
    const finalProgress = await frame.evaluate(() => {
        const root = document.scrollingElement;
        return root.scrollTop / (root.scrollHeight - root.clientHeight);
    });
    expect(await frame.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(scrollMessages.length).toBeGreaterThan(0);
    // Without coalescing this 36-event burst would yield about 36 reports.
    // The bridge deliberately publishes the latest position at a lower cadence.
    expect(scrollMessages.length).toBeLessThanOrEqual(16);
    expect(scrollMessages.at(-1).documentProgress).toBeCloseTo(finalProgress, 3);
});

test('aligns the preview marker by Markdown source across tall code blocks', async ({ page }) => {
    await page.goto('/');
    await page.setContent('<iframe id="preview" title="PDF preview" sandbox="allow-scripts" src="/pdf/preview-frame.html" style="width: 800px; height: 600px; border: 0"></iframe>');
    await page.evaluate(() => {
        window.previewBridgeMessages = [];
        window.addEventListener('message', event => window.previewBridgeMessages.push(event.data));
    });

    const frameLocator = page.frameLocator('#preview');
    await expect(frameLocator.locator('script[nonce="figaro-pdf-preview-bridge"]')).toHaveCount(1);
    const token = 'source-anchor-token';
    const printable = `<!doctype html><html><head><style>
        html, body { margin: 0; }
        p, pre { box-sizing: border-box; margin: 0; }
        #intro { height: 420px; }
        #code-one { height: 1200px; }
        #between { height: 240px; }
        #code-two { height: 1500px; }
        #code-three { height: 900px; }
        #ending { height: 500px; }
    </style></head><body><main class="figaro-print-document">
        <p id="intro" data-figaro-source-start="0" data-figaro-source-end="5">Intro</p>
        <pre id="code-one" data-figaro-source-start="5" data-figaro-source-end="25">Code one</pre>
        <p id="between" data-figaro-source-start="25" data-figaro-source-end="28">Between</p>
        <pre id="code-two" data-figaro-source-start="28" data-figaro-source-end="58">Code two</pre>
        <pre id="code-three" data-figaro-source-start="58" data-figaro-source-end="76">Code three</pre>
        <p id="ending" data-figaro-source-start="76" data-figaro-source-end="82">Ending</p>
    </main></body></html>`;
    await page.evaluate(({ channel, token, printable }) => {
        document.getElementById('preview').contentWindow.postMessage({
            channel,
            type: 'render',
            token,
            html: printable,
            documentProgress: 0,
        }, '*');
    }, { channel: bridgeChannel, token, printable });
    await expect(frameLocator.locator('#code-three')).toBeVisible();
    await expect.poll(() => page.evaluate(token => window.previewBridgeMessages
        .some(message => message?.type === 'rendered' && message.token === token), token)).toBe(true);

    await page.evaluate(({ channel, token }) => {
        window.previewBridgeMessages = [];
        document.getElementById('preview').contentWindow.postMessage({
            channel,
            type: 'set-source-position',
            token,
            sourceLine: 43,
            lineProgress: 0.5,
            progress: 0.5,
        }, '*');
    }, { channel: bridgeChannel, token });

    const iframe = await page.locator('#preview').elementHandle();
    const frame = await iframe.contentFrame();
    await expect.poll(() => frame.evaluate(() => document.scrollingElement.scrollTop)).toBeGreaterThan(1500);
    const markerSource = await frame.evaluate(() => {
        const markerY = document.scrollingElement.clientHeight * 0.3;
        const block = document.getElementById('code-two').getBoundingClientRect();
        return 28 + 30 * ((markerY - block.top) / block.height);
    });
    expect(markerSource).toBeCloseTo(43.5, 1);

    await page.waitForTimeout(160);
    const reports = await page.evaluate(() => window.previewBridgeMessages
        .filter(message => message?.type === 'scroll'));
    expect(reports).toContainEqual(expect.objectContaining({
        sourceLine: 43,
        programmatic: true,
    }));
});

test('caps and centers preview content at the configured PDF page width', async ({ page }) => {
    await page.goto('/');
    const printable = await page.evaluate(async () => {
        const { buildPDFPreviewDocument } = await import('/js/pdfPreview.js');
        return buildPDFPreviewDocument(
            '<!doctype html><html><head><style>@page { margin: 18mm; }</style></head><body><main class="figaro-print-document"><h1>Wide preview</h1><p>Paper should not stretch with its pane.</p></main></body></html>',
            {
                notePath: 'notes/report.md',
                stylesheetPath: 'notes/letter.css',
                stylesheetContent: '@page { size: Letter landscape; } body { width: 100% !important; max-width: none !important; margin: 0 !important; }',
            }
        );
    });

    await page.setContent('<iframe id="preview" title="PDF preview" sandbox="allow-scripts" src="/pdf/preview-frame.html" style="width: 1400px; height: 900px; border: 0"></iframe>');
    const frameLocator = page.frameLocator('#preview');
    await expect(frameLocator.locator('script[nonce="figaro-pdf-preview-bridge"]')).toHaveCount(1);

    const token = 'page-width-token';
    await page.evaluate(({ channel, token, printable }) => {
        document.getElementById('preview').contentWindow.postMessage({
            channel,
            type: 'render',
            token,
            html: printable,
            documentProgress: 0,
        }, '*');
    }, { channel: bridgeChannel, token, printable });

    await expect(frameLocator.getByRole('heading', { name: 'Wide preview' })).toBeVisible();
    const geometry = await frameLocator.locator('body').evaluate(body => {
        const rect = body.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        return {
            bodyWidth: rect.width,
            bodyHeight: rect.height,
            bodyLeft: rect.left,
            viewportWidth,
            geometryCSS: document.getElementById('figaro-preview-page-geometry')?.textContent || '',
        };
    });

    expect(geometry.viewportWidth).toBeGreaterThan(geometry.bodyWidth);
    expect(geometry.bodyWidth).toBeCloseTo(1056, 0); // 11in at 96 CSS px/in
    expect(geometry.bodyHeight).toBeGreaterThanOrEqual(816); // 8.5in
    expect(geometry.bodyLeft).toBeCloseTo((geometry.viewportWidth - geometry.bodyWidth) / 2, 0);
    expect(geometry.geometryCSS).toContain('max-width: 11in !important');
    expect(geometry.geometryCSS).toContain('min-height: 8.5in !important');
});

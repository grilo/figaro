/** Contracts for the isolated PDF-preview frame bridge. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bridgeChannel = 'figaro-pdf-preview-v1';
const frameHTML = readFileSync(resolve(process.cwd(), 'frontend/pdf/preview-frame.html'), 'utf8');
const frameScript = new DOMParser().parseFromString(frameHTML, 'text/html').querySelector('script').textContent;

function waitForFrame() {
    // jsdom schedules each requestAnimationFrame on a separate task. The
    // bridge deliberately uses two frames so newly copied styles can settle.
    return new Promise(resolve => setTimeout(resolve, 80));
}

function createFrame() {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const frameWindow = iframe.contentWindow;
    const sendToParent = jest.spyOn(window, 'postMessage').mockImplementation(() => {});
    frameWindow.eval(frameScript);
    return { iframe, window: frameWindow, sendToParent };
}

function render(frame, html, token = 'preview-token') {
    frame.window.dispatchEvent(new frame.window.MessageEvent('message', {
        source: window,
        data: { channel: bridgeChannel, type: 'render', token, html, documentProgress: 0 },
    }));
}

function bridgeMessages(sendToParent) {
    return sendToParent.mock.calls.map(([message]) => message)
        .filter(message => message?.channel === bridgeChannel);
}

describe('PDF preview frame bridge', () => {
    test('renders a supplied document without exposing a navigation escape hatch', async () => {
        const frame = createFrame();
        try {
            render(frame, `<!doctype html><html><head>
                <base href="/vault/notes/">
                <style id="print-style">body { color: rebeccapurple; }</style>
            </head><body class="figaro-pdf-preview-body">
                <main class="figaro-print-document"><a id="external" href="https://example.test/guide">Guide</a></main>
                <script id="injected">window.evil = true</script>
            </body></html>`);
            await waitForFrame();

            expect(frame.window.document.body.classList.contains('figaro-pdf-preview-body')).toBe(true);
            expect(frame.window.document.querySelector('#print-style').textContent).toContain('rebeccapurple');
            expect(frame.window.document.querySelector('#injected')).toBeNull();
            expect(frame.window.evil).toBeUndefined();

            const external = frame.window.document.getElementById('external');
            const click = new frame.window.MouseEvent('click', { bubbles: true, cancelable: true });
            external.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(frame.window.location.href).toBe('about:blank');
            expect(bridgeMessages(frame.sendToParent)).toContainEqual(expect.objectContaining({
                type: 'link',
                token: 'preview-token',
                href: 'https://example.test/guide',
            }));
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });

    test('handles footnote and return fragments inside the frame', async () => {
        const frame = createFrame();
        try {
            render(frame, `<!doctype html><html><head></head><body>
                <a id="reference" href="#footnote1">1</a>
                <p id="footnote1">Footnote <a id="return" href="#footnote-ref1">↩</a></p>
                <sup id="footnote-ref1">Reference</sup>
            </body></html>`);
            await waitForFrame();

            const footnote = frame.window.document.getElementById('footnote1');
            const reference = frame.window.document.getElementById('footnote-ref1');
            footnote.scrollIntoView = jest.fn();
            reference.scrollIntoView = jest.fn();

            const click = id => {
                const event = new frame.window.MouseEvent('click', { bubbles: true, cancelable: true });
                frame.window.document.getElementById(id).dispatchEvent(event);
                expect(event.defaultPrevented).toBe(true);
            };
            click('reference');
            click('return');

            expect(footnote.scrollIntoView).toHaveBeenCalledWith({ block: 'start', inline: 'nearest' });
            expect(reference.scrollIntoView).toHaveBeenCalledWith({ block: 'start', inline: 'nearest' });
            expect(bridgeMessages(frame.sendToParent).some(message => message.type === 'link')).toBe(false);
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });

    test('only completes the newest render when updates arrive back-to-back', async () => {
        const frame = createFrame();
        try {
            render(frame, '<!doctype html><html><body><p>First snapshot</p></body></html>', 'first-token');
            render(frame, '<!doctype html><html><body><p>Second snapshot</p></body></html>', 'second-token');
            await waitForFrame();

            expect(frame.window.document.body.textContent).toContain('Second snapshot');
            const rendered = bridgeMessages(frame.sendToParent)
                .filter(message => message.type === 'rendered');
            expect(rendered).toEqual([expect.objectContaining({ token: 'second-token' })]);
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });
});

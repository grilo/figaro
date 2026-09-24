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

function sendBridgeCommand(frame, type, payload = {}, token = 'preview-token') {
    frame.window.dispatchEvent(new frame.window.MessageEvent('message', {
        source: window,
        data: { channel: bridgeChannel, type, token, ...payload },
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

    test('suppresses resize-originated scroll reports until synchronization resumes', async () => {
        const frame = createFrame();
        try {
            render(frame, '<!doctype html><html><body><main class="figaro-print-document">Body</main></body></html>');
            await waitForFrame();
            frame.sendToParent.mockClear();

            sendBridgeCommand(frame, 'set-scroll-sync-paused', { paused: true });
            frame.window.dispatchEvent(new frame.window.Event('scroll'));
            await waitForFrame();
            expect(bridgeMessages(frame.sendToParent).filter(message => message.type === 'scroll')).toHaveLength(0);

            sendBridgeCommand(frame, 'set-scroll-sync-paused', { paused: false });
            frame.window.dispatchEvent(new frame.window.Event('scroll'));
            await waitForFrame();
            expect(bridgeMessages(frame.sendToParent)).toContainEqual(expect.objectContaining({
                type: 'scroll',
                token: 'preview-token',
            }));
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });

    test('synchronizes source anchors across differently sized rendered blocks', async () => {
        const frame = createFrame();
        try {
            render(frame, `<!doctype html><html><body><main class="figaro-print-document">
                <p id="first" data-figaro-source-start="0" data-figaro-source-end="10">First</p>
                <pre id="tall" data-figaro-source-start="20" data-figaro-source-end="30">Tall code</pre>
            </main></body></html>`);
            await waitForFrame();

            const root = frame.window.document.scrollingElement || frame.window.document.documentElement;
            Object.defineProperties(root, {
                clientHeight: { configurable: true, value: 400 },
                scrollHeight: { configurable: true, value: 2000 },
                scrollTop: { configurable: true, writable: true, value: 0 },
            });
            root.getBoundingClientRect = () => ({ top: 0, bottom: 400, height: 400 });
            const first = frame.window.document.getElementById('first');
            const tall = frame.window.document.getElementById('tall');
            first.getBoundingClientRect = () => ({ top: 100 - root.scrollTop, bottom: 200 - root.scrollTop, height: 100 });
            tall.getBoundingClientRect = () => ({ top: 800 - root.scrollTop, bottom: 1000 - root.scrollTop, height: 200 });

            frame.sendToParent.mockClear();
            sendBridgeCommand(frame, 'set-source-position', {
                sourceLine: 22,
                lineProgress: 0.5,
                progress: 0.9,
            });
            expect(root.scrollTop).toBe(730);

            // The host's own command echoes back as programmatic, without a lookup.
            frame.window.dispatchEvent(new frame.window.Event('scroll'));
            await waitForFrame();
            const echo = bridgeMessages(frame.sendToParent).filter(message => message.type === 'scroll').at(-1);
            expect(echo).toMatchObject({ programmatic: true });
            expect(echo.sourceLine).toBeUndefined();

            // A reader scroll maps back through the same continuous source position.
            frame.window.dispatchEvent(new frame.window.Event('wheel'));
            frame.sendToParent.mockClear();
            frame.window.dispatchEvent(new frame.window.Event('scroll'));
            await waitForFrame();
            expect(bridgeMessages(frame.sendToParent)).toContainEqual(expect.objectContaining({
                type: 'scroll', sourceLine: 22, lineProgress: 0.5, programmatic: false,
            }));

            // Between blocks the position interpolates instead of snapping.
            root.scrollTop = 380; // marker at 500: halfway between line 10 (y 200) and line 20 (y 800)
            frame.sendToParent.mockClear();
            frame.window.dispatchEvent(new frame.window.Event('scroll'));
            await waitForFrame();
            expect(bridgeMessages(frame.sendToParent)).toContainEqual(expect.objectContaining({
                type: 'scroll', sourceLine: 15, lineProgress: 0, programmatic: false,
            }));
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });

    test('a layout scroll right after a host command is not sent back to the editor', async () => {
        const frame = createFrame();
        try {
            render(frame, `<!doctype html><html><body><main class="figaro-print-document">
                <p id="only" data-figaro-source-start="0" data-figaro-source-end="40">Text</p>
            </main></body></html>`);
            await waitForFrame();
            const root = frame.window.document.scrollingElement || frame.window.document.documentElement;
            Object.defineProperties(root, {
                clientHeight: { configurable: true, value: 400 },
                scrollHeight: { configurable: true, value: 4000 },
                scrollTop: { configurable: true, writable: true, value: 0 },
            });
            frame.window.document.getElementById('only').getBoundingClientRect = () => ({ top: -root.scrollTop, bottom: 4000 - root.scrollTop, height: 4000 });
            sendBridgeCommand(frame, 'set-source-position', { sourceLine: 10, lineProgress: 0, progress: 0.25 });
            await waitForFrame();
            // An image load then clamps or shifts the page without reader input.
            root.scrollTop += 37;
            frame.sendToParent.mockClear();
            frame.window.dispatchEvent(new frame.window.Event('scroll'));
            await waitForFrame();
            expect(bridgeMessages(frame.sendToParent).filter(message => message.type === 'scroll').every(message => message.programmatic)).toBe(true);
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });

    test('blocks rendered out of source order, such as footnotes, do not break the mapping', async () => {
        const frame = createFrame();
        try {
            render(frame, `<!doctype html><html><body><main class="figaro-print-document">
                <p id="a" data-figaro-source-start="0" data-figaro-source-end="2">A</p>
                <p id="b" data-figaro-source-start="10" data-figaro-source-end="12">B</p>
                <p id="note" data-figaro-source-start="4" data-figaro-source-end="5">Footnote</p>
            </main></body></html>`);
            await waitForFrame();
            const root = frame.window.document.scrollingElement || frame.window.document.documentElement;
            Object.defineProperties(root, {
                clientHeight: { configurable: true, value: 100 },
                scrollHeight: { configurable: true, value: 3000 },
                scrollTop: { configurable: true, writable: true, value: 0 },
            });
            const place = (id, top, height) => { frame.window.document.getElementById(id).getBoundingClientRect = () => ({ top: top - root.scrollTop, bottom: top + height - root.scrollTop, height }); };
            place('a', 0, 100); place('b', 1000, 100); place('note', 2800, 100);
            // Line 4 lies between A and B in the source; it must not jump to the footnote.
            sendBridgeCommand(frame, 'set-source-position', { sourceLine: 6, lineProgress: 0, progress: 0.5 });
            expect(root.scrollTop).toBeGreaterThan(100);
            expect(root.scrollTop).toBeLessThan(1000);
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });

    test('a re-render restores the source position instead of a document percentage', async () => {
        const frame = createFrame();
        try {
            const root = frame.window.document.scrollingElement || frame.window.document.documentElement;
            Object.defineProperties(root, {
                clientHeight: { configurable: true, value: 100 },
                scrollHeight: { configurable: true, value: 5000 },
                scrollTop: { configurable: true, writable: true, value: 0 },
            });
            frame.window.dispatchEvent(new frame.window.MessageEvent('message', {
                source: window,
                data: { channel: bridgeChannel, type: 'render', token: 'preview-token', documentProgress: 0.9, sourceLine: 30, lineProgress: 0,
                    html: '<main class="figaro-print-document"><p id="p" data-figaro-source-start="0" data-figaro-source-end="100">Long</p></main>' },
            }));
            frame.window.document.getElementById('p').getBoundingClientRect = () => ({ top: -root.scrollTop, bottom: 1000 - root.scrollTop, height: 1000 });
            await waitForFrame();
            await waitForFrame();
            // Line 30 of 100 sits at y 300; the marker is 30% down a 100px viewport.
            expect(root.scrollTop).toBe(270);
        } finally {
            frame.iframe.remove();
            frame.sendToParent.mockRestore();
        }
    });
});

import fs from 'node:fs';
import path from 'node:path';

const bridgePath = path.resolve(process.cwd(), 'frontend/wails-compat-bridge.js');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');

describe('packaged desktop compatibility bridge', () => {
    beforeEach(() => {
        document.body.innerHTML = '<span id="status-text"></span><div class="top-bar"></div>';
        delete window.pywebview;
        delete window.__wailsCompat;
        window.go = {
            main: {
                App: {
                    GetFileTree: jest.fn().mockResolvedValue([
                        { name: 'Welcome.md', path: 'Welcome.md', type: 'file' },
                    ]),
                    LinkStyleLoad: jest.fn().mockResolvedValue({ style: 'wikilink' }),
                },
            },
        };
    });

    afterEach(() => {
        delete window.go;
        delete window.pywebview;
        delete window.__wailsCompat;
    });

    test('parses and exposes file-tree and link-style APIs without blocking desktop startup', async () => {
        expect(() => new Function(bridgeSource)).not.toThrow();

        window.eval(bridgeSource);
        await Promise.resolve();
        await Promise.resolve();

        await expect(window.pywebview.api.get_file_tree()).resolves.toEqual([
            { name: 'Welcome.md', path: 'Welcome.md', type: 'file' },
        ]);
        await expect(window.pywebview.api.link_style_load()).resolves.toEqual({ style: 'wikilink' });
        expect(window.__wailsCompat).toEqual(expect.objectContaining({
            windowMinimize: expect.any(Function),
            windowMaximize: expect.any(Function),
            windowClose: expect.any(Function),
        }));
    });
});

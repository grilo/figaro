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
                    LineNumbersLoad: jest.fn().mockResolvedValue({ enabled: false }),
                    CreateInboxNote: jest.fn().mockResolvedValue({ success: true, path: 'Inbox/note.md' }),
                    FileHasUncommittedChanges: jest.fn().mockResolvedValue(true),
                    WindowCaptureState: jest.fn(),
                },
            },
        };
    });

    afterEach(() => {
        jest.useRealTimers();
        delete window.go;
        delete window.pywebview;
        delete window.__wailsCompat;
    });

    test('exposes APIs without an eager native window capture, then debounces real resize capture', async () => {
        jest.useFakeTimers();
        expect(() => new Function(bridgeSource)).not.toThrow();

        window.eval(bridgeSource);
        await Promise.resolve();
        await Promise.resolve();

        await expect(window.pywebview.api.get_file_tree()).resolves.toEqual([
            { name: 'Welcome.md', path: 'Welcome.md', type: 'file' },
        ]);
        await expect(window.pywebview.api.link_style_load()).resolves.toEqual({ style: 'wikilink' });
        await expect(window.pywebview.api.line_numbers_load()).resolves.toEqual({ enabled: false });
        await expect(window.pywebview.api.create_inbox_note()).resolves.toEqual({ success: true, path: 'Inbox/note.md' });
        await expect(window.pywebview.api.file_has_uncommitted_changes('Welcome.md')).resolves.toBe(true);
        expect(window.go.main.App.FileHasUncommittedChanges).toHaveBeenCalledWith('Welcome.md');
        expect(window.go.main.App.WindowCaptureState).not.toHaveBeenCalled();
        window.dispatchEvent(new Event('resize'));
        jest.advanceTimersByTime(249);
        expect(window.go.main.App.WindowCaptureState).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(window.go.main.App.WindowCaptureState).toHaveBeenCalledTimes(1);
        expect(window.__wailsCompat).toEqual(expect.objectContaining({
            windowMinimize: expect.any(Function),
            windowMaximize: expect.any(Function),
            windowClose: expect.any(Function),
        }));
    });
});

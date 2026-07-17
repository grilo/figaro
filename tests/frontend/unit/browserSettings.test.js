import { initPDFBrowserSetting } from '../frontend/js/theme.js';

describe('PDF browser setting', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <p id="pdf-browser-status"></p>
            <button id="pdf-browser-choose">Choose…</button>
            <button id="pdf-browser-clear" hidden>Use automatic</button>
        `;
        window.go.main.App.PDFBrowserLoad.mockResolvedValue({
            success: true,
            path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        });
    });

    test('shows, replaces, and clears the persisted executable through native APIs', async () => {
        await initPDFBrowserSetting();
        const status = document.getElementById('pdf-browser-status');
        const choose = document.getElementById('pdf-browser-choose');
        const clear = document.getElementById('pdf-browser-clear');
        expect(status.textContent).toContain('chrome.exe');
        expect(status.title).toContain('Google\\Chrome');
        expect(clear.hidden).toBe(false);

        window.go.main.App.PDFBrowserChoose.mockResolvedValueOnce({
            success: true,
            path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            engine: 'edge',
        });
        choose.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(status.textContent).toContain('msedge.exe');

        clear.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(window.go.main.App.PDFBrowserClear).toHaveBeenCalledTimes(1);
        expect(status.textContent).toContain('Automatic detection');
        expect(clear.hidden).toBe(true);
    });
});

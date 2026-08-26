import { createDebugThemeAssets } from '../../../frontend/js/debugThemeAssets.js';

describe('browser-debug theme assets', () => {
    test('loads the bundled manifest and requested stylesheet through the injected asset port', async () => {
        const fetchImpl = jest.fn(async path => {
            if (path === '/themes/manifest.json') return {
                ok: true,
                json: async () => [{ id: 'default', name: 'Figaro Dark' }, { id: 'figaro-light', name: 'Figaro Light' }],
            };
            return { ok: true, text: async () => ':root { --bg-color: #1a1816; }' };
        });
        const assets = createDebugThemeAssets(fetchImpl);

        await expect(assets.getThemes()).resolves.toEqual({ themes: [
            { id: 'default', name: 'Figaro Dark' },
            { id: 'figaro-light', name: 'Figaro Light' },
        ] });
        await expect(assets.getThemeCSS('figaro-light')).resolves.toEqual({
            css: ':root { --bg-color: #1a1816; }',
        });
        expect(fetchImpl).toHaveBeenCalledWith('/themes/figaro-light.css');
    });

    test('contains unknown or malformed theme ids and degrades to Figaro Dark assets', async () => {
        const fetchImpl = jest.fn(async path => {
            if (path === '/themes/manifest.json') return { ok: false };
            return { ok: true, text: async () => 'dark css' };
        });
        const assets = createDebugThemeAssets(fetchImpl);

        await expect(assets.getThemes()).resolves.toEqual({ themes: [{ id: 'default', name: 'Figaro Dark' }] });
        await expect(assets.getThemeCSS('../private')).resolves.toEqual({ css: 'dark css' });
        expect(fetchImpl).toHaveBeenLastCalledWith('/themes/default.css');
    });
});

const mockSetEditorTabSize = jest.fn();

jest.mock('../frontend/js/editor.js', () => ({
    setEditorTabSize: mockSetEditorTabSize,
}));

function settingDOM() {
    document.body.innerHTML = `
        <div class="ui-stepper tab-size-control" role="group" aria-labelledby="tab-size-label">
            <button type="button" class="ui-stepper-button tab-size-down" aria-label="Decrease tab size">−</button>
            <input class="ui-stepper-value tab-size-value" type="number" min="2" max="8" step="1" value="4" aria-label="Tab size in spaces">
            <button type="button" class="ui-stepper-button tab-size-up" aria-label="Increase tab size">+</button>
        </div>`;
}

async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('tab-size preference', () => {
    beforeEach(() => {
        jest.resetModules();
        mockSetEditorTabSize.mockClear();
        window.go.desktop.App.TabSizeLoad.mockReset().mockResolvedValue({ size: 4 });
        window.go.desktop.App.TabSizeSave.mockReset().mockResolvedValue({ success: true });
        settingDOM();
    });

    test('loads four by default and persists typed and stepped values', async () => {
        const api = window.go.desktop.App;
        api.TabSizeLoad.mockResolvedValueOnce({ size: 4 });
        const preference = await import('../frontend/js/tabSizePreference.js');
        await preference.initTabSizeSettings(document);

        const control = document.querySelector('.tab-size-control');
        const input = control.querySelector('.tab-size-value');
        const down = control.querySelector('.tab-size-down');
        const up = control.querySelector('.tab-size-up');
        expect(input.value).toBe('4');
        expect(input.min).toBe('2');
        expect(input.max).toBe('8');
        expect(mockSetEditorTabSize).toHaveBeenCalledWith(4);

        up.click();
        await settle();
        expect(api.TabSizeSave).toHaveBeenLastCalledWith(5);
        expect(input.value).toBe('5');

        input.value = '8';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(api.TabSizeSave).toHaveBeenLastCalledWith(8);
        expect(up.disabled).toBe(true);
        expect(down.disabled).toBe(false);
    });

    test('rolls the live editor and number box back when persistence fails', async () => {
        const api = window.go.desktop.App;
        api.TabSizeLoad.mockResolvedValueOnce({ size: 4 });
        api.TabSizeSave.mockResolvedValueOnce({ success: false, error: 'read-only settings' });
        const preference = await import('../frontend/js/tabSizePreference.js');
        await preference.initTabSizeSettings(document);

        document.querySelector('.tab-size-up').click();
        await settle();

        expect(document.querySelector('.tab-size-value').value).toBe('4');
        expect(mockSetEditorTabSize).toHaveBeenLastCalledWith(4);
        expect(document.querySelector('.tab-size-control').title).toMatch(/previous value was restored/i);
    });
});

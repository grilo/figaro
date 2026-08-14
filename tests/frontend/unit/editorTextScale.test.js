import {
    applyEditorTextScale,
    getBufferEditorTextScale,
    getConfiguredEditorTextScale,
    persistConfiguredEditorTextScale,
    renderEditorTextScaleStatus,
    resetBufferEditorTextScale,
    setBufferEditorTextScale,
} from '../frontend/js/editorTextScale.js';

describe('editor text scale adapter', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.style.removeProperty('--font-size-editor');
        document.documentElement.style.removeProperty('--line-height-editor');
        document.body.innerHTML = `
            <span id="editor-scale-separator" hidden>|</span>
            <button id="editor-scale-status" hidden></button>
        `;
    });

    test('keeps the configured default separate from the temporary buffer value', () => {
        expect(getConfiguredEditorTextScale()).toBe(100);
        expect(persistConfiguredEditorTextScale(110)).toBe(110);
        expect(localStorage.getItem('editor-font-size')).toBe('110');

        const tab = { id: 'note.md', type: 'file' };
        expect(getBufferEditorTextScale(tab)).toBe(110);
        setBufferEditorTextScale(tab, 130);
        expect(getBufferEditorTextScale(tab)).toBe(130);
        expect(localStorage.getItem('editor-font-size')).toBe('110');
        expect(resetBufferEditorTextScale(tab)).toBe(110);
        expect(tab).not.toHaveProperty('_editorTextScale');
    });

    test('applies only font size, retains a stable line-height ratio, and anchors reflow', () => {
        const measureRequests = [];
        const view = {
            posAtCoords: jest.fn(() => 12),
            coordsAtPos: jest.fn(() => ({ top: 80 })),
            requestMeasure: jest.fn(request => measureRequests.push(request)),
            scrollDOM: { scrollTop: 240 },
            dom: document.createElement('div'),
        };

        applyEditorTextScale(120, {
            view,
            anchorEvent: { clientX: 50, clientY: 80 },
        });

        expect(document.documentElement.style.getPropertyValue('--font-size-editor')).toBe('19.44px');
        expect(document.documentElement.style.getPropertyValue('--line-height-editor')).toBe('1.65');
        expect(view.posAtCoords).toHaveBeenCalledWith({ x: 50, y: 80 });
        const anchorMeasure = measureRequests.find(request => request?.key);
        view.coordsAtPos.mockReturnValueOnce({ top: 96 });
        const top = anchorMeasure.read(view);
        anchorMeasure.write(top, view);
        expect(view.scrollDOM.scrollTop).toBe(256);
    });

    test('renders a keyboard-operable reset label only for an active file', () => {
        localStorage.setItem('editor-font-size', '110');
        const tab = { id: 'note.md', type: 'file', _editorTextScale: 130 };
        renderEditorTextScaleStatus(tab);

        const button = document.getElementById('editor-scale-status');
        expect(button.hidden).toBe(false);
        expect(button.textContent).toBe('Scale 130%');
        expect(button.getAttribute('aria-label')).toContain('Settings default 110%');
        expect(document.getElementById('editor-scale-separator').hidden).toBe(false);

        renderEditorTextScaleStatus({ type: 'settings' });
        expect(button.hidden).toBe(true);
        expect(document.getElementById('editor-scale-separator').hidden).toBe(true);
    });
});

import { createMermaidPreviewNavigation } from '../../../frontend/js/mermaidPreviewNavigation.js';

describe('Mermaid preview navigation', () => {
    test('fits content at rest and offers keyboard zoom, pan, and reset without touching source', () => {
        document.body.innerHTML = '<div id="preview"><p id="empty">Empty</p></div>';
        const preview = document.getElementById('preview');
        Object.defineProperties(preview, {
            clientWidth: { value: 500 },
            clientHeight: { value: 300 },
        });
        const navigation = createMermaidPreviewNavigation(preview, {
            emptyElement: document.getElementById('empty'),
        });
        navigation.setSVG('<svg viewBox="0 0 2000 1000"><rect width="2000" height="1000"/></svg>');

        expect(navigation.canvas.dataset.zoom).toBe('1.0000');
        expect(preview.classList.contains('has-preview')).toBe(true);
        expect(document.getElementById('empty')).toBeNull();

        preview.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
        expect(Number(navigation.canvas.dataset.zoom)).toBeGreaterThan(1);
        preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        expect(Number(navigation.canvas.dataset.panX)).not.toBe(0);
        preview.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }));
        expect(navigation.transform).toEqual({ scale: 1, x: 0, y: 0 });

        navigation.destroy();
        preview.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
        expect(navigation.transform).toEqual({ scale: 1, x: 0, y: 0 });
    });
});

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

    test('selects a known flowchart node on click but treats pointer movement as panning', () => {
        document.body.innerHTML = '<div id="preview"></div>';
        const preview = document.getElementById('preview');
        const onNodeSelect = jest.fn();
        const navigation = createMermaidPreviewNavigation(preview, { onNodeSelect });
        navigation.setSelectableNodeIds(['Draft', 'Review']);
        navigation.setSVG([
            '<svg>',
            '<g class="node" id="preview-flowchart-Draft-0"><rect/><text>Draft</text></g>',
            '<g class="node" id="preview-flowchart-Review-1"><rect/><text>Review</text></g>',
            '</svg>',
        ].join(''));
        navigation.setSelectedNode('Draft');
        expect(navigation.canvas.querySelector('[data-figaro-node-id="Draft"]')
            .classList.contains('is-figaro-selected')).toBe(true);

        const draft = navigation.canvas.querySelector('[data-figaro-node-id="Draft"] rect');
        const down = new Event('pointerdown', { bubbles: true, cancelable: true });
        Object.assign(down, { button: 0, pointerId: 7, clientX: 10, clientY: 10 });
        draft.dispatchEvent(down);
        const up = new Event('pointerup', { bubbles: true, cancelable: true });
        Object.assign(up, { pointerId: 7, clientX: 10, clientY: 10 });
        draft.dispatchEvent(up);
        expect(onNodeSelect).toHaveBeenCalledWith('Draft');

        const review = navigation.canvas.querySelector('[data-figaro-node-id="Review"] rect');
        const dragDown = new Event('pointerdown', { bubbles: true, cancelable: true });
        Object.assign(dragDown, { button: 0, pointerId: 8, clientX: 10, clientY: 10 });
        review.dispatchEvent(dragDown);
        const move = new Event('pointermove', { bubbles: true, cancelable: true });
        Object.assign(move, { pointerId: 8, clientX: 30, clientY: 10 });
        review.dispatchEvent(move);
        const dragUp = new Event('pointerup', { bubbles: true, cancelable: true });
        Object.assign(dragUp, { pointerId: 8, clientX: 30, clientY: 10 });
        review.dispatchEvent(dragUp);
        expect(onNodeSelect).toHaveBeenCalledTimes(1);
        navigation.destroy();
    });
});

import { fitGraphicToSourceFootprint } from '../frontend/js/sourceFootprint.js';

test('chart fitting coalesces resize notifications outside observer delivery and cancels obsolete measurements', async () => {
    const root = document.createElement('div'), viewport = document.createElement('div'), graphic = document.createElement('div');
    root.append(viewport); viewport.append(graphic); document.body.append(root);
    let resize;
    const disconnect = jest.fn();
    const observer = jest.spyOn(window, 'ResizeObserver').mockImplementation(callback => {
        resize = callback; return { observe() {}, disconnect };
    });
    let frame;
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const read = jest.spyOn(graphic, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 100 });
    jest.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100 });
    try {
        const stop = fitGraphicToSourceFootprint(root, viewport, graphic);
        await Promise.resolve(); read.mockClear();
        resize(); resize(); resize();
        expect(read).not.toHaveBeenCalled(); expect(raf).toHaveBeenCalledTimes(1);
        frame(); expect(read).toHaveBeenCalledTimes(1);
        expect(graphic.style.transform).toBe('scale(0.5)');
        resize(); const oldFrame = frame;
        const stopNew = fitGraphicToSourceFootprint(root, viewport, graphic);
        await Promise.resolve(); read.mockClear();
        oldFrame(); expect(read).not.toHaveBeenCalled();
        expect(cancel).toHaveBeenCalledWith(1);
        stop(); resize(); read.mockClear(); stopNew(); frame();
        expect(read).not.toHaveBeenCalled(); expect(disconnect).toHaveBeenCalled();
    } finally { observer.mockRestore(); raf.mockRestore(); cancel.mockRestore(); root.remove(); }
});

test('restored-note footprint rulers wait outside resize delivery without delaying source replacement measurements', async () => {
    const { sourceFootprintExtension } = await import('../frontend/js/sourceFootprint.js');
    const dom = document.createElement('div'), contentDOM = document.createElement('div');
    contentDOM.innerHTML = '<div class="cm-line">text</div><div class="cm-source-footprint" data-source-lines="1"></div>';
    contentDOM.lastChild.__figaroSourceFootprintText = 'source';
    dom.append(contentDOM); document.body.append(dom);
    let resize, frame;
    const observer = jest.spyOn(window, 'ResizeObserver').mockImplementation(callback => {
        resize = callback; return { observe() {}, disconnect() {} };
    });
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 2; });
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const read = jest.spyOn(contentDOM.firstChild, 'getBoundingClientRect');
    try {
        const plugin = sourceFootprintExtension.create({ dom, contentDOM, defaultLineHeight: 20, requestMeasure: jest.fn(), isDestroyed: false });
        await Promise.resolve(); read.mockClear();
        resize([{ contentRect: { width: 600 } }]);
        resize([{ contentRect: { width: 610 } }]);
        await Promise.resolve();
        expect(read).not.toHaveBeenCalled(); expect(raf).toHaveBeenCalledTimes(1);
        frame(); await Promise.resolve(); expect(read).toHaveBeenCalledTimes(1);
        read.mockClear();
        plugin.update({ docChanged: true }); plugin.update({ viewportChanged: true });
        await Promise.resolve(); expect(read).toHaveBeenCalledTimes(1);
        resize([{ contentRect: { width: 620 } }]);
        plugin.destroy(); expect(cancel).toHaveBeenCalledWith(2);
    } finally { observer.mockRestore(); raf.mockRestore(); cancel.mockRestore(); dom.remove(); }
});

test('footprint rulers batch their reads, reuse unchanged heights, and skip prose and authored chart sizes', async () => {
    const { markSourceFootprint, sourceFootprintExtension } = await import('../frontend/js/sourceFootprint.js');
    const dom = document.createElement('div'), contentDOM = document.createElement('div');
    contentDOM.innerHTML = '<div class="cm-line">Prose</div>';
    dom.append(contentDOM); document.body.append(dom);
    const view = { dom, contentDOM, defaultLineHeight: 20, requestMeasure: jest.fn(), isDestroyed: false };
    let expectedRulers = 2, rulerReads = 0, metricReads = 0;
    const read = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.classList.contains('cm-source-footprint-sizer')) {
            expect(dom.querySelectorAll('.cm-source-footprint-sizer')).toHaveLength(expectedRulers);
            rulerReads++;
            return { width: 300, height: 80 };
        }
        metricReads++;
        return { width: 300, height: 20 };
    });
    const plugin = sourceFootprintExtension.create(view);
    try {
        await Promise.resolve();
        expect(metricReads).toBe(0);
        const chart = document.createElement('div');
        markSourceFootprint(chart, { kind: 'vega-lite', lineCount: 4, sourceText: 'chart source' });
        chart.dataset.figaroChartHeight = '200'; contentDOM.append(chart);
        plugin.schedule(); await Promise.resolve();
        expect(metricReads).toBe(0);
        expect(chart.style.getPropertyValue('--cm-source-footprint-height')).toBe('244px');
        const blocks = ['One wrapped source', 'Another wrapped source'].map(sourceText => {
            const element = document.createElement('div');
            markSourceFootprint(element, { kind: 'table', lineCount: 2, sourceText });
            contentDOM.append(element); return element;
        });
        plugin.schedule(); await Promise.resolve();
        expect(rulerReads).toBe(2);
        expect(blocks.map(block => block.style.getPropertyValue('--cm-source-footprint-height'))).toEqual(['80px', '80px']);
        expect(dom.querySelector('.cm-source-footprint-sizer')).toBeNull();
        plugin.update({ viewportChanged: true }); await Promise.resolve();
        expect(rulerReads).toBe(2);
        expectedRulers = 1;
        blocks[0].__figaroSourceFootprintText = 'Changed source';
        plugin.update({ docChanged: true }); await Promise.resolve();
        expect(rulerReads).toBe(3);
        // Explicit typography changes invalidate both cached wrapping results.
        expectedRulers = 2;
        view.requestMeasure = request => { if (request) request.write(request.read()); };
        const { requestSourceFootprintMeasure } = await import('../frontend/js/sourceFootprint.js');
        requestSourceFootprintMeasure(view); await Promise.resolve();
        expect(rulerReads).toBe(5);
    } finally { view.isDestroyed = true; plugin.destroy(); read.mockRestore(); dom.remove(); }
});

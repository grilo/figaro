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
    contentDOM.innerHTML = '<div class="cm-line">text</div>'; dom.append(contentDOM); document.body.append(dom);
    let resize, frame;
    const observer = jest.spyOn(window, 'ResizeObserver').mockImplementation(callback => {
        resize = callback; return { observe() {}, disconnect() {} };
    });
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 2; });
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const read = jest.spyOn(contentDOM.firstChild, 'getBoundingClientRect');
    try {
        const plugin = sourceFootprintExtension.create({ dom, contentDOM, isDestroyed: false });
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

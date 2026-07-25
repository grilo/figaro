describe('diagram renderer startup', () => {
    beforeEach(() => {
        jest.resetModules();
        window.mermaid = {
            initialize: jest.fn(),
            render: jest.fn(),
        };
        window.vegaEmbed = jest.fn();
    });

    afterEach(() => {
        delete window.mermaid;
        delete window.vegaEmbed;
    });

    test('initializes bundled diagram engines eagerly and only once', async () => {
        const { initializeDiagramRenderers } = await import('../frontend/js/diagramRenderer.js');

        expect(initializeDiagramRenderers()).toEqual({ mermaid: true, vega: true });
        expect(initializeDiagramRenderers()).toEqual({ mermaid: true, vega: true });
        expect(window.mermaid.initialize).toHaveBeenCalledTimes(1);
        expect(window.mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
            startOnLoad: false,
            securityLevel: 'loose',
        }));
    });
});

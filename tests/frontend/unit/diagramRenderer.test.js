describe('diagram renderer startup', () => {
    beforeEach(() => {
        jest.resetModules();
        window.mermaid = {
            initialize: jest.fn(),
            parse: jest.fn().mockResolvedValue({ diagramType: 'flowchart-v2' }),
            render: jest.fn().mockResolvedValue({ svg: '<svg></svg>' }),
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

    test('rejects unsafe Mermaid frontmatter before calling the vendored parser', async () => {
        const { renderDiagramSVG, validateMermaidSource } = await import('../frontend/js/diagramRenderer.js');
        const source = [
            '---',
            'config: !!omap',
            '- dangerous: value',
            '---',
            'flowchart TD',
            '  A --> B',
        ].join('\n');

        await expect(renderDiagramSVG('mermaid', source)).rejects.toMatchObject({
            code: 'unsafe-yaml-ordered-map',
        });
        expect(window.mermaid.initialize).not.toHaveBeenCalled();
        expect(window.mermaid.render).not.toHaveBeenCalled();
        await expect(validateMermaidSource(source)).rejects.toMatchObject({
            code: 'unsafe-yaml-ordered-map',
        });
        expect(window.mermaid.parse).not.toHaveBeenCalled();
    });

    test('validates source without rendering and returns the detected diagram type', async () => {
        const { validateMermaidSource } = await import('../frontend/js/diagramRenderer.js');

        await expect(validateMermaidSource('flowchart TD\n  A --> B'))
            .resolves.toEqual({ diagramType: 'flowchart-v2' });
        expect(window.mermaid.parse).toHaveBeenCalledWith('flowchart TD\n  A --> B');
        expect(window.mermaid.render).not.toHaveBeenCalled();
    });
});

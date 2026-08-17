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

    test('reuses cached Mermaid SVG output while rebasing generated ids per mount', async () => {
        window.mermaid.render.mockImplementation(async id => ({
            svg: `<svg id="${id}"><use href="#${id}"/></svg>`,
        }));
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        const source = 'flowchart TD\n  A --> B';

        const first = await renderDiagramSVG('mermaid', source, 'live');
        const second = await renderDiagramSVG('mermaid', source, 'print');

        expect(window.mermaid.render).toHaveBeenCalledTimes(1);
        expect(first).toContain('live-mermaid-1');
        expect(second).toContain('print-mermaid-2');
        expect(second).not.toContain('live-mermaid-1');
    });

    test('deduplicates concurrent renders of identical Mermaid source', async () => {
        window.mermaid.render.mockImplementation(async id => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return { svg: `<svg id="${id}"/>` };
        });
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        const source = 'flowchart TD\n  A --> B';

        const [first, second] = await Promise.all([
            renderDiagramSVG('mermaid', source, 'live'),
            renderDiagramSVG('mermaid', source, 'live'),
        ]);

        expect(window.mermaid.render).toHaveBeenCalledTimes(1);
        expect(first).toContain('live-mermaid-1');
        expect(second).toContain('live-mermaid-2');
        expect(second).not.toContain('live-mermaid-1');
    });
});

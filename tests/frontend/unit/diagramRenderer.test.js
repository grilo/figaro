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
        for (const token of ['--text-color', '--text-muted', '--border-color']) {
            document.documentElement.style.removeProperty(token);
        }
        document.querySelectorAll('[data-figaro-vega-render-target]').forEach(target => target.remove());
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

    test('snapshots original Mermaid node identities/classes without leaking parser state or interleaving renders', async () => {
        const nodes = new Map([['A', {id:'A',text:'Car',styles:['fill:#ef4444']}],['B',{id:'B'}],['C',{id:'C'}]]);
        const classes = new Map([['blue',{styles:['fill:#3b82f6']}]]);
        let completeInspection;
        const inspectionReady = new Promise(resolve => {completeInspection = resolve;});
        window.mermaid.mermaidAPI = {
            getDiagramFromText: jest.fn(() => inspectionReady),
            getConfig: jest.fn(() => ({themeVariables:{mainBkg:'#ffffff'}})),
        };
        const {inspectMermaidSource,renderDiagramSVG} = await import('../frontend/js/diagramRenderer.js');
        const source = 'flowchart TD\n A[fa:fa-car Car] --> B --> C\n\n%% Figaro node styles\nA@{ shape: stadium }\n%% End Figaro node styles';
        const pending = inspectMermaidSource(source);
        const render = renderDiagramSVG('mermaid','flowchart TD\n X --> Y');
        for (let i=0; i<5; i++) await Promise.resolve();
        expect(window.mermaid.render).not.toHaveBeenCalled();
        completeInspection({db:{getVertices:()=>nodes,getClasses:()=>classes}});
        const inspected = await pending;
        await render;
        expect(window.mermaid.mermaidAPI.getDiagramFromText).toHaveBeenCalledWith('flowchart TD\n A[fa:fa-car Car] --> B --> C');
        nodes.get('A').text = 'mutated';
        classes.get('blue').styles[0] = 'mutated';
        expect(inspected.nodes.map(node => node.id)).toEqual(['A','B','C']);
        expect(inspected.nodes[0].text).toBe('Car');
        expect(inspected.classes.blue.styles).toEqual(['fill:#3b82f6']);
        expect(inspected.effectiveVariables.mainBkg).toBe('#ffffff');
        expect(window.mermaid.render).toHaveBeenCalledTimes(1);
    });

    test('inspection rejects unsafe source before parser access and its failures do not poison the render queue', async () => {
        window.mermaid.mermaidAPI = { getDiagramFromText: jest.fn().mockRejectedValue(new Error('Invalid syntax')) };
        const {inspectMermaidSource,renderDiagramSVG} = await import('../frontend/js/diagramRenderer.js');
        await expect(inspectMermaidSource('---\nconfig: !!omap\n- unsafe: true\n---\nflowchart TD\n A --> B'))
            .rejects.toMatchObject({code:'unsafe-yaml-ordered-map'});
        expect(window.mermaid.parse).not.toHaveBeenCalled();
        await expect(inspectMermaidSource('broken')).rejects.toThrow('Invalid syntax');
        await expect(renderDiagramSVG('mermaid','flowchart TD\n A --> B')).resolves.toBe('<svg></svg>');
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

    test('themes container-width Vega-Lite charts on a temporary connected render surface', async () => {
        const toSVG = jest.fn().mockResolvedValue('<svg viewBox="0 0 640 340"></svg>');
        const finalize = jest.fn();
        let connectedDuringRender = false;
        let renderTarget = null;
        window.vegaEmbed.mockImplementation(async target => {
            renderTarget = target;
            connectedDuringRender = target.isConnected;
            return { view: { toSVG, finalize } };
        });
        document.documentElement.style.setProperty('--text-color', '#f5eee4');
        document.documentElement.style.setProperty('--text-muted', '#b9ac9e');
        document.documentElement.style.setProperty('--border-color', '#443d34');
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        const source = JSON.stringify({
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            width: 'container',
            height: 340,
            data: { values: [{ x: 'A', y: 1 }] },
            mark: 'bar',
            encoding: {
                x: { field: 'x', type: 'nominal' },
                y: { field: 'y', type: 'quantitative' },
            },
        });

        await expect(renderDiagramSVG('vega-lite', source, 'chart-preview', {
            appearance: 'application',
            containerWidth: 720,
        }))
            .resolves.toContain('viewBox="0 0 640 340"');
        const [target, spec, options] = window.vegaEmbed.mock.calls[0];
        expect(connectedDuringRender).toBe(true);
        expect(target.style.width).toBe('720px');
        expect(renderTarget.isConnected).toBe(false);
        expect(document.querySelector('[data-figaro-vega-render-target]')).toBeNull();
        expect(spec.width).toBe('container');
        expect(spec.background).toBe('transparent');
        expect(spec.config).toMatchObject({
            axis: { labelColor: '#b9ac9e', titleColor: '#f5eee4', gridColor: '#443d34' },
            legend: { labelColor: '#b9ac9e', titleColor: '#f5eee4' },
            text: { color: '#f5eee4' },
        });
        expect(options).toMatchObject({ mode: 'vega-lite', actions: false, renderer: 'svg' });
        expect(toSVG).toHaveBeenCalledTimes(1);
        expect(finalize).toHaveBeenCalledTimes(1);
    });

    test('rejects a zero-geometry Vega SVG instead of presenting a silent blank preview', async () => {
        const finalize = jest.fn();
        window.vegaEmbed.mockResolvedValue({
            view: {
                toSVG: jest.fn().mockResolvedValue('<svg viewBox="0 0 0 0"></svg>'),
                finalize,
            },
        });
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');

        await expect(renderDiagramSVG('vega-lite', '{"mark":"bar"}'))
            .rejects.toThrow('Vega-Lite produced an empty chart');
        expect(finalize).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-figaro-vega-render-target]')).toBeNull();
    });
});

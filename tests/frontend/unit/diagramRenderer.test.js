import fs from 'node:fs';
import v8 from 'node:v8';

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
        for (const token of [
            '--text-color', '--text-muted', '--border-color', '--border-light',
            '--panel-bg', '--hover-bg', '--active-bg',
        ]) {
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

    test('removes script links, event handlers and script elements from a rendered Mermaid SVG, including a cached one', async () => {
        const hostile = '<svg id="x"><style>#x{fill:red}</style><defs><symbol id="icon"><path d="M0 0"/></symbol></defs>'
            + '<a xlink:href="javascript:alert(1)" target="_blank"><g class="node" onclick="alert(2)"><text>Start</text></g></a>'
            + '<a href="&#106;ava&#9;script:alert(3)"><text>Encoded</text></a>'
            + '<a xlink:href="https://example.com/docs"><text>Docs</text></a><a href="notes/other.md"><text>Note</text></a>'
            + '<use href="#icon"/><image href="data:image/png;base64,iVBORw0KGgo="/><script>alert(4)</script>'
            + '<foreignObject><div><a href="data:text/html,x">data</a><img src="x.png" onerror="alert(5)"></div></foreignObject></svg>';
        window.mermaid.render.mockResolvedValue({ svg: hostile });
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');

        for (const mount of ['first', 'cached']) {
            const svg = await renderDiagramSVG('mermaid', 'flowchart TD\n  A --> B\n  click A href "javascript:alert(1)"', mount);
            expect(svg).not.toMatch(/javascript:|alert\(|onclick|onerror|<script/i);
            const host = document.createElement('div');
            host.innerHTML = svg;
            const addresses = [...host.querySelectorAll('*')].flatMap(element => [...element.attributes]
                .filter(attribute => /^(?:xlink:)?(?:href|src)$/.test(attribute.name)).map(attribute => attribute.value));
            expect(addresses).toEqual([
                'https://example.com/docs', 'notes/other.md', '#icon', 'data:image/png;base64,iVBORw0KGgo=', 'x.png',
            ]);
            expect(host.textContent).toContain('StartEncodedDocsNote');
            expect(host.querySelector('a').getAttribute('target')).toBe('_blank');
        }
        expect(window.mermaid.render).toHaveBeenCalledTimes(1);
    });

    test('returns a Mermaid SVG without script links exactly as rendered', async () => {
        const rendered = '<svg id="keep"><defs><symbol id="keep-icon"><path d="M0 0"></path></symbol></defs><use href="#keep-icon"/>'
            + '<a xlink:href="https://example.com"><text>Docs &amp; more</text></a><foreignObject><div>line<br/>break</div></foreignObject></svg>';
        window.mermaid.render.mockImplementation(async id => ({ svg: rendered.replaceAll('keep', id) }));
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');

        const svg = await renderDiagramSVG('mermaid', 'flowchart TD\n  A --> B', 'exact');
        expect(svg).toBe(rendered.replaceAll('keep', window.mermaid.render.mock.calls[0][0]));
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

    test('themes an unstyled application Mermaid render without changing the authored print render', async () => {
        window.mermaid.render.mockImplementation(async (id, source) => ({
            svg: `<svg id="${id}" data-source="${encodeURIComponent(source)}"></svg>`,
        }));
        document.documentElement.style.setProperty('--text-color', '#f5eee4');
        document.documentElement.style.setProperty('--text-muted', '#b9ac9e');
        document.documentElement.style.setProperty('--border-light', '#62594f');
        document.documentElement.style.setProperty('--panel-bg', '#24211d');
        document.documentElement.style.setProperty('--hover-bg', '#29251f');
        document.documentElement.style.setProperty('--active-bg', '#3b2924');
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        const source = 'flowchart TD\n  A --> B';

        await renderDiagramSVG('mermaid', source, 'live', { appearance: 'application' });
        await renderDiagramSVG('mermaid', source, 'print');

        expect(window.mermaid.render).toHaveBeenCalledTimes(2);
        expect(window.mermaid.render.mock.calls[0][1]).toContain("theme: 'base'");
        expect(window.mermaid.render.mock.calls[0][1]).toContain("primaryTextColor: '#f5eee4'");
        expect(window.mermaid.render.mock.calls[0][1]).toContain("lineColor: '#b9ac9e'");
        expect(window.mermaid.render.mock.calls[1][1]).toBe(source);
    });

    test('preserves explicit Mermaid styling in the application appearance', async () => {
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        const source = [
            '---',
            'config:',
            "  theme: 'neutral'",
            '---',
            'flowchart TD',
            '  A --> B',
        ].join('\n');

        await renderDiagramSVG('mermaid', source, 'live', { appearance: 'application' });

        expect(window.mermaid.render).toHaveBeenCalledWith(expect.any(String), source);
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

    test.each(['vega', 'vega-lite'])('revisiting unchanged %s output reuses rendering with unique local SVG references', async language => {
        window.vegaEmbed.mockResolvedValue({ view: {
            toSVG: jest.fn().mockResolvedValue('<svg viewBox="0 0 40 30"><defs><clipPath id="clip1"><rect width="40" height="30"/></clipPath></defs><g clip-path="url(#clip1)"><text>clip1 label</text></g><use href="#clip1"/></svg>'),
            finalize: jest.fn(),
        } });
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        const source = JSON.stringify({ width: 'container', data: { values: [1, 2] } });
        const [first, second] = await Promise.all([
            renderDiagramSVG(language, source, 'first', { containerWidth: 700 }),
            renderDiagramSVG(language, source, 'second', { containerWidth: 700 }),
        ]);
        await renderDiagramSVG(language, source, 'revisit', { containerWidth: 700 });
        expect(window.vegaEmbed).toHaveBeenCalledTimes(1);
        const host = document.createElement('div'); host.innerHTML = first + second;
        const ids = [...host.querySelectorAll('[id]')].map(node => node.id);
        expect(new Set(ids).size).toBe(2);
        for (const svg of host.querySelectorAll('svg')) {
            const id = svg.querySelector('[id]').id;
            expect(svg.querySelector('g').getAttribute('clip-path')).toBe(`url(#${id})`);
            expect(svg.querySelector('use').getAttribute('href')).toBe(`#${id}`);
            expect(svg.querySelector('text').textContent).toBe('clip1 label');
        }
        await renderDiagramSVG(language, source, 'resized', { containerWidth: 800 });
        await renderDiagramSVG(language, source.replace('[1,2]', '[1,3]'), 'edited', { containerWidth: 800 });
        expect(window.vegaEmbed).toHaveBeenCalledTimes(3);
        expect(window.vegaEmbed.mock.calls[1][0].style.width).toBe('800px');
    });

    test('Vega appearance and loaded font changes invalidate output; external data is always refreshed', async () => {
        const fonts = new EventTarget(); fonts.status = 'loaded';
        const previous = Object.getOwnPropertyDescriptor(document, 'fonts');
        Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
        window.vegaEmbed.mockResolvedValue({ view: { toSVG: async () => '<svg viewBox="0 0 40 30"/>', finalize() {} } });
        try {
            const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
            const render = () => renderDiagramSVG('vega-lite', '{"mark":"bar"}', 'test', { appearance: 'application' });
            await render(); await render(); expect(window.vegaEmbed).toHaveBeenCalledTimes(1);
            document.documentElement.style.setProperty('--text-color', '#00ff00');
            await render(); expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
            fonts.dispatchEvent(new Event('loadingdone'));
            await render(); expect(window.vegaEmbed).toHaveBeenCalledTimes(3);
            await renderDiagramSVG('vega-lite', '{"data":{"url":"data.csv"}}');
            await renderDiagramSVG('vega-lite', '{"data":{"url":"data.csv"}}');
            expect(window.vegaEmbed).toHaveBeenCalledTimes(5);
        } finally {
            if (previous) Object.defineProperty(document, 'fonts', previous); else delete document.fonts;
        }
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

describe('chart data, image and link sources through the vendored Vega engines', () => {
    const bars = { mark: 'bar', encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } } };
    const imageMark = url => ({
        width: 80, height: 60,
        marks: [{ type: 'image', encode: { enter: {
            url: { value: url }, x: { value: 0 }, y: { value: 0 }, width: { value: 40 }, height: { value: 30 },
        } } }],
    });
    let vegaEmbed;
    let imageSources;
    let canvasContext;
    let restore;

    beforeAll(() => {
        // jsdom has no canvas; Vega probes for one while loading and then estimates text.
        canvasContext = jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
        // The real browser bundles, so the test observes what Vega itself asks its loader for.
        const load = (file, dependencies) => {
            const module = { exports: {} };
            new Function('exports', 'module', 'require', 'structuredClone', fs.readFileSync(file, 'utf8'))(
                module.exports, module, name => {
                    if (!dependencies[name]) throw new Error(`Unexpected Vega dependency: ${name}`);
                    return dependencies[name];
                }, value => v8.deserialize(v8.serialize(value)));
            return module.exports;
        };
        const vega = load('frontend/vendored/vega/vega.min.js', {});
        const vegaLite = load('frontend/vendored/vega/vega-lite.min.js', { vega });
        vegaEmbed = load('frontend/vendored/vega/vega-embed.min.js', { vega, 'vega-lite': vegaLite });
    });

    afterAll(() => canvasContext.mockRestore());

    beforeEach(() => {
        jest.resetModules();
        window.vegaEmbed = vegaEmbed;
        imageSources = [];
        const previousFetch = global.fetch;
        global.fetch = jest.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'a,b\nx,3\ny,5\n' }));
        // jsdom never loads an image, and Vega waits for onload.
        const source = jest.spyOn(window.HTMLImageElement.prototype, 'src', 'set').mockImplementation(function setSource(value) {
            imageSources.push(String(value));
            this.setAttribute('src', value);
            queueMicrotask(() => this.onload?.());
        });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        restore = () => {
            source.mockRestore(); warn.mockRestore();
            if (previousFetch) global.fetch = previousFetch; else delete global.fetch;
        };
    });

    afterEach(() => {
        restore();
        document.querySelectorAll('[data-figaro-vega-render-target]').forEach(target => target.remove());
        delete window.vegaEmbed;
    });

    const render = async (language, spec) => {
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        return renderDiagramSVG(language, JSON.stringify(spec), 'resource-test');
    };

    test.each([
        ['a remote data.url', 'vega-lite', { ...bars, data: { url: 'https://example.com/data.csv' } }],
        ['a protocol-relative data.url', 'vega-lite', { ...bars, data: { url: '//example.com/vault/data.csv' } }],
        ['a file: data.url', 'vega-lite', { ...bars, data: { url: 'file:///etc/passwd' } }],
        ['application files outside the vault', 'vega-lite', { ...bars, data: { url: '/wails/runtime' } }],
        ['a remote Vega dataset', 'vega', { width: 80, height: 60, data: [{ name: 'table', url: 'https://example.com/data.json' }] }],
        ['a remote image mark', 'vega', imageMark('https://example.com/pixel.png')],
        ['a remote embed configuration', 'vega-lite', { ...bars, data: { values: [{ a: 'x', b: 1 }] }, usermeta: { embedOptions: { config: 'https://example.com/config.json' } } }],
    ])('%s performs no fetch or image request and puts the chart in its error state', async (_name, language, spec) => {
        await expect(render(language, spec)).rejects.toThrow('Charts only load data and images from this vault');
        expect(global.fetch).not.toHaveBeenCalled();
        expect(imageSources).toEqual([]);
        expect(document.querySelector('[data-figaro-vega-render-target]')).toBeNull();
    });

    test('loader options carried by a spec cannot replace the guard or point relative data at another host', async () => {
        const spec = {
            ...bars, data: { url: 'data.csv' },
            usermeta: { embedOptions: { loader: { baseURL: 'https://example.com/', load: 'spec', sanitize: null, http: { credentials: 'include' } } } },
        };
        await expect(render('vega-lite', spec)).rejects.toThrow();
        expect(global.fetch).not.toHaveBeenCalled();
        expect(imageSources).toEqual([]);
    });

    test('a vault data file is read from the application origin and drawn', async () => {
        const svg = await render('vega-lite', { ...bars, data: { url: '/vault/data/sales.csv' } });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('/vault/data/sales.csv', { credentials: 'same-origin' });
        const host = document.createElement('div');
        host.innerHTML = svg;
        expect(host.querySelectorAll('.mark-rect path')).toHaveLength(2);
    });

    test('vault and inlined images are kept as written', async () => {
        const pixel = 'data:image/png;base64,iVBORw0KGgo=';
        // Vega writes the address the browser resolved for the loaded image.
        expect(await render('vega', imageMark('/vault/attachments/logo.png')))
            .toContain(`href="${new URL('/vault/attachments/logo.png', document.baseURI).href}"`);
        expect(await render('vega', imageMark(pixel))).toContain(`href="${pixel}"`);
        expect(imageSources).toEqual(expect.arrayContaining(['/vault/attachments/logo.png', pixel]));
        expect(new Set(imageSources).size).toBe(2);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('a mark keeps a web link but never a script or local-file link', async () => {
        const svg = await render('vega-lite', {
            ...bars,
            data: { values: [
                { a: 'web', b: 1, link: 'https://example.com/report' },
                { a: 'script', b: 2, link: 'javascript:alert(1)' },
                { a: 'file', b: 3, link: 'file:///etc/passwd' },
                { a: 'app', b: 4, link: '/wails/runtime' },
            ] },
            encoding: { ...bars.encoding, href: { field: 'link', type: 'nominal' } },
        });
        const host = document.createElement('div');
        host.innerHTML = svg;
        const addresses = [...host.querySelectorAll('*')].flatMap(element => [...element.attributes]
            .filter(attribute => /^(?:xlink:)?href$/.test(attribute.name)).map(attribute => attribute.value));
        expect(addresses).toEqual(['https://example.com/report']);
        expect(host.querySelectorAll('.mark-rect path')).toHaveLength(4);
    });
});

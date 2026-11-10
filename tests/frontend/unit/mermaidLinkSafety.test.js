import fs from 'node:fs';
import v8 from 'node:v8';
import { diagramData } from '../../../frontend/vendored/mermaid-examples/index.js';

/**
 * Runs the vendored Mermaid bundle itself, because what a `click` directive
 * writes into the drawing is decided inside Mermaid by its security level, and
 * Figaro then removes script links from that output. jsdom has no SVG layout,
 * so text boxes are estimated; painted geometry is owned by
 * tests/e2e/mermaidRenderer.spec.js.
 */
describe('Mermaid click directives and icons through the vendored engine', () => {
    const added = [];
    const define = (target, name, value) => {
        if (name in target) return;
        Object.defineProperty(target, name, { configurable: true, writable: true, value });
        added.push([target, name]);
    };

    beforeAll(() => {
        const box = element => ({ x: 0, y: 0, width: Math.max(8, (element.textContent || '').length * 8), height: 18 });
        define(globalThis, 'structuredClone', value => v8.deserialize(v8.serialize(value)));
        define(window.SVGElement.prototype, 'getBBox', function getBBox() { return box(this); });
        define(window.SVGElement.prototype, 'getComputedTextLength', function getComputedTextLength() { return box(this).width; });
        define(window.Element.prototype, 'getBoundingClientRect', function getBoundingClientRect() {
            const { width, height } = box(this);
            return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
        });
        // A classic script's top-level `var` is a global; run inside a function, the
        // bundle's last statement has to read that namespace as the local it is here.
        const bundle = fs.readFileSync('frontend/vendored/mermaid/mermaid.min.js', 'utf8');
        const published = 'globalThis.__esbuild_esm_mermaid_nm["mermaid"]';
        expect(bundle).toContain(published);
        new Function(bundle.replace(published, '__esbuild_esm_mermaid_nm["mermaid"]'))();
    });

    afterAll(() => {
        for (const [target, name] of added) delete target[name];
        delete globalThis.mermaid;
    });

    beforeEach(() => {
        jest.resetModules();
        window.figaroMermaidCallback = jest.fn();
    });

    afterEach(() => {
        delete window.figaroMermaidCallback;
        document.body.innerHTML = '';
    });

    const render = async source => {
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        const host = document.createElement('div');
        document.body.append(host);
        host.innerHTML = await renderDiagramSVG('mermaid', source, 'link-safety');
        return host;
    };
    const addresses = host => [...host.querySelectorAll('*')].flatMap(element => [...element.attributes]
        .filter(attribute => /^(?:xlink:)?href$/.test(attribute.name)).map(attribute => attribute.value));
    const external = host => addresses(host).filter(address => !address.startsWith('#'));

    test('a flowchart click href with a javascript: address renders without any script URL', async () => {
        const host = await render([
            'flowchart TD',
            '  A[Start] --> B[Docs]',
            '  B --> C[Padded]',
            '  click A href "javascript:alert(1)" "Run"',
            '  click B href "https://example.com/docs" "Open"',
            '  click C href " JaVaScRiPt:alert(2)" "Run"',
        ].join('\n'));

        expect(host.querySelector('svg')).not.toBeNull();
        expect(host.textContent).toContain('Start');
        expect(host.innerHTML).not.toMatch(/javascript:/i);
        expect(external(host)).toEqual(['https://example.com/docs']);
        // The unlinked nodes are still drawn.
        expect(host.querySelectorAll('.node')).toHaveLength(3);
    });

    test('a class diagram link with a script address is unlinked too', async () => {
        const host = await render([
            'classDiagram',
            '  class Shape',
            '  class Circle',
            '  Shape <|-- Circle',
            '  link Shape "javascript:alert(1)" "Run"',
            '  link Circle "https://example.com/circle" "Open"',
        ].join('\n'));

        expect(host.innerHTML).not.toMatch(/javascript:/i);
        expect(external(host)).toEqual(['https://example.com/circle']);
        expect(host.textContent).toContain('Shape');
    });

    test('a click callback is neither bound nor written into the drawing', async () => {
        const host = await render([
            'flowchart TD',
            '  A[Start] --> B[End]',
            '  click A call figaroMermaidCallback()',
            '  click B figaroMermaidCallback "Tooltip"',
        ].join('\n'));

        for (const node of host.querySelectorAll('.node')) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(window.figaroMermaidCallback).not.toHaveBeenCalled();
        const handlers = [...host.querySelectorAll('*')].flatMap(element => [...element.attributes]
            .filter(attribute => /^on/i.test(attribute.name)));
        expect(handlers).toEqual([]);
        expect(host.querySelector('script')).toBeNull();
    });

    // DOMPurify inside the bundle must hand each label to Figaro's policy.
    // What the browser fetches, and that vault images still draw, is owned by
    // tests/e2e/mermaidRenderer.spec.js: jsdom never finishes loading an image.
    test.each([
        ['a flowchart', "flowchart LR\n  A[\"<img src='https://example.com/t.png'> Start\"] --> B"],
        ['a class diagram', "classDiagram\n  class A[\"<img src='https://example.com/t.png'>\"]"],
        ['a state diagram', "stateDiagram-v2\n  s1: <span style='background:url(//example.com/t.png)'>x</span>"],
    ])('refuses %s whose label HTML loads an image from outside the vault', async (_name, source) => {
        const { renderDiagramSVG } = await import('../frontend/js/diagramRenderer.js');
        await expect(renderDiagramSVG('mermaid', source, 'outside')).rejects.toMatchObject({ code: 'mermaid-resource-refused' });
        expect(document.body.innerHTML).not.toContain('example.com');
    });

    // The reason Mermaid is not run at its `strict` level: that level's
    // sanitizer removes every <use>, and with them these icons.
    test.each(['Annotations', 'File-Type Icons via Config Maps'])('the bundled tree-view template “%s” keeps its file and folder icons', async title => {
        const template = diagramData.find(diagram => diagram.id === 'treeView').examples.find(example => example.title === title);
        const host = await render(template.code);

        const icons = [...host.querySelectorAll('use')].map(icon => icon.getAttribute('href') || icon.getAttribute('xlink:href'));
        expect(icons.length).toBeGreaterThan(0);
        for (const icon of icons) {
            expect(icon).toMatch(/^#/);
            expect(host.querySelector(`[id="${icon.slice(1)}"]`)).not.toBeNull();
        }
    });
});

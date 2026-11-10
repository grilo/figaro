import { expect, test } from '@playwright/test';

// Browser-only boundary: Mermaid needs real SVG text/layout measurements, and
// accepting themeVariables during parsing does not prove they affect any mark.
test('renders all Mermaid templates and verifies every offered color against painted SVG', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    const result = await page.evaluate(async () => {
        const { mermaidTemplates } = await import('/js/mermaidEditor.js');
        const { renderDiagramSVG, inspectMermaidSource } = await import('/js/diagramRenderer.js');
        const { mermaidStyleDescriptor, mermaidSourceWithStyleConfig, mermaidTargetVariablePatch,
            mermaidThemePresetPatch, mermaidStyleConfigState, mermaidFlowchartNodes,
        } = await import('/js/core/mermaidStyleEditorModel.js');
        const host = document.createElement('div');
        document.body.append(host);
        const rows = [];
        const failures = [];
        const paint = async source => {
            host.innerHTML = await renderDiagramSVG('mermaid', source, 'catalogue-contract');
            const svg = host.querySelector('svg');
            if (!svg || svg.getBBox().width <= 0 || svg.getBBox().height <= 0) throw new Error('Empty SVG');
            return [...svg.querySelectorAll('path, rect, circle, ellipse, polygon, line, text')].filter(element => {
                const style = getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && [style.fill, style.stroke].includes('rgb(18, 171, 52)');
            }).length;
        };
        for (const diagram of mermaidTemplates) {
            const row = { id: diagram.id, templates: 0, presetRenders: 0, targets: {} };
            for (const example of diagram.examples) {
                try {
                    const inspection = await inspectMermaidSource(example.code);
                    await paint(example.code);
                    row.templates++;
                    for (const preset of ['document', 'neutral', 'accent', 'dark']) {
                        const patch = preset === 'dark' ? { theme: 'dark' } : mermaidThemePresetPatch(preset);
                        const styled = mermaidSourceWithStyleConfig(example.code, patch);
                        if (styled.reason) throw new Error(styled.reason);
                        await paint(styled.source);
                        row.presetRenders++;
                    }
                    for (const target of mermaidStyleDescriptor(diagram.id, inspection).targets) {
                        const styled = mermaidSourceWithStyleConfig(example.code, {
                            variables: mermaidTargetVariablePatch(target, '#12ab34',
                                mermaidStyleConfigState(example.code), inspection.effectiveVariables),
                        });
                        if (!styled.changed || styled.reason) throw new Error(`No editable setting for ${target.id}`);
                        row.targets[target.id] = Boolean(await paint(styled.source)) || row.targets[target.id] || false;
                    }
                } catch (error) { failures.push(`${diagram.id}/${example.title}: ${error.message}`); }
            }
            for (const [target, painted] of Object.entries(row.targets)) {
                if (!painted) failures.push(`${diagram.id}/${target}: accepted color never painted a mark`);
            }
            rows.push(row);
        }
        const identities = [];
        for (const code of ['flowchart LR\n A --> B --> C',
            'flowchart TD\n A[fa:fa-car Car] --> B\n C',
            'flowchart TD\n A --> B\nstyle A fill:#ef4444\nclassDef blue fill:#3b82f6\nclass B blue']) {
            const inspection = await inspectMermaidSource(code);
            const nodes = mermaidFlowchartNodes(code, inspection);
            await paint(code);
            identities.push({ids: nodes.map(node => node.id), fills: nodes.map(node => node.fill),
                rendered: host.querySelectorAll('g.node').length});
        }
        host.remove();
        return { rows, failures, identities };
    });
    await testInfo.attach('Mermaid renderer matrix', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.failures).toEqual([]);
    expect(result.rows).toHaveLength(32);
    expect(result.rows.reduce((count, row) => count + row.templates, 0)).toBe(76);
    expect(result.rows.reduce((count, row) => count + row.presetRenders, 0)).toBe(304);
    expect(result.identities).toEqual([
        {ids:['A','B','C'], fills:['','',''], rendered:3},
        {ids:['A','B','C'], fills:['','',''], rendered:3},
        {ids:['A','B'], fills:['#ef4444','#3b82f6'], rendered:2},
    ]);
});

// Browser-only boundary: Mermaid draws labels, image shapes and stylesheets
// into the live page while it measures them, so only a real browser shows
// whether rendering a note's diagram contacts the network.
test('renders Mermaid images only from the vault and never fetches a web address while drawing', async ({ page, baseURL }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const outside = [];
    const vault = [];
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(baseURL).origin) {
            outside.push(url.href);
            return route.abort();
        }
        if (!url.pathname.startsWith('/vault/')) return route.continue();
        vault.push(url.pathname);
        return route.fulfill({ contentType: 'image/png', body: png });
    });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    const label = html => `flowchart LR\n A["${html} label"] --> B`;
    const refused = {
        'label image': label("<img src='https://ex.test/label.png'>"),
        'protocol-relative image': label("<img src='//ex.test/relative.png'>"),
        'entity-encoded image': label("<img src='#104;ttps://ex.test/entity.png'>"),
        'srcset': label("<img srcset='https://ex.test/srcset.png 1x'>"),
        'svg image': label("<svg width='9' height='9'><image href='https://ex.test/svg-image.png' width='9' height='9'/></svg>"),
        'style attribute': label("<span style='background:url(https://ex.test/style.png)'>x</span>"),
        'video poster': label("<video poster='https://ex.test/poster.png' src='https://ex.test/video.mp4'></video>"),
        'input image': label("<input type='image' src='https://ex.test/input.png'>"),
        'table background': label("<table background='https://ex.test/table.png'><tr><td>x</td></tr></table>"),
        'picture source': label("<picture><source srcset='https://ex.test/picture.png'><img src='/vault/a.png'></picture>"),
        'audio': label("<audio src='https://ex.test/audio.mp3' preload='auto'></audio>"),
        'class label': "classDiagram\n class A[\"<img src='https://ex.test/class.png'>\"]",
        'state label': "stateDiagram-v2\n s1: <img src='https://ex.test/state.png'>",
        'mindmap label': "mindmap\n root[\"<img src='https://ex.test/mindmap.png'>\"]",
        'kanban label': "kanban\n col[\"<img src='https://ex.test/kanban.png'>\"]\n  t1[\"x\"]",
        'block label': "block-beta\n a[\"<img src='https://ex.test/block.png'>\"]",
        'image shape': 'flowchart LR\n A@{ img: "https://ex.test/shape.png", label: "x", pos: "t", w: 60, h: 60 }',
        'state classDef': 'stateDiagram-v2\n s1 --> s2\n classDef x background-image:url(//ex.test/classdef.png)\n class s1 x',
        'block style': 'block-beta\n a["x"]\n style a background-image:url(//ex.test/block-style.png)',
        'C4 element style': 'C4Context\n Person(a, "A")\n UpdateElementStyle(a, $bgColor="url(//ex.test/c4.png)")',
        'directive themeCSS': '%%{init: {"themeCSS": "span { background-image: url(https://ex.test/theme.png) }"}}%%\nflowchart LR\n A[Hi]',
        'escaped themeCSS': '%%{init: {"themeCSS": "span { background-image: \\u0075rl(https://ex.test/escaped.png) }"}}%%\nflowchart LR\n A[Hi]',
        'frontmatter themeCSS': '---\nconfig:\n  themeCSS: "span { background-image: url(https://ex.test/frontmatter.png) }"\n---\nflowchart LR\n A[Hi]',
        'font family': '%%{init: {"fontFamily": "x; background-image: url(https://ex.test/font.png)"}}%%\nflowchart LR\n A[Hi]',
        'themeCSS with a syntax error': '%%{init: {"themeCSS": "svg { background-image: url(https://ex.test/error.png) }"}}%%\nflowchart LR\n A -->',
    };
    const allowed = {
        'vault label image': label("<img src='/vault/label.png' width='20'> <b>bold</b> <i>it</i><br>next"),
        'vault image shape': 'flowchart LR\n A@{ img: "/vault/shape.png", label: "x", pos: "t", w: 60, h: 60 }',
        'inline image': label("<img src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='>"),
        'links': "flowchart LR\n A[\"<a href='https://ex.test/link'>web</a> <a href='mailto:a@ex.test'>mail</a>\"] --> B\n click B href \"https://ex.test/click\"",
    };
    const results = await page.evaluate(async ({ refused, allowed }) => {
        const { renderDiagramSVG } = await import('/js/diagramRenderer.js');
        const host = document.createElement('div');
        document.body.append(host);
        const outcome = {};
        for (const [name, source] of Object.entries({ ...refused, ...allowed })) {
            try {
                host.innerHTML = await renderDiagramSVG('mermaid', source, 'vault-only');
                await Promise.all([...host.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
                outcome[name] = { drawn: Boolean(host.querySelector('svg')), images: host.querySelectorAll('img, image').length,
                    text: host.textContent.replace(/\s+/g, ' ').trim(), links: [...host.querySelectorAll('a')]
                        .map(link => link.getAttribute('href') || link.getAttribute('xlink:href')) };
            } catch (error) {
                outcome[name] = { code: error.code, message: error.message };
            }
        }
        host.remove();
        return outcome;
    }, { refused, allowed });
    await page.waitForTimeout(250);

    expect(outside).toEqual([]);
    for (const name of Object.keys(refused)) {
        expect.soft(results[name], name).toMatchObject({ code: 'mermaid-resource-refused' });
    }
    expect(results['label image'].message).toContain('“https://ex.test/label.png”');
    expect(results['vault label image']).toMatchObject({ drawn: true, images: 1, text: expect.stringContaining('bold it') });
    expect(results['vault image shape']).toMatchObject({ drawn: true, images: 1 });
    expect(results['inline image']).toMatchObject({ drawn: true, images: 1 });
    expect(results.links).toMatchObject({ drawn: true, links: ['https://ex.test/link', 'mailto:a@ex.test', 'https://ex.test/click'] });
    expect([...new Set(vault)].sort()).toEqual(['/vault/label.png', '/vault/shape.png']);
});

import {
    MAX_MERMAID_SOURCE_LENGTH,
    cssResourceAddresses,
    mermaidConfigResourceRefusal,
    mermaidCssRefusal,
    mermaidMarkupResourceRefusal,
    mermaidResourceRefusal,
    mermaidResourceRefusalMessage,
    mermaidSourceResourceRefusal,
    mermaidSvgAttributeIsUnsafe,
    srcsetAddresses,
    planMermaidSourceRender,
    planVegaResourceAccess,
    vegaResourceRefusalMessage,
} from '../frontend/js/core/diagramSecurityModel.js';

describe('Mermaid pre-parse security policy', () => {
    test('allows ordinary diagrams through the existing Mermaid size ceiling', () => {
        expect(planMermaidSourceRender('flowchart TD\n  A --> B')).toEqual({
            action: 'render',
            reason: null,
            maxLength: MAX_MERMAID_SOURCE_LENGTH,
        });
        expect(planMermaidSourceRender('a'.repeat(MAX_MERMAID_SOURCE_LENGTH)).action).toBe('render');
    });

    test('preserves oversized source before Mermaid can parse its YAML frontmatter', () => {
        expect(planMermaidSourceRender('a'.repeat(MAX_MERMAID_SOURCE_LENGTH + 1))).toEqual({
            action: 'preserve-source',
            reason: 'source-too-large',
            maxLength: MAX_MERMAID_SOURCE_LENGTH,
        });
    });

    test.each([
        'config: !!omap\n- dangerous: value',
        'config: !<tag:yaml.org,2002:omap>\n- dangerous: value',
        'config: !<tag:yaml.org,2002:%6Fmap>\n- dangerous: value',
        'config: !safe!omap\n- dangerous: value',
    ])('rejects a YAML ordered-map tag in Mermaid frontmatter: %s', (frontmatter) => {
        const source = `---\n${frontmatter}\n---\nflowchart TD\n  A --> B`;

        expect(planMermaidSourceRender(source)).toEqual({
            action: 'preserve-source',
            reason: 'unsafe-yaml-ordered-map',
            maxLength: MAX_MERMAID_SOURCE_LENGTH,
        });
    });

    test('does not mistake ordinary diagram text for YAML frontmatter', () => {
        expect(planMermaidSourceRender('flowchart TD\n  A[!!omap documentation] --> B').action).toBe('render');
    });
});

describe('rendered Mermaid SVG attributes', () => {
    test('an event handler is unsafe on any element, whatever its value', () => {
        for (const name of ['onclick', 'ONLOAD', 'onmouseover', 'onbegin', 'onanimationend']) {
            expect(mermaidSvgAttributeIsUnsafe('g', name, '')).toBe(true);
        }
        for (const name of ['class', 'id', 'd', 'style', 'target', 'transform', 'opacity', 'orient', 'offset', 'data-on']) {
            expect(mermaidSvgAttributeIsUnsafe('g', name, 'javascript:alert(1)')).toBe(false);
        }
    });

    test.each(['href', 'xlink:href', 'XLINK:HREF', 'src', 'action', 'formaction'])('a script address in %s is unsafe however it is disguised', name => {
        for (const value of [
            'javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
            '\u0001javascript:alert(1)', 'javascript\u0000:alert(1)', 'vbscript:msgbox(1)', 'VBScript:x', '\ufeffjavascript:x',
        ]) {
            expect(mermaidSvgAttributeIsUnsafe('a', name, value)).toBe(true);
            expect(mermaidSvgAttributeIsUnsafe('image', name, value)).toBe(true);
        }
    });

    test('ordinary link, fragment and image addresses are kept', () => {
        for (const value of [
            'https://example.com/docs', 'http://example.com', 'mailto:someone@example.com', '#marker-1', 'notes/other.md',
            '../a%20b.md', '/vault/a.png', 'about:blank', '', 'javascript', 'java/script:x', 'x?next=javascript:alert(1)',
        ]) {
            expect(mermaidSvgAttributeIsUnsafe('a', 'href', value)).toBe(false);
            expect(mermaidSvgAttributeIsUnsafe('use', 'xlink:href', value)).toBe(false);
        }
        expect(mermaidSvgAttributeIsUnsafe('a', 'href', null)).toBe(false);
        expect(mermaidSvgAttributeIsUnsafe('a', 'href', undefined)).toBe(false);
    });

    test('a data: address is kept only where it is an image', () => {
        const pixel = 'data:image/png;base64,iVBORw0KGgo=';
        expect(mermaidSvgAttributeIsUnsafe('image', 'href', pixel)).toBe(false);
        expect(mermaidSvgAttributeIsUnsafe('IMAGE', 'xlink:href', pixel)).toBe(false);
        expect(mermaidSvgAttributeIsUnsafe('img', 'src', pixel)).toBe(false);
        for (const element of ['a', 'use', 'feImage', 'iframe', 'form', undefined]) {
            expect(mermaidSvgAttributeIsUnsafe(element, 'href', pixel)).toBe(true);
            expect(mermaidSvgAttributeIsUnsafe(element, 'href', ' DATA:text/html,<script>alert(1)</script>')).toBe(true);
        }
    });
});

describe('Vega resource policy', () => {
    // The desktop origins (wails://localhost, and http://wails.localhost on Windows) and the dev server.
    const bases = ['wails://localhost/', 'http://wails.localhost/index.html', 'http://127.0.0.1:34115/'];

    test.each(bases)('data and images load only from the vault route of %s', baseUrl => {
        for (const context of ['dataflow', 'image', undefined]) {
            const plan = uri => planVegaResourceAccess(uri, { context, baseUrl });
            expect(plan('/vault/data/sales.csv')).toEqual({ action: 'load', reason: null, url: '/vault/data/sales.csv' });
            expect(plan('vault/data/sales.csv').url).toBe('/vault/data/sales.csv');
            expect(plan('  /vault/a%20b.json?v=2  ').url).toBe('/vault/a%20b.json?v=2');
            expect(plan('/vault/notes/../data.csv').url).toBe('/vault/data.csv');
            expect(plan(new URL('/vault/data.csv', baseUrl).href).url).toBe('/vault/data.csv');
        }
    });

    test.each(bases)('nothing outside the vault route of %s is loaded', baseUrl => {
        const plan = (uri, context = 'dataflow') => planVegaResourceAccess(uri, { context, baseUrl });
        for (const uri of [
            'https://example.com/data.csv', 'http://example.com/vault/data.csv', '//example.com/vault/data.csv',
            'file:///etc/passwd', 'ftp://example.com/vault/x', 'blob:https://example.com/1', 'data:text/csv,a,b',
            'javascript:alert(1)', ' java\tscript:alert(1)',
        ]) {
            expect(plan(uri)).toEqual({ action: 'refuse', reason: 'remote', url: '' });
            expect(plan(uri, 'image').action).toBe('refuse');
        }
        for (const uri of [
            'data.csv', './data.csv', '/data.csv', '/vault', '/vault/', '/vaults/data.csv', '/js/app.js',
            '/wails/runtime', '/vault/../wails/runtime', '/vault/%2e%2e/wails/runtime', '/vault/./../index.html',
        ]) {
            expect(plan(uri)).toEqual({ action: 'refuse', reason: 'outside-vault', url: '' });
            expect(plan(uri, 'image').action).toBe('refuse');
        }
        for (const uri of ['', '   ', null, undefined, 42, {}, ['/vault/data.csv']]) {
            expect(plan(uri)).toEqual({ action: 'refuse', reason: 'invalid', url: '' });
        }
    });

    test('credentials, a missing base and a foreign host with the same scheme are refused', () => {
        expect(planVegaResourceAccess('http://user:secret@wails.localhost/vault/a.csv', { baseUrl: 'http://wails.localhost/' }).action).toBe('refuse');
        expect(planVegaResourceAccess('wails://elsewhere/vault/a.csv', { baseUrl: 'wails://localhost/' }).reason).toBe('remote');
        expect(planVegaResourceAccess('http://wails.localhost:8080/vault/a.csv', { baseUrl: 'http://wails.localhost/' }).reason).toBe('remote');
        expect(planVegaResourceAccess('/vault/a.csv', { baseUrl: '' }).reason).toBe('invalid');
        expect(planVegaResourceAccess('/vault/a.csv').reason).toBe('invalid');
        expect(planVegaResourceAccess('/vault/a.csv', { baseUrl: 'about:blank' }).action).toBe('refuse');
    });

    test('an image may also be inlined, but only as an image', () => {
        const baseUrl = 'wails://localhost/';
        const pixel = 'data:image/png;base64,iVBORw0KGgo=';
        expect(planVegaResourceAccess(pixel, { context: 'image', baseUrl })).toEqual({ action: 'load', reason: null, url: pixel });
        expect(planVegaResourceAccess('DATA:IMAGE/SVG+XML,%3Csvg/%3E', { context: 'image', baseUrl }).action).toBe('load');
        expect(planVegaResourceAccess('data:text/html,<script>1</script>', { context: 'image', baseUrl }).action).toBe('refuse');
        expect(planVegaResourceAccess(pixel, { context: 'dataflow', baseUrl }).action).toBe('refuse');
    });

    test('a hyperlink is kept only as an absolute web or mail address', () => {
        const plan = uri => planVegaResourceAccess(uri, { context: 'href', baseUrl: 'wails://localhost/' });
        expect(plan('https://example.com/a?b=1#c')).toEqual({ action: 'link', reason: null, url: 'https://example.com/a?b=1#c' });
        expect(plan('http://example.com').url).toBe('http://example.com/');
        expect(plan('mailto:someone@example.com').url).toBe('mailto:someone@example.com');
        for (const uri of [
            'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\nscript:alert(1)', 'vbscript:msgbox(1)',
            'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'wails://localhost/vault/a.md',
            '/vault/a.md', 'notes/a.md', '#section', '//example.com/a', '',
        ]) {
            expect(plan(uri).action).toBe('refuse');
        }
    });

    test('the refusal message names the source, shortened, and where files may come from', () => {
        expect(vegaResourceRefusalMessage('https://example.com/data.csv')).toBe(
            'This chart asks for “https://example.com/data.csv”. Charts only load data and images from this vault, '
            + 'never from the network or elsewhere on this computer. Use a /vault/… path.');
        const long = vegaResourceRefusalMessage(`https://example.com/${'a'.repeat(200)}`);
        expect(long).toContain('…”');
        expect(long.length).toBeLessThan(260);
        expect(vegaResourceRefusalMessage(null)).toContain('an empty address');
    });
});

describe('Mermaid vault-only resource policy', () => {
    const baseUrl = 'wails://wails.localhost/';
    const page = { baseUrl };

    test('reads every address CSS would fetch, decoding escapes as a browser does', () => {
        const css = '@import "theme.css"; /* url(https://ignored.example/c.png) */'
            + ' a{background:\\75 rl( //example.com/a.png )} b{background:image-set(url(/vault/b.png) 1x, \'https://example.com/b.png\' 2x)}'
            + ' c{background:url("/vault/c\\"d.png")} @font-face{src:url(https://example.com/f.woff2)}';
        expect(cssResourceAddresses(css)).toEqual([
            { address: 'theme.css', kind: 'import' },
            { address: '//example.com/a.png', kind: 'image' },
            { address: '/vault/b.png', kind: 'image' },
            { address: 'https://example.com/b.png', kind: 'image' },
            { address: '/vault/c"d.png', kind: 'image' },
            { address: 'https://example.com/f.woff2', kind: 'image' },
        ]);
        // As plain text, a quote cannot hide a later url( from the search.
        expect(cssResourceAddresses('A["it\'s"]; classDef x fill:url(//example.com/x.png)', { strings: false }))
            .toEqual([{ address: '//example.com/x.png', kind: 'image' }]);
    });

    test.each([
        ['/vault/notes/a.png', null],
        ['data:image/png;base64,AAAA', null],
        ['#arrowhead', null],
        ['wails://wails.localhost/#arrowhead', null],
        ['', null],
        ['https://example.com/t.png', 'https://example.com/t.png'],
        ['//example.com/t.png', '//example.com/t.png'],
        ['file:///etc/passwd', 'file:///etc/passwd'],
        ['data:text/html,x', 'data:text/html,x'],
        ['a.png', 'a.png'],
        ['/vault/../app.js', '/vault/../app.js'],
    ])('a diagram may load %j only from the vault, inline or inside itself', (address, refused) => {
        expect(mermaidResourceRefusal(address, page)).toBe(refused);
    });

    test('judges CSS by every address it loads and never allows an @import', () => {
        expect(mermaidCssRefusal('a{fill:url(#m);background:url(/vault/a.png)}', page)).toBeNull();
        expect(mermaidCssRefusal('a{background:url(/vault/a.png),url(https://example.com/b.png)}', page)).toBe('https://example.com/b.png');
        expect(mermaidCssRefusal('@import url(/vault/theme.css);', page)).toBe('/vault/theme.css');
        expect(mermaidCssRefusal('@import;', page)).toBe('@import');
    });

    test('treats image and style attributes as loads and links as navigation', () => {
        const judge = (element, attribute, value) => mermaidMarkupResourceRefusal(element, attribute, value, page);
        expect(judge('img', 'src', 'https://example.com/a.png')).toBe('https://example.com/a.png');
        expect(judge('img', 'src', '/vault/a.png')).toBeNull();
        expect(judge('img', 'srcset', '/vault/a.png 1x, https://example.com/b.png 2x')).toBe('https://example.com/b.png');
        expect(judge('video', 'poster', '//example.com/p.png')).toBe('//example.com/p.png');
        expect(judge('td', 'background', 'https://example.com/t.png')).toBe('https://example.com/t.png');
        expect(judge('image', 'href', 'https://example.com/i.png')).toBe('https://example.com/i.png');
        expect(judge('use', 'xlink:href', '#icon-folder')).toBeNull();
        expect(judge('span', 'style', 'color:red;background:url(//example.com/s.png)')).toBe('//example.com/s.png');
        expect(judge('path', 'marker-end', 'url(#arrow)')).toBeNull();
        expect(judge('a', 'href', 'https://example.com/docs')).toBeNull();
        expect(judge('span', 'title', 'url(https://example.com/x)')).toBeNull();
        expect(srcsetAddresses('a.png 1x, data:image/png;base64,AA,BB 2x,c.png')).toEqual(['a.png', 'data:image/png;base64,AA,BB', 'c.png']);
    });

    test('searches a whole diagram source only for CSS addresses that leave the application', () => {
        expect(mermaidSourceResourceRefusal('stateDiagram-v2\n classDef x background:url(//example.com/c.png)', page))
            .toBe('//example.com/c.png');
        expect(mermaidSourceResourceRefusal('C4Context\n UpdateElementStyle(a, $bgColor="url(https://example.com/c4.png)")', page))
            .toBe('https://example.com/c4.png');
        // Text that merely mentions url( with a local address is left to the exact checks.
        expect(mermaidSourceResourceRefusal('flowchart LR\n A["new URL(req.url)"] --> B["url(#x)"]', page)).toBeNull();
        expect(mermaidSourceResourceRefusal('flowchart LR\n A["url(data:image/png;base64,AA)"]', page)).toBeNull();
    });

    test('checks every string of a parsed diagram configuration as CSS', () => {
        expect(mermaidConfigResourceRefusal({ theme: 'base', themeVariables: { primaryColor: '#fff' } }, page)).toBeNull();
        expect(mermaidConfigResourceRefusal({ themeCSS: 'span{background:url(https://example.com/t.png)}' }, page))
            .toBe('https://example.com/t.png');
        expect(mermaidConfigResourceRefusal({ sequence: { actorFontFamily: 'x;background:url(//example.com/f.png)' } }, page))
            .toBe('//example.com/f.png');
        expect(mermaidConfigResourceRefusal(undefined, page)).toBeNull();
    });

    test('names the refused address in the diagram error', () => {
        expect(mermaidResourceRefusalMessage('https://example.com/t.png')).toBe('This diagram asks for “https://example.com/t.png”. '
            + 'Diagrams only load images from this vault, never from the network or elsewhere on this computer. Use a /vault/… path.');
    });
});

import { expect, test } from '@playwright/test';

function fence(language, source) {
    const marker = String.fromCharCode(96).repeat(3);
    return marker + language + '\n' + source + '\n' + marker;
}

test('renders printable cover, TOC, Mermaid, Vega, and Vega-Lite with the vendored browser libraries', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() =>
        typeof window.markdownit === 'function' &&
        typeof window.mermaid?.render === 'function' &&
        typeof window.vegaEmbed === 'function'
    );

    const source = [
        '---',
        'cover-page: true',
        'title: Browser PDF export',
        'author: Figaro test suite',
        'date: 2026-07-12',
        'toc-depth: 2',
        '---',
        '# Introduction',
        '',
        fence('mermaid', 'flowchart TD\n  Start --> Finish'),
        '',
        '## Charts',
        '',
        fence('vega', '{"$schema":"https://vega.github.io/schema/vega/v5.json","width":80,"height":40,"data":[{"name":"table","values":[{"x":10,"y":20}]}],"marks":[{"type":"rect","from":{"data":"table"},"encode":{"enter":{"x":{"field":"x"},"y":{"field":"y"},"width":{"value":20},"height":{"value":10},"fill":{"value":"steelblue"}}}}]}'),
        '',
        fence('vega-lite', '{"$schema":"https://vega.github.io/schema/vega-lite/v5.json","width":80,"height":40,"data":{"values":[{"category":"A","amount":3}]},"mark":"bar","encoding":{"x":{"field":"category","type":"nominal"},"y":{"field":"amount","type":"quantitative"}}}'),
    ].join('\n');

    const result = await page.evaluate(async (markdown) => {
        const module = await import('/js/pdfExport.js');
        const html = await module.renderPrintableMarkdownWithDiagrams(markdown, 'Fallback');
        const printable = new DOMParser().parseFromString(html, 'text/html');
        return {
            covers: printable.querySelectorAll('.figaro-print-cover').length,
            coverTitle: printable.querySelector('.figaro-print-cover h1')?.textContent,
            coverMetadata: printable.querySelector('.figaro-print-cover-meta')?.textContent,
            pageBreaks: printable.querySelectorAll('.figaro-print-page-break').length,
            tocHrefs: Array.from(printable.querySelectorAll('.figaro-print-toc a')).map(link => link.getAttribute('href')),
            diagramLanguages: Array.from(printable.querySelectorAll('.figaro-print-diagram')).map(element => element.dataset.diagramLanguage),
            renderedSVGs: printable.querySelectorAll('.figaro-print-diagram svg').length,
            remainingDiagramFences: printable.querySelectorAll('pre > code.language-mermaid, pre > code.language-vega, pre > code.language-vega-lite').length,
        };
    }, source);

    expect(result.covers).toBe(1);
    expect(result.coverTitle).toBe('Browser PDF export');
    expect(result.coverMetadata).toContain('Figaro test suite');
    expect(result.coverMetadata).toContain('2026-07-12');
    expect(result.pageBreaks).toBe(2);
    expect(result.tocHrefs).toEqual(['#introduction', '#charts']);
    expect(result.diagramLanguages).toEqual(['mermaid', 'vega', 'vega-lite']);
    expect(result.renderedSVGs).toBe(3);
    expect(result.remainingDiagramFences).toBe(0);
});

test('renders the selected vendored Markdown-It extensions with stable TOC targets', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() =>
        typeof window.markdownit === 'function' &&
        typeof window.katex?.renderToString === 'function'
    );

    const source = [
        '---',
        'toc-depth: 2',
        '---',
        '# Café Notes',
        '## Café Notes',
        '',
        'See [the first heading](#cafe-notes).',
        '',
        'H~2~O, x^2^, ==highlighted==, and $E=mc^2$.',
        '',
        '- [ ] Open task',
        '- [x] Finished task',
        '',
        'Footnotes remain distinct from superscript[^note].',
        '',
        '[^note]: Linked footnote destination.',
    ].join('\n');

    const result = await page.evaluate(async (markdown) => {
        const module = await import('/js/pdfExport.js');
        const html = module.renderPrintableMarkdown(markdown, 'Extensions');
        const printable = new DOMParser().parseFromString(html, 'text/html');
        const tocLinks = Array.from(printable.querySelectorAll('.figaro-print-toc a'));
        return {
            headings: Array.from(printable.querySelectorAll('h1, h2')).map(heading => heading.id).filter(Boolean),
            tocHrefs: tocLinks.map(link => link.getAttribute('href')),
            tocTargets: tocLinks.map(link => {
                const id = link.getAttribute('href').slice(1);
                const target = printable.getElementById(id);
                return target && { id: target.id, tag: target.tagName, text: target.textContent };
            }),
            documentLinkTarget: printable.getElementById(
                printable.querySelector('p > a[href="#cafe-notes"]')?.getAttribute('href').slice(1)
            )?.id,
            mark: printable.querySelector('mark')?.textContent,
            sub: printable.querySelector('sub')?.textContent,
            superscript: printable.querySelector('sup:not(.footnote-ref)')?.textContent,
            katex: printable.querySelectorAll('.katex').length,
            tasks: Array.from(printable.querySelectorAll('.figaro-print-task-checkbox')).map(input => ({
                checked: input.checked,
                disabled: input.disabled,
            })),
            footnoteReference: printable.querySelector('.footnote-ref > a:first-child')?.getAttribute('href'),
            footnoteDestination: printable.querySelector('.footnotes li')?.id,
            vendorBundleLoaded: performance.getEntriesByType('resource')
                .some(entry => entry.name.includes('/vendored/markdown-it-plugins/index.js')),
        };
    }, source);

    expect(result.headings).toEqual(['cafe-notes', 'cafe-notes-2']);
    expect(result.tocHrefs).toEqual(['#cafe-notes', '#cafe-notes-2']);
    expect(result.tocTargets).toEqual([
        { id: 'cafe-notes', tag: 'H1', text: 'Café Notes' },
        { id: 'cafe-notes-2', tag: 'H2', text: 'Café Notes' },
    ]);
    expect(result.documentLinkTarget).toBe('cafe-notes');
    expect(result.mark).toBe('highlighted');
    expect(result.sub).toBe('2');
    expect(result.superscript).toBe('2');
    expect(result.katex).toBeGreaterThan(0);
    expect(result.tasks).toEqual([
        { checked: false, disabled: true },
        { checked: true, disabled: true },
    ]);
    expect(result.footnoteReference).toBe('#footnote1');
    expect(result.footnoteDestination).toBe('footnote1');
    expect(result.vendorBundleLoaded).toBe(true);
});

test('renders every section across pages with interactive links and numbered footnote destinations', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.markdownit === 'function');

    const paragraphs = Array.from({ length: 90 }, (_, index) =>
        `Paragraph ${index + 1}: this deliberately long body verifies that PDF layout is not clipped to one viewport page.`
    );
    const source = [
        '---',
        'cover-page: true',
        'title: Complete export',
        'toc-depth: 2',
        '---',
        '# First section',
        '',
        'The first reference is named[^world]. Read the [external export guide](https://example.com/figaro-export-guide).',
        '',
        ...paragraphs.slice(0, 30).flatMap(paragraph => [paragraph, '']),
        '## Second section',
        '',
        'A numeric reference follows[^1], then the first reference repeats[^world].',
        '',
        ...paragraphs.slice(30, 60).flatMap(paragraph => [paragraph, '']),
        '## Final section',
        '',
        ...paragraphs.slice(60).flatMap(paragraph => [paragraph, '']),
        '[^world]: The named footnote destination.',
        '[^1]: The numeric footnote destination.',
    ].join('\n');

    const rendered = await page.evaluate(async (markdown) => {
        const module = await import('/js/pdfExport.js');
        const html = await module.renderPrintableMarkdownWithDiagrams(markdown, 'Fallback');
        const printable = new DOMParser().parseFromString(html, 'text/html');
        const footnoteLinks = Array.from(printable.querySelectorAll('.footnote-ref > a:first-child'));
        return {
            html,
            text: printable.body.textContent,
            references: footnoteLinks.map(link => ({ text: link.textContent, href: link.getAttribute('href') })),
            endnotes: Array.from(printable.querySelectorAll('.footnotes li')).map(item => item.id),
        };
    }, source);

    expect(rendered.text).toContain('Paragraph 90');
    expect(rendered.references).toEqual([
        { text: '1', href: '#footnote1' },
        { text: '2', href: '#footnote2' },
        { text: '1', href: '#footnote1' },
    ]);
    expect(rendered.endnotes).toEqual(['footnote1', 'footnote2']);

    await page.setContent(rendered.html, { waitUntil: 'load' });

    await page.emulateMedia({ media: 'print' });
    const printLayout = await page.evaluate(() => {
        const body = document.body;
        return {
            bodyOverflow: getComputedStyle(body).overflow,
            bodyDisplay: getComputedStyle(body).display,
            bodyHeight: body.getBoundingClientRect().height,
            viewportHeight: window.innerHeight,
        };
    });
    expect(printLayout.bodyOverflow).toBe('visible');
    expect(printLayout.bodyDisplay).toBe('block');
    expect(printLayout.bodyHeight).toBeGreaterThan(printLayout.viewportHeight * 3);

    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    const pdfText = pdf.toString('latin1');
    const pageCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThanOrEqual(4);

    // Chromium's PDF renderer retains HTML links as PDF annotations and named
    // destinations. This is the portable export contract; the WebKitGTK native
    // print backend is exercised separately by the staging/layout assertions above.
    expect(pdfText).toContain('/Dest /first-section');
    expect(pdfText).toContain('/Dest /footnote1');
    expect(pdfText).toContain('/Dest /footnote2');
    expect(pdfText).toContain('/Dest /footnote-ref1');
    expect(pdfText).toContain('/Dest /footnote-ref2');
    expect(pdfText).toContain('/URI (https://example.com/figaro-export-guide)');
});

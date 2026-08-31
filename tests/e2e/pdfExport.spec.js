import { expect, test } from '@playwright/test';

function fence(language, source) {
    const marker = String.fromCharCode(96).repeat(3);
    return marker + language + '\n' + source + '\n' + marker;
}

test('renders printable cover, TOC, Mermaid, Vega, and Vega-Lite with the vendored browser libraries', async ({ page }) => {
    // Observe real loading without the browser's bounded Resource Timing buffer.
    // Exact plugin transformations and anchor rules live in export.test.js.
    let printBundleLoaded = false;
    page.on('requestfinished', request => {
        if (new URL(request.url()).pathname === '/vendored/markdown-it-plugins/index.js') {
            printBundleLoaded = true;
        }
    });
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
        '---',
        '',
        'Second printable page with ==highlighting== and $E=mc^2$.',
        '',
        fence('mermaid', 'flowchart TD\n  Start --> Finish'),
        '',
        fence('mermaid', '---\nconfig: !!omap\n- dangerous: value\n---\nflowchart TD\n  Hidden --> Parser'),
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
            authoredPageBreaks: printable.querySelectorAll('.figaro-print-authored-page-break').length,
            tocHrefs: Array.from(printable.querySelectorAll('.figaro-print-toc a')).map(link => link.getAttribute('href')),
            diagramLanguages: Array.from(printable.querySelectorAll('.figaro-print-diagram')).map(element => element.dataset.diagramLanguage),
            renderedSVGs: printable.querySelectorAll('.figaro-print-diagram svg').length,
            remainingDiagramFences: printable.querySelectorAll('pre > code.language-mermaid, pre > code.language-vega, pre > code.language-vega-lite').length,
            unsafeMermaidSource: printable.querySelector('pre > code.language-mermaid')?.textContent,
            highlighted: printable.querySelector('mark')?.textContent,
            renderedMath: printable.querySelectorAll('.katex').length,
        };
    }, source);

    expect(result.covers).toBe(1);
    expect(result.coverTitle).toBe('Browser PDF export');
    expect(result.coverMetadata).toContain('Figaro test suite');
    expect(result.coverMetadata).toContain('2026-07-12');
    expect(result.pageBreaks).toBe(3);
    expect(result.authoredPageBreaks).toBe(1);
    expect(result.tocHrefs).toEqual(['#introduction', '#charts']);
    expect(result.diagramLanguages).toEqual(['mermaid', 'vega', 'vega-lite']);
    expect(result.renderedSVGs).toBe(3);
    expect(result.remainingDiagramFences).toBe(1);
    expect(result.unsafeMermaidSource).toContain('!!omap');
    expect(result.highlighted).toBe('highlighting');
    expect(result.renderedMath).toBe(1);
    await expect.poll(() => printBundleLoaded).toBe(true);
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
        fence('javascript', 'const answer = 42; // printable token colors'),
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
        const keyword = document.querySelector('.figaro-print-code .hljs-keyword');
        const comment = document.querySelector('.figaro-print-code .hljs-comment');
        return {
            bodyOverflow: getComputedStyle(body).overflow,
            bodyDisplay: getComputedStyle(body).display,
            bodyHeight: body.getBoundingClientRect().height,
            viewportHeight: window.innerHeight,
            codeLanguage: document.querySelector('.figaro-print-code')?.dataset.highlightLanguage,
            keywordText: keyword?.textContent,
            keywordColor: keyword ? getComputedStyle(keyword).color : '',
            commentColor: comment ? getComputedStyle(comment).color : '',
        };
    });
    expect(printLayout.bodyOverflow).toBe('visible');
    expect(printLayout.bodyDisplay).toBe('block');
    expect(printLayout.bodyHeight).toBeGreaterThan(printLayout.viewportHeight * 3);
    expect(printLayout.codeLanguage).toBe('javascript');
    expect(printLayout.keywordText).toBe('const');
    expect(printLayout.keywordColor).toBe('rgb(207, 34, 46)');
    expect(printLayout.commentColor).toBe('rgb(87, 96, 106)');

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

/**
 * Contract tests for the Markdown-to-interactive-PDF pipeline.
 *
 * The backend writes the PDF beside its Markdown source and opens it through
 * the platform's default viewer. These tests exercise the app-controlled contract: semantic HTML,
 * frontmatter-driven print structure, diagram SVGs, stylesheet handoff, and
 * the browser-export request.
 */

import MarkdownIt from 'markdown-it';

const mockState = {
    openTabs: [{ id: 'test.md', title: 'test.md', type: 'file', path: 'test.md', dirty: false }],
    activeTabId: 'test.md',
};

jest.mock('../frontend/js/state.js', () => ({
    getState: jest.fn((key) => mockState[key]),
}));

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() }
}));

import { statusBar } from '../frontend/js/statusBar.js';
import {
    exportFileToPDF,
    exportMarkdownToPDF,
    renderPrintableMarkdown,
    renderPrintableMarkdownWithDiagrams,
} from '../frontend/js/pdfExport.js';

function parseHTML(html) {
    return new DOMParser().parseFromString(html, 'text/html');
}

function fence(language, source) {
    const marker = String.fromCharCode(96).repeat(3);
    return marker + language + '\n' + source + '\n' + marker;
}

function setRealMarkdownRenderer() {
    window.markdownit = jest.fn((options) => new MarkdownIt(options));
}

function setKatexRenderer() {
    class FakeKatexParseError extends Error {}
    window.katex = {
        ParseError: FakeKatexParseError,
        renderToString: jest.fn((source, options = {}) =>
            `<span class="katex${options.displayMode ? ' katex-display' : ''}" data-tex="${source}">${source}</span>`
        ),
    };
}

function setDiagramRenderers() {
    const vegaViews = [];
    window.mermaid = {
        initialize: jest.fn(),
        render: jest.fn().mockResolvedValue({
            svg: '<svg data-diagram="mermaid" viewBox="0 0 10 10"><text>Mermaid</text></svg>',
        }),
    };
    window.vegaEmbed = jest.fn(async (_target, spec, options) => {
        const view = {
            toSVG: jest.fn().mockResolvedValue(
                '<svg data-diagram="' + options.mode + '"><text>' + (spec.title || options.mode) + '</text></svg>'
            ),
            finalize: jest.fn(),
        };
        vegaViews.push(view);
        return { view };
    });
    return vegaViews;
}

describe('Interactive PDF export', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockState.openTabs = [{ id: 'test.md', title: 'test.md', type: 'file', path: 'test.md', dirty: false }];
        mockState.activeTabId = 'test.md';
        window.go = {
            main: {
                App: {
                ExportPDF: jest.fn().mockResolvedValue({ success: true, path: '/tmp/report.pdf', engine: 'chromium' }),
                ReadFile: jest.fn().mockResolvedValue({ content: '# Hello', path: 'test.md', mtime: 1 }),
                }
            }
        };
        delete window.mermaid;
        delete window.vegaEmbed;
        setRealMarkdownRenderer();
        setKatexRenderer();
    });

    afterEach(() => {
        window.dispatchEvent(new Event('afterprint'));
        delete window.mermaid;
        delete window.vegaEmbed;
        delete window.katex;
    });

    test('renders a safe, semantic Markdown body with stable heading anchors', () => {
        const content = [
            '---',
            'title: metadata is not body text',
            '---',
            '# Introduction',
            '',
            'A **bold** word, an _emphasised_ word, and https://figaro.app.',
            '',
            '> A useful quote',
            '',
            '| Name | Value |',
            '| --- | --- |',
            '| Figaro | PKM |',
            '',
            '![Local asset](images/diagram.svg)',
            '',
            '<span id="raw-html">raw HTML must remain text</span>',
            '',
            fence('javascript', 'const answer = 42;'),
        ].join('\n');

        const html = renderPrintableMarkdown(content, 'Fallback <note>');
        const printable = parseHTML(html);

        expect(window.markdownit).toHaveBeenCalledWith({ html: false, linkify: true, typographer: true });
        expect(html).toContain('<title>Fallback &lt;note&gt;</title>');
        expect(html).toContain('@page { margin: 18mm; }');
        expect(html).toContain('.figaro-print-document h1');
        expect(printable.querySelector('main.figaro-print-document')).not.toBeNull();
        expect(printable.querySelector('h1')).toMatchObject({ id: 'introduction', textContent: 'Introduction' });
        expect(printable.querySelector('strong').textContent).toBe('bold');
        expect(printable.querySelector('em').textContent).toBe('emphasised');
        expect(printable.querySelector('blockquote').textContent).toContain('A useful quote');
        expect(printable.querySelectorAll('table tbody tr')).toHaveLength(1);
        expect(printable.querySelector('img').getAttribute('src')).toBe('images/diagram.svg');
        expect(printable.querySelector('#raw-html')).toBeNull();
        expect(printable.body.textContent).toContain('<span id=');
        expect(printable.body.textContent).toContain('raw HTML must remain text</span>');
        expect(printable.body.textContent).not.toContain('title: metadata is not body text');
        expect(printable.querySelector('pre > code.language-javascript').textContent).toContain('const answer = 42;');
    });

	test('renders conventional wikilinks in printable preview and export HTML without parsing code', () => {
		const content = 'See [[docs/Guide Note.md#start|Readable guide]] and `[[literal.md|code]]`.';
		const printable = parseHTML(renderPrintableMarkdown(content, 'Wikilinks'));
		const link = printable.querySelector('a.figaro-wikilink');

		expect(link.textContent).toBe('Readable guide');
		expect(link.getAttribute('href')).toBe('/vault/docs/Guide%20Note.md#start');
		expect(link.dataset.wikilinkTarget).toBe('docs/Guide Note.md#start');
		expect(printable.querySelector('code').textContent).toBe('[[literal.md|code]]');
	});

    test('renders aligned Markdown tables with the printable preview and PDF styling contract', () => {
        const content = [
            '| Name | Status | Total |',
            '| :--- | :---: | ---: |',
            '| Alpha | Ready | 12 |',
            '| Beta | Waiting | 3 |',
        ].join('\n');

        const printable = parseHTML(renderPrintableMarkdown(content, 'Table report'));
        const table = printable.querySelector('main.figaro-print-document > table');
        const headers = Array.from(table.querySelectorAll('thead th'));
        const cells = Array.from(table.querySelectorAll('tbody td'));

        expect(table).not.toBeNull();
        expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(headers.map(header => header.style.textAlign)).toEqual(['left', 'center', 'right']);
        expect(cells.slice(0, 3).map(cell => cell.style.textAlign)).toEqual(['left', 'center', 'right']);
        expect(cells.map(cell => cell.textContent.trim())).toEqual([
            'Alpha', 'Ready', '12', 'Beta', 'Waiting', '3',
        ]);
        expect(printable.querySelector('style').textContent).toContain('table {');
        expect(printable.querySelector('style').textContent).toContain('border-collapse: collapse');
        expect(printable.querySelector('style').textContent).toContain('break-inside: avoid');
    });

    test('renders plugin footnotes into numbered links and endnotes without touching code', () => {
        const content = [
            '# Footnotes',
            '',
            'A named reference[^world], a numeric one[^1], and the named reference again[^world].',
            'An inline footnote follows^[Inline footnote text].',
            '',
            'Inline code keeps `[^world]` literal.',
            '',
            fence('text', '[^world] also stays literal in a fenced code block.'),
            '',
            '[^world]: A **world** footnote.',
            '[^1]: A numeric footnote.',
            '[^missing]: This unused definition is not printed.',
        ].join('\n');

        const printable = parseHTML(renderPrintableMarkdown(content, 'Footnotes'));
        const references = Array.from(printable.querySelectorAll('.footnote-ref > a:first-child'));
        const footnotes = printable.querySelector('section.footnotes');

        expect(references.map(reference => reference.textContent)).toEqual(['1', '2', '1', '3']);
        expect(references.map(reference => reference.getAttribute('href'))).toEqual([
            '#footnote1',
            '#footnote2',
            '#footnote1',
            '#footnote3',
        ]);
        expect(footnotes).not.toBeNull();
        expect(footnotes.querySelectorAll('ol > li')).toHaveLength(3);
        expect(footnotes.querySelector('#footnote1').textContent).toContain('world footnote');
        expect(footnotes.querySelector('#footnote1 strong').textContent).toBe('world');
        expect(footnotes.querySelector('#footnote2').textContent).toContain('numeric footnote');
        expect(footnotes.querySelector('#footnote3').textContent).toContain('Inline footnote text');
        expect(footnotes.querySelectorAll('.footnote-backref')).toHaveLength(4);
        expect(footnotes.querySelector('#footnote1 .footnote-backref').getAttribute('href'))
            .toBe('#footnote-ref1');
        expect(printable.querySelector('p code').textContent).toBe('[^world]');
        expect(printable.querySelector('pre > code.language-text').textContent).toContain('[^world] also stays literal');
        expect(printable.body.textContent).not.toContain('This unused definition is not printed.');
    });

    test('renders recognised quoted callouts with stable type hooks', () => {
        const content = [
            '> [!note] A helpful note',
            '>',
            '> Its body keeps **Markdown** formatting.',
            '',
            '> [!warning] Take care',
            '',
            '> [!info] More detail',
            '',
            '> [!tip] A useful shortcut',
            '',
            '> [!danger] A risky action',
            '',
            '> [!example] A concrete example',
            '',
            '> An ordinary quote stays ordinary.',
        ].join('\n');

        const printable = parseHTML(renderPrintableMarkdown(content, 'Callouts'));
        const callouts = Array.from(printable.querySelectorAll('blockquote.figaro-print-callout'));

        expect(callouts.map(callout => callout.dataset.calloutType)).toEqual([
            'note', 'warning', 'info', 'tip', 'danger', 'example',
        ]);
        expect(callouts.map(callout => callout.dataset.calloutLabel)).toEqual([
            'Note', 'Warning', 'Info', 'Tip', 'Danger', 'Example',
        ]);
        expect(callouts[0].classList.contains('figaro-print-callout-note')).toBe(true);
        expect(callouts[0].textContent).toContain('A helpful note');
        expect(callouts[0].textContent).toContain('Markdown formatting.');
        expect(callouts[0].textContent).not.toContain('[!note]');
        expect(callouts[0].querySelector('strong').textContent).toBe('Markdown');
        expect(printable.querySelectorAll('blockquote:not(.figaro-print-callout)')).toHaveLength(1);
        expect(printable.querySelector('style').textContent).toContain('.figaro-print-callout-danger');
    });

    test('uses the vendored plugins for anchored headings, math, highlights, tasks, subscripts, and superscripts', () => {
        const content = [
            '---',
            'toc-depth: 2',
            '---',
            '# Café Notes',
            '## Café Notes',
            '',
            'Water is H~2~O, x^2^ is superscript, and ==this is highlighted==.',
            '',
            'Inline math: $E=mc^2$.',
            '',
            '$$',
            '\\frac{a}{b}',
            '$$',
            '',
            '- [ ] Still open',
            '- [x] Complete',
            '',
            'A footnote remains distinct from superscript[^note].',
            '',
            '[^note]: Footnote destination.',
        ].join('\n');

        const printable = parseHTML(renderPrintableMarkdown(content, 'Extensions'));
        const tocLinks = Array.from(printable.querySelectorAll('.figaro-print-toc a'));
        const checkboxes = Array.from(printable.querySelectorAll('.figaro-print-task-checkbox'));

        expect(printable.getElementById('cafe-notes')).not.toBeNull();
        expect(printable.getElementById('cafe-notes-2')).not.toBeNull();
        expect(tocLinks.map(link => link.getAttribute('href'))).toEqual(['#cafe-notes', '#cafe-notes-2']);
        expect(tocLinks.every(link => printable.querySelector(link.getAttribute('href')))).toBe(true);
        expect(printable.querySelector('mark').textContent).toBe('this is highlighted');
        expect(printable.querySelector('sub').textContent).toBe('2');
        expect(printable.querySelector('sup:not(.footnote-ref)').textContent).toBe('2');
        expect(window.katex.renderToString).toHaveBeenCalledTimes(2);
        expect(window.katex.renderToString.mock.calls.map(call => call[0])).toEqual(['E=mc^2', '\\frac{a}{b}\n']);
        expect(printable.querySelectorAll('.katex')).toHaveLength(2);
        expect(printable.querySelector('.katex-block')).not.toBeNull();
        expect(checkboxes).toHaveLength(2);
        expect(checkboxes.map(checkbox => checkbox.disabled)).toEqual([true, true]);
        expect(checkboxes.map(checkbox => checkbox.checked)).toEqual([false, true]);
        expect(printable.querySelector('.footnote-ref > a:first-child').textContent).toBe('1');
        expect(printable.querySelector('#footnote1')).not.toBeNull();
    });

    test('produces a navigable extension document with exact anchors, links, TOC targets, and plugin HTML', () => {
        const content = [
            '---',
            'toc-depth: 3',
            '---',
            '# Café & [Tea](https://example.test/tea)',
            '## API `v2`',
            '### Café & [Tea](https://example.test/tea)',
            '## API `v2`',
            '# !!!',
            '',
            'Jump to the [first heading](#cafe-tea) or [second API heading](#api-v2-2).',
            '',
            'H~2~O, x^2^, ==highlighted text==, and $E=mc^2$.',
            '',
            '$$',
            '\\frac{a}{b}',
            '$$',
            '',
            '- [ ] Open task',
            '- [X] Closed task',
            '',
            'A reference[^alpha], the same reference again[^alpha], and an inline note^[Inline note].',
            '',
            'Code remains literal: `H~2~O x^2^ ==highlight== $E$ [^alpha]`.',
            '',
            '[^alpha]: **Alpha** destination.',
        ].join('\n');

        const html = renderPrintableMarkdown(content, 'Extension contract');
        const printable = parseHTML(html);
        const headings = Array.from(printable.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .filter(heading => heading.id);
        const tocLinks = Array.from(printable.querySelectorAll('.figaro-print-toc a'));
        const documentLinks = Array.from(printable.querySelectorAll('p > a[href^="#"]'))
            .filter(link => !link.closest('.footnotes'));
        const footnoteReferences = Array.from(printable.querySelectorAll('.footnote-ref > a:first-child'));
        const footnoteAnchors = Array.from(printable.querySelectorAll('.footnote-anchor'));
        const footnoteBackrefs = Array.from(printable.querySelectorAll('.footnote-backref'));
        const targetFor = (href) => printable.getElementById(String(href).slice(1));

        expect(headings.map(heading => ({ id: heading.id, tag: heading.tagName, text: heading.textContent }))).toEqual([
            { id: 'cafe-tea', tag: 'H1', text: 'Café & Tea' },
            { id: 'api-v2', tag: 'H2', text: 'API v2' },
            { id: 'cafe-tea-2', tag: 'H3', text: 'Café & Tea' },
            { id: 'api-v2-2', tag: 'H2', text: 'API v2' },
            { id: 'section', tag: 'H1', text: '!!!' },
        ]);
        expect(new Set(headings.map(heading => heading.id)).size).toBe(headings.length);

        expect(tocLinks.map(link => link.getAttribute('href'))).toEqual([
            '#cafe-tea',
            '#api-v2',
            '#cafe-tea-2',
            '#api-v2-2',
            '#section',
        ]);
        expect(tocLinks.map(link => link.parentElement.className)).toEqual([
            'figaro-toc-level-1',
            'figaro-toc-level-2',
            'figaro-toc-level-3',
            'figaro-toc-level-2',
            'figaro-toc-level-1',
        ]);
        tocLinks.forEach(link => {
            const target = targetFor(link.getAttribute('href'));
            expect(target).not.toBeNull();
            expect(target.textContent).toBe(link.textContent);
        });

        expect(documentLinks.map(link => link.getAttribute('href'))).toEqual(['#cafe-tea', '#api-v2-2']);
        documentLinks.forEach(link => expect(targetFor(link.getAttribute('href'))).not.toBeNull());

        expect(printable.querySelector('mark').outerHTML).toBe('<mark>highlighted text</mark>');
        expect(printable.querySelector('sub').outerHTML).toBe('<sub>2</sub>');
        expect(printable.querySelector('sup:not(.footnote-ref)').outerHTML).toBe('<sup>2</sup>');
        expect(window.katex.renderToString.mock.calls.map(call => call[0])).toEqual(['E=mc^2', '\\frac{a}{b}\n']);
        expect(printable.querySelectorAll('.katex')).toHaveLength(2);
        expect(printable.querySelector('.katex-block')).not.toBeNull();

        const checkboxes = Array.from(printable.querySelectorAll('.figaro-print-task-checkbox'));
        expect(printable.querySelector('.figaro-print-task-list')).not.toBeNull();
        expect(checkboxes.map(checkbox => ({ checked: checkbox.checked, disabled: checkbox.disabled }))).toEqual([
            { checked: false, disabled: true },
            { checked: true, disabled: true },
        ]);

        expect(footnoteReferences.map(link => ({ text: link.textContent, href: link.getAttribute('href') }))).toEqual([
            { text: '1', href: '#footnote1' },
            { text: '1', href: '#footnote1' },
            { text: '2', href: '#footnote2' },
        ]);
        footnoteReferences.forEach(link => expect(targetFor(link.getAttribute('href'))).not.toBeNull());
        expect(footnoteAnchors.map(anchor => anchor.id)).toEqual(['footnote-ref1', 'footnote-ref1:1', 'footnote-ref2']);
        expect(footnoteBackrefs).toHaveLength(3);
        footnoteBackrefs.forEach(link => expect(targetFor(link.getAttribute('href'))).not.toBeNull());
        expect(printable.querySelector('#footnote1 strong').textContent).toBe('Alpha');
        expect(printable.querySelector('#footnote2').textContent).toContain('Inline note');
        expect(printable.querySelector('p code').textContent).toBe('H~2~O x^2^ ==highlight== $E$ [^alpha]');
        expect(html).toContain('.footnotes');
        expect(html).toContain('.figaro-print-task-list');
    });

    test('creates exactly one cover page with its metadata and a forced following page break', () => {
        const content = [
            '---',
            'cover-page: true',
            'title: Figaro Export Guide',
            'subtitle: A polished PDF',
            'author: Ada Lovelace',
            'date: 2026-07-11',
            'toc-depth: 0',
            '---',
            '# Introduction',
        ].join('\n');

        const printable = parseHTML(renderPrintableMarkdown(content, 'Fallback title'));
        const covers = printable.querySelectorAll('.figaro-print-cover');
        const pageBreaks = printable.querySelectorAll('.figaro-print-page-break');

        expect(covers).toHaveLength(1);
        expect(pageBreaks).toHaveLength(1);
        expect(covers[0]).toBe(pageBreaks[0]);
        expect(covers[0].querySelector('.figaro-print-cover-title').textContent).toBe('Figaro Export Guide');
        expect(covers[0].querySelector('.figaro-print-cover-subtitle').textContent).toBe('A polished PDF');
        expect(covers[0].querySelector('.figaro-print-cover-meta').textContent).toContain('Ada Lovelace');
        expect(covers[0].querySelector('.figaro-print-cover-meta').textContent).toContain('2026-07-11');
        expect(covers[0].querySelector('.figaro-print-cover-author').textContent).toBe('Ada Lovelace');
        expect(covers[0].querySelector('.figaro-print-cover-date').textContent).toBe('2026-07-11');
        expect(printable.querySelector('main.figaro-print-document h1').textContent).toBe('Introduction');
        expect(printable.querySelector('.figaro-print-toc')).toBeNull();
    });

    test('does not generate a cover page when cover-page is disabled', () => {
        const printable = parseHTML(renderPrintableMarkdown([
            '---',
            'cover-page: false',
            'title: Must stay in the document',
            '---',
            '# Introduction',
        ].join('\n'), 'Fallback title'));

        expect(printable.querySelectorAll('.figaro-print-cover')).toHaveLength(0);
        expect(printable.querySelectorAll('.figaro-print-page-break')).toHaveLength(0);
    });

    test('renders a depth-limited TOC after the cover with unique, working anchors', () => {
        const content = [
            '---',
            'cover-page: true',
            'toc-depth: 2',
            '---',
            '# Introduction',
            '## Install',
            '### Deep detail',
            '## Introduction',
            '## Usage',
        ].join('\n');

        const printable = parseHTML(renderPrintableMarkdown(content, 'Fallback title'));
        const cover = printable.querySelector('.figaro-print-cover');
        const toc = printable.querySelector('.figaro-print-toc');
        const links = Array.from(toc.querySelectorAll('a'));
        const hrefs = links.map(link => link.getAttribute('href'));

        expect(printable.querySelectorAll('.figaro-print-page-break')).toHaveLength(2);
        expect(cover.compareDocumentPosition(toc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(hrefs).toEqual(['#introduction', '#install', '#introduction-2', '#usage']);
        expect(hrefs).not.toContain('#deep-detail');
        expect(toc.querySelector('.figaro-print-toc-title').textContent).toBe('Contents');
        expect(toc.querySelector('.figaro-print-toc-list')).not.toBeNull();
        expect(printable.getElementById('introduction').textContent).toBe('Introduction');
        expect(printable.getElementById('introduction-2').textContent).toBe('Introduction');
        expect(printable.getElementById('deep-detail').textContent).toBe('Deep detail');
        expect(toc.querySelectorAll('.figaro-toc-level-3')).toHaveLength(0);
    });

    test('treats toc-depth zero and invalid values as no table of contents', () => {
        for (const depth of ['0', 'not-a-number', '-3']) {
            const printable = parseHTML(renderPrintableMarkdown([
                '---',
                'toc-depth: ' + depth,
                '---',
                '# Introduction',
            ].join('\n')));
            expect(printable.querySelector('.figaro-print-toc')).toBeNull();
        }
    });

    test('renders Mermaid, Vega, and Vega-Lite fences as inline printable SVGs', async () => {
        const vegaViews = setDiagramRenderers();
        const content = [
            '# Visuals',
            '',
            fence('mermaid', 'flowchart TD\n  A --> B'),
            '',
            fence('vega', '{"title":"Vega chart","marks":[]}'),
            '',
            fence('vega-lite', '{"title":"Vega-Lite chart","mark":"bar"}'),
            '',
            fence('javascript', 'const remainsSource = true;'),
        ].join('\n');

        const printable = parseHTML(await renderPrintableMarkdownWithDiagrams(content, 'Visuals'));
        const diagrams = Array.from(printable.querySelectorAll('.figaro-print-diagram'));

        expect(window.mermaid.initialize).toHaveBeenCalledWith({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
        });
        expect(window.mermaid.render).toHaveBeenCalledWith(
            expect.stringMatching(/^figaro-print-diagram-mermaid-/),
            'flowchart TD\n  A --> B'
        );
        expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
        expect(window.vegaEmbed.mock.calls[0][2]).toEqual({ mode: 'vega', actions: false, renderer: 'svg' });
        expect(window.vegaEmbed.mock.calls[1][2]).toEqual({ mode: 'vega-lite', actions: false, renderer: 'svg' });
        expect(vegaViews).toHaveLength(2);
        vegaViews.forEach(view => {
            expect(view.toSVG).toHaveBeenCalledTimes(1);
            expect(view.finalize).toHaveBeenCalledTimes(1);
        });
        expect(diagrams.map(diagram => diagram.dataset.diagramLanguage)).toEqual(['mermaid', 'vega', 'vega-lite']);
        expect(printable.querySelectorAll('.figaro-print-diagram svg')).toHaveLength(3);
        expect(printable.querySelectorAll('pre > code.language-mermaid')).toHaveLength(0);
        expect(printable.querySelectorAll('pre > code.language-vega')).toHaveLength(0);
        expect(printable.querySelectorAll('pre > code.language-vega-lite')).toHaveLength(0);
        expect(printable.querySelector('pre > code.language-javascript').textContent).toContain('const remainsSource = true;');
        expect(printable.querySelector('style').textContent).toContain('break-inside: avoid');
    });

    test('keeps source fences printable when a diagram renderer is unavailable or fails', async () => {
        window.mermaid = {
            initialize: jest.fn(),
            render: jest.fn().mockRejectedValue(new Error('invalid Mermaid')),
        };
        const content = [
            fence('mermaid', 'this is not a diagram'),
            '',
            fence('vega-lite', '{not valid JSON}'),
        ].join('\n');

        const printable = parseHTML(await renderPrintableMarkdownWithDiagrams(content, 'Broken diagrams'));

        expect(window.mermaid.render).toHaveBeenCalledTimes(1);
        expect(printable.querySelectorAll('.figaro-print-diagram')).toHaveLength(0);
        expect(printable.querySelector('pre > code.language-mermaid').textContent).toContain('this is not a diagram');
        expect(printable.querySelector('pre > code.language-vega-lite').textContent).toContain('{not valid JSON}');
    });

    test('hands the fully rendered document and frontmatter stylesheet to the interactive PDF backend', async () => {
        setDiagramRenderers();
        const content = [
            '---',
            'print-stylesheet: "../styles/report.css"',
            'title: Report',
            '---',
            '# Hello',
            '',
            fence('mermaid', 'flowchart TD\n  A --> B'),
        ].join('\n');

        const result = await exportMarkdownToPDF({ path: 'notes/report.md', title: 'report.md', content });
        const call = window.go.main.App.ExportPDF.mock.calls[0];
        const printable = parseHTML(call[1]);

        expect(call[0]).toBe('report');
        expect(call[2]).toBe('notes/report.md');
        expect(call[3]).toBe('../styles/report.css');
        expect(printable.querySelector('h1').textContent).toBe('Hello');
        expect(printable.querySelectorAll('.figaro-print-diagram[data-diagram-language="mermaid"] svg')).toHaveLength(1);
        expect(call[1]).not.toContain('print-stylesheet:');
        expect(result).toEqual({ success: true, path: '/tmp/report.pdf', engine: 'chromium' });
        expect(statusBar.set).toHaveBeenCalledWith('PDF exported beside the note — opened with your default viewer');
    });

    test('reads a non-active Markdown file before exporting it', async () => {
        await exportFileToPDF('notes/report.md', 'report.md');

        expect(window.go.main.App.ReadFile).toHaveBeenCalledWith('notes/report.md');
        expect(window.go.main.App.ExportPDF).toHaveBeenCalledWith(
            'report',
            expect.stringContaining('<h1 id="hello">Hello</h1>'),
            'notes/report.md',
            ''
        );
    });

    test('reports a saved PDF when the default viewer cannot be started', async () => {
        window.go.main.App.ExportPDF.mockResolvedValueOnce({
            success: true,
            path: 'notes/report.pdf',
            engine: 'chromium',
            viewerError: 'xdg-open is unavailable',
        });

        const pending = exportMarkdownToPDF({ path: 'notes/report.md', title: 'report.md', content: '# Report' });
        await new Promise(resolve => setTimeout(resolve, 0));
        const dialog = document.querySelector('.pdf-export-error-modal');
        expect(dialog.textContent).toContain('PDF exported, but not opened');
        expect(dialog.textContent).toContain('notes/report.pdf');
        dialog.querySelector('.custom-modal-btn-confirm').click();

        await expect(pending).resolves.toMatchObject({ success: true, viewerError: 'xdg-open is unavailable' });
        expect(statusBar.set).toHaveBeenCalledWith('PDF exported beside the note — open it manually');
    });

    test('rejects non-Markdown exports and surfaces interactive-export failures', async () => {
        await expect(exportMarkdownToPDF({ path: 'note.txt', title: 'note.txt', content: 'Nope' }))
            .rejects.toThrow('PDF export is only available for Markdown files');
        expect(window.go.main.App.ExportPDF).not.toHaveBeenCalled();

        window.go.main.App.ExportPDF.mockResolvedValueOnce({
            success: false,
            error: 'No browser engine was found',
        });
        await expect(exportMarkdownToPDF({ path: 'test.md', title: 'test.md', content: '# Hello' }))
            .rejects.toThrow('No browser engine was found');
    });
});

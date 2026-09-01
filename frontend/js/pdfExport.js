import { backend } from './backend.js';
/**
 * Interactive PDF export shared by the editor and file-tree menus.
 */

import { getState } from './state.js';
import { statusBar } from './statusBar.js';
import { getFrontmatterValue, getPrintStylesheet, stripLeadingFrontmatter } from './frontmatter.js';
import { isDiagramLanguage, renderDiagramSVG } from './diagramRenderer.js';
import { pdfExportErrorDialog } from './dialogs.js';
import { createPrintMarkdownRenderer } from '../vendored/markdown-it-plugins/index.js';
import { highlightCode } from '../vendored/codemirror-live-markdown/index.js';
import { planPrintableCodeHighlight } from './core/printableCodeHighlight.js';
import { decorateMarkdownTables } from './markdownTableRenderer.js';
import {
    markdownTableMergePlans,
    stripMarkdownTableMergeMetadata,
} from './core/markdownTableEditorModel.js';
import { getEditorContent } from './editor.js';
import { authoredMermaidDiagramHeight } from './core/mermaidDiagramModel.js';

const defaultPrintCSS = `
  @page { margin: 18mm; }
  :root { --figaro-page-number-color: #57606a; --figaro-page-number-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --figaro-page-number-size: 9pt; color-scheme: light; }
  html { color: #202124; }
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; color: inherit; padding: 0; max-width: 820px; margin: 0 auto; }
  .figaro-print-document h1, .figaro-print-document h2 { border-bottom: 1px solid #e6e6e6; padding-bottom: .3em; }
  .figaro-print-document h1, .figaro-print-document h2, .figaro-print-document h3, .figaro-print-document h4, .figaro-print-document h5, .figaro-print-document h6 { break-after: avoid-page; page-break-after: avoid; }
  pre, code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
  code { background: #f4f4f5; padding: .15em .3em; border-radius: 3px; }
  pre { padding: 12px; overflow-wrap: break-word; white-space: pre-wrap; background: #f6f8fa; border-radius: 6px; break-inside: avoid; }
  pre code { padding: 0; background: none; }
  pre > code.figaro-print-code { color: #24292f; }
  .figaro-print-code .hljs-keyword, .figaro-print-code .hljs-selector-tag { color: #cf222e; }
  .figaro-print-code .hljs-string, .figaro-print-code .hljs-regexp, .figaro-print-code .hljs-addition { color: #0a3069; }
  .figaro-print-code .hljs-number, .figaro-print-code .hljs-symbol, .figaro-print-code .hljs-bullet, .figaro-print-code .hljs-literal { color: #0550ae; }
  .figaro-print-code .hljs-title, .figaro-print-code .hljs-section, .figaro-print-code .hljs-function { color: #8250df; }
  .figaro-print-code .hljs-comment, .figaro-print-code .hljs-quote { color: #57606a; font-style: italic; }
  .figaro-print-code .hljs-deletion { color: #82071e; }
  .figaro-print-code .hljs-type, .figaro-print-code .hljs-class, .figaro-print-code .hljs-name, .figaro-print-code .hljs-selector-class, .figaro-print-code .hljs-selector-id { color: #116329; }
  .figaro-print-code .hljs-variable, .figaro-print-code .hljs-template-variable, .figaro-print-code .hljs-params { color: #953800; }
  .figaro-print-code .hljs-built_in, .figaro-print-code .hljs-attr, .figaro-print-code .hljs-attribute, .figaro-print-code .hljs-meta { color: #0550ae; }
  .figaro-print-code .hljs-operator, .figaro-print-code .hljs-punctuation { color: #24292f; }
  blockquote { border-left: 4px solid #d0d7de; margin: 1em 0; padding: 0 16px; color: #57606a; }
  .figaro-print-callout { --figaro-print-callout-color: #0969da; margin: 1em 0; padding: .85em 1em; border: 1px solid #c8d9eb; border-left: 4px solid var(--figaro-print-callout-color); border-radius: 6px; background: #eef6ff; color: #202124; break-inside: avoid; page-break-inside: avoid; }
  .figaro-print-callout::before { content: attr(data-callout-label); display: block; margin: 0 0 .35em; color: var(--figaro-print-callout-color); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: .78em; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .figaro-print-callout > :first-child { margin-top: 0; }
  .figaro-print-callout > :last-child { margin-bottom: 0; }
  .figaro-print-callout-note { --figaro-print-callout-color: #0969da; border-color: #b6d5f5; background: #eef6ff; }
  .figaro-print-callout-warning { --figaro-print-callout-color: #9a6700; border-color: #ebcf8f; background: #fff8c5; }
  .figaro-print-callout-info { --figaro-print-callout-color: #0550ae; border-color: #b6d5f5; background: #eef6ff; }
  .figaro-print-callout-tip { --figaro-print-callout-color: #1a7f37; border-color: #a8dbb5; background: #eefbf0; }
  .figaro-print-callout-danger { --figaro-print-callout-color: #cf222e; border-color: #f2b8bd; background: #fff1f2; }
  .figaro-print-callout-example { --figaro-print-callout-color: #8250df; border-color: #d8c5f5; background: #f8f2ff; }
  table { border-collapse: collapse; width: 100%; break-inside: avoid; }
  th, td { border: 1px solid #d0d7de; padding: 8px 12px; vertical-align: top; }
  th { background: #f6f8fa; }
  img, svg { max-width: 100%; height: auto; }
  img[data-figaro-image-size] { object-fit: fill; }
  a { color: #0969da; }
  hr { border: 0; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
  .figaro-print-page-break { break-after: page; page-break-after: always; }
  hr.figaro-print-authored-page-break { height: 0; margin: 0; border: 0; }
  .figaro-print-cover { min-height: 70vh; display: grid; place-items: center; box-sizing: border-box; padding: 24mm 12mm; text-align: center; }
  .figaro-print-cover-inner { max-width: 680px; }
  .figaro-print-cover-kicker { margin: 0 0 1.2em; color: #57606a; font-size: .72em; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .figaro-print-cover-title { margin: 0; border: 0; font-size: 2.6em; line-height: 1.15; }
  .figaro-print-cover-subtitle { margin: 1em 0 0; color: #57606a; font-size: 1.2em; }
  .figaro-print-cover-meta { display: flex; justify-content: center; gap: .6em 1.2em; flex-wrap: wrap; margin-top: 2.6em; color: #57606a; }
  .figaro-print-cover-author, .figaro-print-cover-date { white-space: nowrap; }
  .figaro-print-toc { max-width: 720px; margin: 0 auto; padding: 6mm 0; }
  .figaro-print-toc-title { margin-top: 0; }
  .figaro-print-toc-list { margin: 0; padding: 0; list-style: none; }
  .figaro-print-toc li { margin: .45em 0; }
  .figaro-print-toc .figaro-toc-level-2 { margin-left: 1.25em; font-size: .95em; }
  .figaro-print-toc .figaro-toc-level-3 { margin-left: 2.5em; font-size: .9em; }
  .figaro-print-toc .figaro-toc-level-4 { margin-left: 3.75em; font-size: .88em; }
  .figaro-print-toc .figaro-toc-level-5 { margin-left: 5em; font-size: .86em; }
  .figaro-print-toc .figaro-toc-level-6 { margin-left: 6.25em; font-size: .84em; }
  .figaro-print-toc a { color: inherit; text-decoration: none; }
  .figaro-print-toc a.figaro-print-toc-entry { display: grid; grid-template-columns: minmax(0, auto) minmax(1.5em, 1fr) minmax(5ch, auto); align-items: end; gap: .35em; }
  .figaro-print-toc-label { min-width: 0; }
  .figaro-print-toc-leader { min-width: 1.5em; border-bottom: 1px dotted currentColor; opacity: .5; transform: translateY(-.28em); }
  .figaro-print-toc-page { min-width: 5ch; color: var(--figaro-page-number-color); font-family: var(--figaro-page-number-font); font-size: var(--figaro-page-number-size); text-align: right; }
  mark { background: #fff1a8; color: inherit; border-radius: 2px; padding: .05em .12em; }
  .katex-block { margin: 1.25em 0; overflow-x: auto; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .figaro-print-task-list { list-style: none; margin: 1em 0; padding-left: 0; }
  .figaro-print-task-item { list-style: none; }
  .figaro-print-task-checkbox { margin: 0 .5em 0 0; accent-color: #0969da; vertical-align: middle; }
  .figaro-print-task-label { vertical-align: middle; }
  .footnote-ref { font-size: .75em; line-height: 0; vertical-align: super; }
  .footnote-ref > a:first-child { text-decoration: none; }
  .footnotes-sep { margin: 2.5em 0 1em; }
  .footnotes { margin-top: 0; padding-top: 0; }
  .footnotes ol { padding-left: 1.5em; }
  .footnotes li { break-inside: avoid; page-break-inside: avoid; }
  .footnotes li + li { margin-top: .65em; }
  .footnote-backref { margin-left: .35em; text-decoration: none; white-space: nowrap; }
  .figaro-print-diagram { margin: 1.4em 0; break-inside: avoid; page-break-inside: avoid; }
  .figaro-print-diagram[data-figaro-height] { height: var(--figaro-diagram-height); }
  .figaro-print-diagram-content { width: 100%; height: 100%; }
  .figaro-print-diagram svg { display: block; max-width: 100%; max-height: 100%; margin: 0 auto; }
  @media print { .figaro-print-page-break { break-after: page !important; page-break-after: always !important; } }
`;

const pageNumberPrintCSS = `
  .figaro-print-cover { page: figaro-cover; }
  @page {
    @bottom-center {
      content: counter(page);
      color: var(--figaro-page-number-color);
      font-family: var(--figaro-page-number-font);
      font-size: var(--figaro-page-number-size);
    }
  }
  @page figaro-cover { @bottom-center { content: none; } }
`;

const printCalloutTypes = Object.freeze({
    note: 'Note',
    warning: 'Warning',
    info: 'Info',
    tip: 'Tip',
    danger: 'Danger',
    example: 'Example',
});

function frontmatterBoolean(value) {
    return /^(?:true|yes|on|1)$/i.test(String(value || '').trim());
}

export function pageNumbersEnabled(markdown) {
    return frontmatterBoolean(getFrontmatterValue(markdown, 'page-numbers'));
}

function frontmatterTOCDepth(value) {
    const depth = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(depth) ? Math.max(0, Math.min(6, depth)) : 0;
}

function trimLeadingTextNodes(element, characters) {
    let remaining = characters;
    const children = Array.from(element.childNodes);
    for (const child of children) {
        if (remaining <= 0) break;
        if (child.nodeType !== 3) continue;
        const value = child.nodeValue || '';
        const consumed = Math.min(remaining, value.length);
        child.nodeValue = value.slice(consumed);
        remaining -= consumed;
        if (!child.nodeValue) child.remove();
    }
}

/** Turn recognised Obsidian-style quoted callouts into printable callout blocks. */
function decoratePrintCallouts(container) {
    for (const quote of container.querySelectorAll('blockquote')) {
        const firstParagraph = Array.from(quote.children).find(child => child.tagName === 'P');
        if (!firstParagraph) continue;

        const match = firstParagraph.textContent.match(/^\s*\[!(note|warning|info|tip|danger|example)\](?:[ \t]+)?/i);
        if (!match) continue;

        const type = match[1].toLowerCase();
        quote.classList.add('figaro-print-callout', `figaro-print-callout-${type}`);
        quote.dataset.calloutType = type;
        quote.dataset.calloutLabel = printCalloutTypes[type];
        quote.setAttribute('aria-label', `${printCalloutTypes[type]} callout`);
        trimLeadingTextNodes(firstParagraph, match[0].length);
    }
}

function renderMarkdownBodyFromRendered(rendered, markdown = '') {
    if (typeof document === 'undefined') return { body: rendered, headings: [] };

    const template = document.createElement('template');
    template.innerHTML = rendered;
    for (const code of template.content.querySelectorAll('pre > code')) {
        code.classList.add('figaro-print-code');
        const plan = planPrintableCodeHighlight({
            source: code.textContent,
            classNames: code.classList,
            highlight: highlightCode,
        });
        if (!plan) continue;
        code.classList.add('hljs');
        code.dataset.highlightLanguage = plan.language;
        if (plan.detected) code.dataset.highlightDetected = 'true';
        code.innerHTML = plan.html;
    }
    decoratePrintCallouts(template.content);
    decorateMarkdownTables(template.content, { mergePlans: markdownTableMergePlans(markdown) });
    const headings = [];
    template.content.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(element => {
        const text = element.textContent.trim();
        const id = element.id;
        if (!text || !id) return;
        headings.push({ level: Number(element.tagName.slice(1)), text, id });
    });
    return { body: template.innerHTML, headings };
}

function renderCoverPage(markdown, fallbackTitle) {
    if (!frontmatterBoolean(getFrontmatterValue(markdown, 'cover-page'))) return '';

    const title = getFrontmatterValue(markdown, 'title') || fallbackTitle;
    const subtitle = getFrontmatterValue(markdown, 'subtitle') || getFrontmatterValue(markdown, 'description');
    const author = getFrontmatterValue(markdown, 'author');
    const date = getFrontmatterValue(markdown, 'date') || getFrontmatterValue(markdown, 'created');
    const metadata = [
        author ? `<span class="figaro-print-cover-author">${escapeHtml(author)}</span>` : '',
        date ? `<span class="figaro-print-cover-date">${escapeHtml(date)}</span>` : '',
    ].filter(Boolean).join('');

    return `<section class="figaro-print-cover figaro-print-page-break">
  <div class="figaro-print-cover-inner">
    <p class="figaro-print-cover-kicker">Figaro</p>
    <h1 class="figaro-print-cover-title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="figaro-print-cover-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    ${metadata ? `<div class="figaro-print-cover-meta">${metadata}</div>` : ''}
  </div>
</section>`;
}

function renderTableOfContents(headings, depth, includePageNumbers = false) {
    if (depth <= 0) return '';
    const entries = headings.filter(heading => heading.level <= depth);
    if (!entries.length) return '';

    const items = entries.map((heading, index) => {
        const href = `#${escapeHtml(heading.id)}`;
        if (!includePageNumbers) {
            return `<li class="figaro-toc-level-${heading.level}"><a href="${href}">${escapeHtml(heading.text)}</a></li>`;
        }
        return `<li class="figaro-toc-level-${heading.level}"><a class="figaro-print-toc-entry" href="${href}"><span class="figaro-print-toc-label">${escapeHtml(heading.text)}</span><span class="figaro-print-toc-leader" aria-hidden="true"></span><span class="figaro-print-toc-page" data-figaro-toc-index="${index}" aria-hidden="true">&nbsp;</span></a></li>`;
    }).join('');
    return `<nav class="figaro-print-toc figaro-print-page-break" aria-label="Table of contents"><h2 class="figaro-print-toc-title">Contents</h2><ol class="figaro-print-toc-list">${items}</ol></nav>`;
}

export function renderPrintableMarkdownFromRendered(markdown, title = 'Document', rendered = '') {
    const { body, headings } = renderMarkdownBodyFromRendered(rendered, markdown);
    const cover = renderCoverPage(markdown, title);
    const includePageNumbers = pageNumbersEnabled(markdown);
    const toc = renderTableOfContents(
        headings,
        frontmatterTOCDepth(getFrontmatterValue(markdown, 'toc-depth')),
        includePageNumbers,
    );
    const tocCount = includePageNumbers ? (toc.match(/data-figaro-toc-index=/g) || []).length : 0;
    return `<!doctype html>
<html lang="en"${includePageNumbers ? ` data-figaro-page-numbers="true" data-figaro-toc-count="${tocCount}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${defaultPrintCSS}</style>
${includePageNumbers ? `<style id="figaro-page-number-style">${pageNumberPrintCSS}</style>` : ''}
</head>
<body>${cover}${toc}<main class="figaro-print-document">${body}</main></body>
</html>`;
}

export function renderPrintableMarkdown(markdown, title = 'Document') {
    if (typeof window.markdownit !== 'function') {
        throw new Error('Markdown renderer is unavailable');
    }

    const renderer = createPrintMarkdownRenderer();
    // Properties are editor metadata rather than document body content. Keep
    // them out of the PDF while still using them to configure the stylesheet.
    const markdownBody = stripLeadingFrontmatter(markdown);
    return renderPrintableMarkdownFromRendered(
        markdown,
        title,
        renderer.render(stripMarkdownTableMergeMetadata(markdownBody)),
    );
}

function diagramLanguageFromCodeElement(codeElement) {
    for (const className of codeElement.classList) {
        if (!className.startsWith('language-')) continue;
        const language = className.slice('language-'.length).toLowerCase();
        if (isDiagramLanguage(language)) return language;
    }
    return '';
}

function makePrintableDiagram(printable, language, svg, sourceElement = null) {
    const figure = printable.createElement('figure');
    figure.className = 'figaro-print-diagram';
    figure.dataset.diagramLanguage = language;
    figure.setAttribute('role', 'img');
    figure.setAttribute('aria-label', language + ' diagram');
    const authoredHeight = language === 'mermaid'
        ? authoredMermaidDiagramHeight(sourceElement?.textContent || '')
        : null;
    if (authoredHeight) {
        figure.dataset.figaroHeight = String(authoredHeight);
        figure.style.setProperty('--figaro-diagram-height', `${authoredHeight}px`);
    }
    for (const attribute of ['data-figaro-source-start', 'data-figaro-source-end']) {
        const value = sourceElement?.getAttribute?.(attribute);
        if (value !== null && value !== undefined) figure.setAttribute(attribute, value);
    }

    const content = printable.createElement('div');
    content.className = 'figaro-print-diagram-content';
    content.innerHTML = svg;
    figure.appendChild(content);
    return figure;
}

/**
 * Replace recognised diagram code fences with their SVG equivalents for the
 * print-only document. Any unavailable or invalid renderer leaves the source
 * fence intact, which is much safer than omitting a user-authored diagram.
 */
export async function renderPrintableDiagrams(html) {
    if (typeof DOMParser === 'undefined') return html;

    const printable = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const codeBlocks = Array.from(printable.querySelectorAll('pre > code'));

    for (const codeElement of codeBlocks) {
        const pre = codeElement.parentElement;
        if (!pre || pre.children.length !== 1) continue;

        const language = diagramLanguageFromCodeElement(codeElement);
        if (!language) continue;

        try {
            const svg = await renderDiagramSVG(language, codeElement.textContent.trim(), 'figaro-print-diagram');
            if (typeof svg !== 'string' || !svg.trim()) continue;
            pre.replaceWith(makePrintableDiagram(printable, language, svg, codeElement));
        } catch (_) {
            // Preserve the original code block. The source remains printable
            // and gives the author a useful recovery path for invalid input.
        }
    }

    return '<!doctype html>\n' + printable.documentElement.outerHTML;
}

export async function renderPrintableMarkdownWithDiagrams(markdown, title = 'Document') {
    return renderPrintableDiagrams(renderPrintableMarkdown(markdown, title));
}

export async function exportMarkdownToPDF({ path, title, content }) {
    if (!path?.toLowerCase().endsWith('.md')) {
        throw new Error('PDF export is only available for Markdown files');
    }
    if (typeof backend().ExportPDF !== 'function') {
        throw new Error('Interactive PDF export is unavailable because the backend is not connected');
    }

    const documentTitle = title?.replace(/\.md$/i, '') || path.split('/').pop().replace(/\.md$/i, '') || 'Document';
    const html = await renderPrintableMarkdownWithDiagrams(content, documentTitle);
    const printStylesheet = getPrintStylesheet(content);
    statusBar.set(pageNumbersEnabled(content) ? 'Paginating interactive PDF…' : 'Preparing interactive PDF…');
    const result = await backend().ExportPDF(documentTitle, html, path, printStylesheet);
    if (!result?.success) {
        const error = new Error(result?.error || 'Could not export the interactive PDF');
        statusBar.set('PDF export failed');
        setTimeout(() => statusBar.set('Ready'), 3000);
        throw error;
    }
    if (result?.viewerError) {
        statusBar.set('PDF exported beside the note — open it manually');
        await pdfExportErrorDialog(new Error(result.viewerError), { exportedPath: result.path });
        setTimeout(() => statusBar.set('Ready'), 3000);
        return result;
    }
    statusBar.set('PDF exported beside the note — opened with your default viewer');
    setTimeout(() => statusBar.set('Ready'), 3000);
    return result;
}

export async function exportFileToPDF(path, title) {
    const activeTab = (getState('openTabs') || []).find(tab => tab.id === getState('activeTabId'));
    if (activeTab?.type === 'file' && activeTab.path === path && activeTab.dirty) {
        return exportMarkdownToPDF({ path, title: title || activeTab.title, content: getEditorContent() });
    }

    const file = await backend().ReadFile(path);
    if (!file || file.binary) {
        throw new Error('Markdown file could not be read');
    }
    return exportMarkdownToPDF({ path, title: title || path.split('/').pop(), content: file.content });
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value || '');
    return element.innerHTML;
}

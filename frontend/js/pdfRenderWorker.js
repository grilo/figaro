/*
 * The printable Markdown parse runs in a module worker so an open PDF preview
 * cannot compete with CodeMirror's input and layout work. Diagram conversion
 * deliberately remains in the document: Mermaid and Vega require DOM-backed
 * browser APIs and are already coalesced by the preview scheduler.
 */
import '/vendored/markdown-it/index.js';
import '/vendored/katex/dist/katex.min.js';
import { createPrintMarkdownRenderer } from '/vendored/markdown-it-plugins/index.js';
import { stripLeadingFrontmatter } from './frontmatter.js';

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error || 'Printable Markdown rendering failed');
}

self.addEventListener('message', event => {
    const { id, markdown } = event.data || {};
    if (!Number.isFinite(Number(id))) return;

    try {
        const renderer = createPrintMarkdownRenderer();
        const body = renderer.render(stripLeadingFrontmatter(String(markdown || '')));
        self.postMessage({ id, body });
    } catch (error) {
        self.postMessage({ id, error: errorMessage(error) });
    }
});

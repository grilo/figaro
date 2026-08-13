import { markdownDiagnostics } from '../markdownLint.js';
import { mermaidDocumentDiagnostic, mermaidLintBlocks } from '../core/mermaidLintModel.js';

/** Coordinate pure Markdown checks with the injected Mermaid parser boundary. */
export async function collectMarkdownDocumentDiagnostics(source, validateMermaid) {
    const text = String(source || '');
    const diagnostics = markdownDiagnostics(text);

    for (const block of mermaidLintBlocks(text)) {
        try {
            await validateMermaid(block.source);
        } catch (error) {
            diagnostics.push(mermaidDocumentDiagnostic(error, block));
        }
    }
    return diagnostics.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function createMarkdownDocumentLinter(validateMermaid) {
    if (typeof validateMermaid !== 'function') throw new TypeError('Mermaid validation port is required');
    return view => collectMarkdownDocumentDiagnostics(view.state.doc.toString(), validateMermaid);
}

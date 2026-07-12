/**
 * Context-aware completions for the leading YAML Properties block.
 *
 * Most entries are conventional note metadata. `print-stylesheet` is the one
 * Figaro-specific property: it controls the vault-local stylesheet used by the
 * live PDF preview and export flow.
 */

import { getFrontmatterRegionAt } from './frontmatter.js';

export const frontmatterProperties = [
    { label: 'title', detail: 'Note title', apply: 'title: ', type: 'property' },
    { label: 'subtitle', detail: 'Cover-page subtitle', apply: 'subtitle: ', type: 'property' },
    { label: 'author', detail: 'Cover-page author', apply: 'author: ', type: 'property' },
    { label: 'date', detail: 'Cover-page date', apply: 'date: ', type: 'property' },
    { label: 'aliases', detail: 'Alternative note names', apply: 'aliases:\n  - ', type: 'property' },
    { label: 'tags', detail: 'List of note tags', apply: 'tags:\n  - ', type: 'property' },
    { label: 'description', detail: 'Short note summary', apply: 'description: ', type: 'property' },
    { label: 'created', detail: 'Creation date (YYYY-MM-DD)', apply: 'created: ', type: 'property' },
    { label: 'updated', detail: 'Last-updated date (YYYY-MM-DD)', apply: 'updated: ', type: 'property' },
    { label: 'status', detail: 'draft, active, or archived', apply: 'status: ', type: 'property' },
    { label: 'cover-page', detail: 'Generate a PDF cover page', apply: 'cover-page: true', type: 'property', boost: 8 },
    { label: 'toc-depth', detail: 'PDF table of contents depth (0–6)', apply: 'toc-depth: 2', type: 'property', boost: 8 },
    {
        label: 'print-stylesheet',
        detail: 'Figaro PDF stylesheet',
        info: 'Vault-local .css path, relative to this note. Used by PDF preview and export; overrides sibling _print.css.',
        apply: 'print-stylesheet: ',
        type: 'property',
        boost: 10,
    },
];

const statusValues = ['draft', 'active', 'archived'];

function collectCSSFiles(items, files = []) {
    for (const item of items || []) {
        if (item?.type === 'file' && /\.css$/i.test(item.path || item.name || '')) {
            files.push(item.path || item.name);
        }
        if (item?.type === 'directory' && item.children) collectCSSFiles(item.children, files);
    }
    return files;
}

function relativePath(fromFile, targetFile) {
    const from = String(fromFile || '').replace(/\\/g, '/').split('/');
    from.pop();
    const target = String(targetFile || '').replace(/\\/g, '/').split('/');
    while (from.length && target.length && from[0] === target[0]) {
        from.shift();
        target.shift();
    }
    return [...from.map(() => '..'), ...target].join('/') || targetFile;
}

export function getRelativePrintStylesheets(fileTree, activeFilePath) {
    const cssPaths = collectCSSFiles(fileTree || [])
        .map(path => relativePath(activeFilePath || '', path))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    return [...new Set(cssPaths)];
}

function yamlScalar(value) {
    const normalized = String(value || '');
    return /[\s#:,[\]{}&*!|>'"%@`]/.test(normalized)
        ? `"${normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        : normalized;
}

function propertyCompletions(before, context) {
    const match = before.match(/^([A-Za-z0-9_.-]*)$/);
    if (!match) return null;
    if (!match[1] && !context.explicit) return null;
    return {
        from: context.pos - match[1].length,
        options: frontmatterProperties,
        validFor: /^[A-Za-z0-9_.-]*$/,
    };
}

function valueCompletions(before, context, getFileTree, getActiveFilePath) {
    const match = before.match(/^([A-Za-z0-9_.-]+)\s*:\s*([^\n]*)$/);
    if (!match) return null;

    const [, key, value] = match;
    const from = context.pos - value.length;
    if (key === 'status') {
        return {
            from,
            options: statusValues.map(label => ({ label, type: 'keyword' })),
            validFor: /^[A-Za-z-]*$/,
        };
    }
    if (key !== 'print-stylesheet') return null;

    const uniquePaths = getRelativePrintStylesheets(getFileTree?.() || [], getActiveFilePath?.() || '');
    const options = (uniquePaths.length ? uniquePaths : ['pdf.css']).map(path => ({
        label: path,
        detail: uniquePaths.length ? 'Vault CSS file' : 'Create from PDF layout',
        apply: yamlScalar(path),
        type: 'file',
    }));
    return {
        from,
        options,
        validFor: /^[^\n#]*$/,
    };
}

/**
 * Construct a CodeMirror completion source scoped to leading YAML frontmatter.
 * Getters keep the source current as the active note or file tree changes.
 */
export function createFrontmatterCompletionSource({ getFileTree, getActiveFilePath } = {}) {
    return context => {
        const source = context.state.doc.toString();
        const region = getFrontmatterRegionAt(source, context.pos);
        if (!region) return null;

        const line = context.state.doc.lineAt(context.pos);
        if (line.from < region.contentFrom || line.from >= region.contentTo) return null;
        const before = context.state.doc.sliceString(line.from, context.pos);
        if (/^[ \t]/.test(before)) return null;

        return valueCompletions(before, context, getFileTree, getActiveFilePath) ||
            propertyCompletions(before, context);
    };
}

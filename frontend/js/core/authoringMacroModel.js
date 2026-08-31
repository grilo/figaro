import { semanticDueDateLink } from './taskDueDateCompletionModel.js';

export const basicMarkdownTable = [
    '| Column 1 | Column 2 |',
    '| --- | --- |',
    '|  |  |',
].join('\n');

export const emptyMermaidBlock = '```mermaid\n\n```';

export const defaultDrawioMacroName = 'diagram1';

export const authoringMacros = Object.freeze([
    { name: 'due', detail: 'Choose a due date', action: 'due-date' },
    { name: 'table', detail: 'Insert a table and open its editor', action: 'table-editor' },
    { name: 'todo', detail: 'Start a task list', action: 'insert' },
    { name: 'mermaid', detail: 'Insert a diagram and open its editor', action: 'mermaid-editor' },
    { name: 'drawio', detail: 'Create a sibling Draw.io diagram', action: 'drawio-create' },
]);

export function drawioMacroNameError(value) {
    const name = String(value || '').trim();
    if (!name) return 'Enter a diagram name.';
    if (/[\\/]/u.test(name)) return 'Choose a name, not a path.';
    if (/^\.+$/u.test(name)) return 'Choose a name other than dots.';
    if (Array.from(name).some(character => character.charCodeAt(0) < 0x20)) {
        return 'The name contains an unsupported control character.';
    }
    const stem = name
        .replace(/\.drawio\.svg$/iu, '')
        .replace(/\.svg$/iu, '')
        .replace(/\.drawio$/iu, '')
        .trim();
    return stem ? '' : 'Enter a name before the .drawio.svg extension.';
}

export function drawioMacroFileName(value) {
    if (drawioMacroNameError(value)) return '';
    const name = String(value).trim();
    if (/\.drawio\.svg$/iu.test(name)) return name;
    return `${name.replace(/\.svg$/iu, '').replace(/\.drawio$/iu, '')}.drawio.svg`;
}

export function drawioMacroMarkdown(value) {
    const fileName = drawioMacroFileName(value);
    return fileName ? `![Diagram](./${encodeURIComponent(fileName)})` : '';
}

/** Match a whitespace-delimited Figaro macro at the caret. */
export function authoringMacroCompletionPlan(lineBeforeCaret) {
    const source = String(lineBeforeCaret || '');
    const match = source.match(/(?:^|\s)(@[a-z]*)$/i);
    if (!match) return null;

    const token = match[1];
    const prefix = token.slice(1).toLowerCase();
    const macros = authoringMacros.filter(macro => macro.name.startsWith(prefix));
    if (!macros.length) return null;
    return {
        fromOffset: source.length - token.length,
        token,
        macros,
    };
}

function trailingNewlineCount(text) {
    const match = String(text || '').match(/\n+$/u);
    return match ? match[0].length : 0;
}

function leadingNewlineCount(text) {
    const match = String(text || '').match(/^\n+/u);
    return match ? match[0].length : 0;
}

function blockInsertion(documentText, range, block, cursorInBlock = block.length) {
    const lineFrom = documentText.lastIndexOf('\n', Math.max(0, range.from - 1)) + 1;
    const nextLineBreak = documentText.indexOf('\n', range.to);
    const lineTo = nextLineBreak < 0 ? documentText.length : nextLineBreak;
    const beforeOnLine = documentText.slice(lineFrom, range.from);
    const afterOnLine = documentText.slice(range.to, lineTo);
    const leadingWhitespace = beforeOnLine.match(/[ \t]*$/u)?.[0].length || 0;
    const trailingWhitespace = afterOnLine.match(/^[ \t]*/u)?.[0].length || 0;
    const from = /^[ \t]*$/u.test(beforeOnLine) ? lineFrom : range.from - leadingWhitespace;
    const to = /^[ \t]*$/u.test(afterOnLine) ? lineTo : range.to + trailingWhitespace;
    const before = documentText.slice(0, from);
    const after = documentText.slice(to);
    const prefix = before.length ? '\n'.repeat(Math.max(0, 2 - trailingNewlineCount(before))) : '';
    const suffix = after.length ? '\n'.repeat(Math.max(0, 2 - leadingNewlineCount(after))) : '';
    return {
        from,
        to,
        insert: `${prefix}${block}${suffix}`,
        cursorOffset: prefix.length + cursorInBlock,
        targetOffset: prefix.length,
        targetLength: block.length,
    };
}

/**
 * Plan one atomic macro replacement without touching CodeMirror or opening UI.
 * Block macros add portable blank-line boundaries when surrounding prose exists.
 */
export function authoringMacroInsertionPlan(name, documentText, range, { date = '', drawioName = '' } = {}) {
    const source = String(documentText || '');
    const from = Math.max(0, Math.min(Number(range?.from) || 0, source.length));
    const to = Math.max(from, Math.min(Number(range?.to) || from, source.length));
    const boundedRange = { from, to };

    if (name === 'due') {
        const insert = semanticDueDateLink(date);
        if (!insert) return null;
        return {
            ...boundedRange,
            insert,
            cursorOffset: insert.length,
            targetOffset: 0,
            targetLength: insert.length,
        };
    }
    if (name === 'todo') return blockInsertion(source, boundedRange, '- [ ] ');
    if (name === 'table') return blockInsertion(source, boundedRange, basicMarkdownTable);
    if (name === 'mermaid') {
        return blockInsertion(
            source,
            boundedRange,
            emptyMermaidBlock,
            '```mermaid\n'.length,
        );
    }
    if (name === 'drawio') {
        const image = drawioMacroMarkdown(drawioName);
        return image ? blockInsertion(source, boundedRange, image) : null;
    }
    return null;
}

export const RICH_PASTE_MAX_HTML_CHARS = 1_000_000;
export const RICH_PASTE_MAX_DOM_NODES = 20_000;

/** Decide whether inert clipboard HTML carries structure worth converting. */
export function richClipboardDecision({
    htmlLength = 0,
    nodeCount = 0,
    semanticElementCount = 0,
    semanticStyleCount = 0,
    aiRepairCount = 0,
} = {}) {
    if (!htmlLength) return { convert: false, reason: 'no-html' };
    if (htmlLength > RICH_PASTE_MAX_HTML_CHARS) return { convert: false, reason: 'html-too-large' };
    if (nodeCount > RICH_PASTE_MAX_DOM_NODES) return { convert: false, reason: 'dom-too-large' };

    const evidence = semanticElementCount + semanticStyleCount + aiRepairCount;
    return evidence > 0
        ? { convert: true, reason: 'semantic-html', evidence }
        : { convert: false, reason: 'presentation-only-html', evidence: 0 };
}

/** Resolve every priority that does not require parsing or converting HTML. */
export function richPastePreflightPlan({
    internal = false,
    plainBypass = false,
    hasPlainText = false,
    image = false,
    markdown = false,
    protectedContext = false,
} = {}) {
    if (internal) return { action: 'native', reason: 'internal-markdown' };
    if (plainBypass) {
        return hasPlainText
            ? { action: 'plain', reason: 'plain-bypass' }
            : { action: 'native', reason: 'plain-bypass-unavailable' };
    }
    if (image) return { action: 'image', reason: 'clipboard-image' };
    if (!markdown) return { action: 'native', reason: 'non-markdown-file' };
    if (protectedContext) {
        return hasPlainText
            ? { action: 'plain', reason: 'protected-markdown-context' }
            : { action: 'native', reason: 'protected-markdown-context' };
    }
    return { action: 'inspect', reason: 'conversion-candidate' };
}

/** Keep the established clipboard behaviors in one explicit priority plan. */
export function richPastePlan(options = {}) {
    const preflight = richPastePreflightPlan(options);
    if (preflight.action !== 'inspect') return preflight;
    const { table = false, rich = false } = options;
    if (table) return { action: 'table', reason: 'high-confidence-table' };
    if (rich) return { action: 'rich', reason: 'semantic-html' };
    return { action: 'native', reason: 'plain-or-ambiguous' };
}

function trailingNewlineCount(text) {
    return String(text || '').match(/\n+$/)?.[0].length || 0;
}

function leadingNewlineCount(text) {
    return String(text || '').match(/^\n+/)?.[0].length || 0;
}

/** Add block boundaries without changing source outside the replaced range. */
export function richMarkdownInsertion(documentText, range, markdown, block = false) {
    const source = String(documentText ?? '');
    const from = Math.max(0, Math.min(Number(range?.from) || 0, source.length));
    const to = Math.max(from, Math.min(Number(range?.to) || from, source.length));
    const value = String(markdown ?? '');
    if (!block) return { insert: value, cursorOffset: value.length };

    const before = source.slice(0, from);
    const after = source.slice(to);
    const prefix = before.length ? '\n'.repeat(Math.max(0, 2 - trailingNewlineCount(before))) : '';
    const suffix = after.length ? '\n'.repeat(Math.max(0, 2 - leadingNewlineCount(after))) : '';
    return {
        insert: `${prefix}${value}${suffix}`,
        cursorOffset: prefix.length + value.length,
    };
}

/** Keep code-info strings portable and bounded before emitting a fence. */
export function normalizedCodeLanguage(value) {
    const language = String(value || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9.+#_-]{0,31}$/.test(language) ? language : '';
}

/** Emit a fence longer than every backtick run in the copied code. */
export function fencedCodeMarkdown(code, language = '') {
    const source = String(code ?? '')
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n');
    const longest = Math.max(0, ...Array.from(source.matchAll(/`+/g), match => match[0].length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const info = normalizedCodeLanguage(language);
    return `${fence}${info}\n${source}${source.endsWith('\n') ? '' : '\n'}${fence}`;
}

function mapInlineProse(source, transform) {
    let result = '';
    let prose = '';
    let codeRun = 0;
    const flush = () => {
        result += transform(prose);
        prose = '';
    };

    for (let index = 0; index < source.length;) {
        if (source[index] !== '`') {
            if (codeRun) result += source[index];
            else prose += source[index];
            index += 1;
            continue;
        }
        let end = index + 1;
        while (source[end] === '`') end += 1;
        const run = end - index;
        if (!codeRun) {
            flush();
            result += source.slice(index, end);
            codeRun = run;
        } else if (run === codeRun) {
            result += source.slice(index, end);
            codeRun = 0;
        } else result += source.slice(index, end);
        index = end;
    }
    flush();
    return result;
}

function mapOutsideFences(markdown, transform, options = {}) {
    const lines = String(markdown || '').split('\n');
    const result = [];
    let prose = [];
    let fence = null;
    const flush = () => {
        if (prose.length) {
            const value = prose.join('\n');
            result.push(...(options.inlineCode === false ? transform(value) : mapInlineProse(value, transform)).split('\n'));
        }
        prose = [];
    };

    for (const line of lines) {
        const opening = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/);
        const validOpening = opening
            && !(opening[1][0] === '`' && opening[2].includes('`'))
            && !(opening[1][0] === '~' && opening[2].includes('~'));
        if (!fence && validOpening) {
            flush();
            fence = { character: opening[1][0], length: opening[1].length };
            result.push(line);
            continue;
        }
        if (fence) {
            result.push(line);
            const closing = line.match(/^[ \t]{0,3}(`+|~+)[ \t]*$/);
            if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) fence = null;
            continue;
        }
        prose.push(line);
    }
    flush();
    return result.join('\n');
}

function escapedDelimiterAt(source, index, delimiter) {
    if (source[index] !== delimiter) return null;
    let start = index;
    while (start > 0 && source[start - 1] === '\\') start -= 1;
    const slashes = index - start;
    return slashes === 1 || slashes === 2 ? { start, end: index + 1 } : null;
}

function replaceEscapedDelimiterPairs(source, opening, closing, prefix, suffix) {
    let result = '';
    let copiedThrough = 0;
    let cursor = 0;
    while (cursor < source.length) {
        let open = null;
        for (; cursor < source.length; cursor += 1) {
            open = escapedDelimiterAt(source, cursor, opening);
            if (open) break;
        }
        if (!open) break;

        let close = null;
        let closingIndex = cursor + 1;
        for (; closingIndex < source.length; closingIndex += 1) {
            close = escapedDelimiterAt(source, closingIndex, closing);
            if (close) break;
        }
        if (!close) break;

        result += source.slice(copiedThrough, open.start);
        result += `${prefix}${source.slice(open.end, close.start)}${suffix}`;
        copiedThrough = close.end;
        cursor = close.end;
    }
    return result + source.slice(copiedThrough);
}

/** Repair paired AI-chat LaTeX delimiters while leaving every code form exact. */
export function convertAIChatMathDelimiters(markdown) {
    return mapOutsideFences(markdown, prose => {
        // Turndown escapes the single backslash used by AI-chat math markup,
        // so accept either its source or converted representation, but never
        // consume a prefix of a longer literal backslash run.
        const display = replaceEscapedDelimiterPairs(prose, '[', ']', '$$', '$$');
        return replaceEscapedDelimiterPairs(display, '(', ')', '$', '$');
    });
}

/** Expand only explicit collapsed backtick fences produced by rich clipboard HTML. */
export function expandCollapsedCodeFences(markdown) {
    const expand = (match, indent, language, body) => body.includes('```')
        ? match
        : `${indent}\`\`\`${normalizedCodeLanguage(language)}\n${indent}${body}\n${indent}\`\`\``;
    return mapOutsideFences(markdown, prose => prose
        .replace(
            /^([ \t]*)`+[ \t]+```([a-zA-Z0-9.+#_-]*)[ \t]+(.+?)[ \t]+```[ \t]+`+[ \t]*$/gm,
            expand,
        )
        .replace(
            /^([ \t]*)```([a-zA-Z0-9.+#_-]*)[ \t]+(.+?)[ \t]+```[ \t]*$/gm,
            expand,
        ), { inlineCode: false });
}

export function normalizeRichClipboardMarkdown(markdown) {
    const repaired = convertAIChatMathDelimiters(expandCollapsedCodeFences(String(markdown || '').trim()));
    return mapOutsideFences(repaired, prose => prose.replace(
        /^([ \t]*(?:[-+*]|\d+[.)]))[ \t]{2,}/gm,
        '$1 ',
    ));
}

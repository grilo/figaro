/**
 * Compact, source-preserving Markdown diff helpers for the History pane.
 * The output deliberately compares Markdown source rather than rendered HTML:
 * headings, lists, code fences, and frontmatter remain recognizable while a
 * revision is being judged before a possible restore.
 */

const MAX_LCS_CELLS = 240000;
const MAX_FALLBACK_LINES = 96;
const DIFF_CONTEXT_LINES = 2;

function linesFor(source) {
    const text = String(source ?? '');
    return text === '' ? [] : text.replace(/\r\n/g, '\n').split('\n');
}

export function markdownLineKind(line) {
    const text = String(line || '');
    if (/^#{1,6}\s/.test(text)) return 'heading';
    if (/^(?:[-*+] |\d+[.)] )/.test(text)) return 'list';
    if (/^\s*(```|~~~)/.test(text)) return 'code';
    if (/^---\s*$/.test(text)) return 'frontmatter';
    return 'text';
}

export function diffMarkdownLines(currentSource, historicalSource) {
    const current = linesFor(currentSource);
    const historical = linesFor(historicalSource);
    if (!current.length && !historical.length) return [];

    if (current.length * historical.length > MAX_LCS_CELLS) {
        return largeDocumentDiff(current, historical);
    }

    const lcs = Array.from(
        { length: historical.length + 1 },
        () => new Uint16Array(current.length + 1)
    );
    for (let historicalIndex = historical.length - 1; historicalIndex >= 0; historicalIndex--) {
        for (let currentIndex = current.length - 1; currentIndex >= 0; currentIndex--) {
            lcs[historicalIndex][currentIndex] = historical[historicalIndex] === current[currentIndex]
                ? lcs[historicalIndex + 1][currentIndex + 1] + 1
                : Math.max(lcs[historicalIndex + 1][currentIndex], lcs[historicalIndex][currentIndex + 1]);
        }
    }

    const entries = [];
    let historicalIndex = 0;
    let currentIndex = 0;
    while (historicalIndex < historical.length || currentIndex < current.length) {
        if (historicalIndex < historical.length && currentIndex < current.length && historical[historicalIndex] === current[currentIndex]) {
            entries.push(createEntry('context', historical[historicalIndex++]));
            currentIndex++;
        } else if (currentIndex < current.length && (historicalIndex === historical.length || lcs[historicalIndex][currentIndex + 1] >= lcs[historicalIndex + 1][currentIndex])) {
            entries.push(createEntry('added', current[currentIndex++]));
        } else {
            entries.push(createEntry('removed', historical[historicalIndex++]));
        }
    }
    return entries;
}

function largeDocumentDiff(current, historical) {
    let prefix = 0;
    while (prefix < current.length && prefix < historical.length && current[prefix] === historical[prefix]) prefix++;
    let suffix = 0;
    while (suffix < current.length - prefix && suffix < historical.length - prefix &&
        current[current.length - suffix - 1] === historical[historical.length - suffix - 1]) suffix++;

    const entries = [
        ...historical.slice(0, prefix).map(line => createEntry('context', line)),
        ...summarizeChangedLines('removed', historical.slice(prefix, historical.length - suffix)),
        ...summarizeChangedLines('added', current.slice(prefix, current.length - suffix)),
        ...historical.slice(historical.length - suffix).map(line => createEntry('context', line)),
    ];
    return entries;
}

function summarizeChangedLines(type, lines) {
    if (lines.length <= MAX_FALLBACK_LINES) return lines.map(line => createEntry(type, line));
    const retained = Math.floor(MAX_FALLBACK_LINES / 2);
    return [
        ...lines.slice(0, retained).map(line => createEntry(type, line)),
        { type: 'omitted', kind: 'text', text: `${lines.length - retained * 2} unchanged-scale ${type} lines omitted` },
        ...lines.slice(-retained).map(line => createEntry(type, line)),
    ];
}

function createEntry(type, text) {
    return { type, kind: markdownLineKind(text), text };
}

// Keep a comparison useful without turning the right pane into a second full
// editor. Every changed line is retained with a small surrounding hunk; long
// unchanged stretches collapse into one quiet separator.
export function excerptMarkdownDiff(entries, contextLines = DIFF_CONTEXT_LINES) {
    const changedIndexes = entries
        .map((entry, index) => entry.type === 'added' || entry.type === 'removed' || entry.type === 'omitted' ? index : -1)
        .filter(index => index >= 0);
    if (!changedIndexes.length) return [];

    const included = new Set();
    for (const index of changedIndexes) {
        const start = Math.max(0, index - contextLines);
        const end = Math.min(entries.length - 1, index + contextLines);
        for (let current = start; current <= end; current++) included.add(current);
    }

    const excerpt = [];
    let previous = -1;
    for (let index = 0; index < entries.length; index++) {
        if (!included.has(index)) continue;
        if (previous >= 0 && index > previous + 1) {
            excerpt.push({ type: 'gap', kind: 'text', text: 'Unchanged lines omitted' });
        }
        excerpt.push(entries[index]);
        previous = index;
    }
    return excerpt;
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

export function renderMarkdownDiff(currentSource, historicalSource) {
    const entries = diffMarkdownLines(currentSource, historicalSource);
    const added = entries.filter(entry => entry.type === 'added').length;
    const removed = entries.filter(entry => entry.type === 'removed').length;
    const excerpt = excerptMarkdownDiff(entries);
    return {
        added,
        removed,
        html: `<div class="history-diff-summary">${added} added · ${removed} removed</div><div class="history-diff-lines">${excerpt.map(entry => {
            const marker = entry.type === 'added' ? '+' : entry.type === 'removed' ? '−' : entry.type === 'gap' || entry.type === 'omitted' ? '…' : ' ';
            return `<div class="history-diff-line is-${entry.type} is-${entry.kind}"><span aria-hidden="true">${marker}</span><code>${escapeHtml(entry.text)}</code></div>`;
        }).join('')}</div>`,
    };
}

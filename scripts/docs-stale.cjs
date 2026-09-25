'use strict';

/**
 * Stale-documentation search. Finds every mention of a term in the living
 * documentation and prints each hit as one short line, so an audit does not
 * pull whole paragraphs or generated and historical files into view.
 */

// Historical records, generated output, vendored and fixture text are not
// updated when behavior changes.
const SKIPPED = [
    /^CHANGELOG\.md$/u,
    /^docs\/FEATURE_INDEX\.md$/u,
    /^docs\/benchmarks\//u,
    /(^|\/)node_modules\//u,
    /^frontend\/vendored\//u,
    /^third_party\//u,
    /^tests\/fixtures\//u,
    /^tools\//u,
];

function isLivingDoc(path) {
    return path.endsWith('.md') && !SKIPPED.some(pattern => pattern.test(path));
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** One `path:line: snippet` entry per matching line, trimmed around the first match. */
function staleDocHits(files, terms, { width = 160 } = {}) {
    const wanted = terms.map(term => String(term).trim()).filter(Boolean);
    if (!wanted.length) throw new Error('Give at least one term, for example: npm run docs:stale -- "old name"');
    const pattern = new RegExp(wanted.map(escapeRegExp).join('|'), 'iu');
    const hits = [];
    for (const { path, text } of files) {
        if (!isLivingDoc(path)) continue;
        text.split('\n').forEach((line, index) => {
            const match = pattern.exec(line);
            if (!match) return;
            const half = Math.max(20, Math.floor((width - match[0].length) / 2));
            const from = Math.max(0, match.index - half);
            const to = Math.min(line.length, match.index + match[0].length + half);
            const snippet = `${from > 0 ? '…' : ''}${line.slice(from, to).trim()}${to < line.length ? '…' : ''}`;
            hits.push(`${path}:${index + 1}: ${snippet}`);
        });
    }
    return hits;
}

module.exports = { isLivingDoc, staleDocHits };

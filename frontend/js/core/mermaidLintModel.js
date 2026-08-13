import { mermaidDiagnostic } from './mermaidEditorModel.js';

const fenceOpen = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const fenceClose = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function sourceLines(source) {
    const text = String(source || '');
    const lines = [];
    let from = 0;
    let number = 1;

    while (from <= text.length) {
        const newline = text.indexOf('\n', from);
        const to = newline < 0 ? text.length : newline;
        const raw = text.slice(from, to);
        lines.push({
            number,
            from,
            to,
            nextFrom: newline < 0 ? text.length : newline + 1,
            text: raw.endsWith('\r') ? raw.slice(0, -1) : raw,
        });
        if (newline < 0) break;
        from = newline + 1;
        number += 1;
    }
    return lines;
}

function parseOpener(line) {
    const match = line.text.match(fenceOpen);
    if (!match) return null;
    const info = match[2].trim();
    const language = info.split(/\s+/, 1)[0].toLowerCase();
    const markerIndex = line.text.indexOf(match[1]);
    const infoText = line.text.slice(markerIndex + match[1].length);
    const languageIndex = markerIndex + match[1].length + (infoText.match(/^\s*/)?.[0].length || 0);
    return {
        marker: match[1][0],
        length: match[1].length,
        language,
        languageFrom: line.from + languageIndex,
        languageTo: line.from + languageIndex + Math.max(language.length, 1),
    };
}

function parseCloser(line) {
    const match = line.text.match(fenceClose);
    return match ? { marker: match[1][0], length: match[1].length } : null;
}

/** Return complete Mermaid fence bodies and document offsets without parser or DOM effects. */
export function mermaidLintBlocks(source) {
    const text = String(source || '');
    const lines = sourceLines(text);
    const blocks = [];
    let open = null;

    for (const line of lines) {
        if (!open) {
            const opener = parseOpener(line);
            if (opener) open = { ...opener, contentFrom: line.nextFrom };
            continue;
        }

        const closer = parseCloser(line);
        if (!closer || closer.marker !== open.marker) continue;
        const closesNormally = closer.length >= open.length;
        const recoversMermaid = open.language === 'mermaid' && closer.length >= 3;
        if (!closesNormally && !recoversMermaid) continue;

        if (open.language === 'mermaid') {
            const contentTo = line.from;
            blocks.push({
                contentFrom: open.contentFrom,
                contentTo,
                languageFrom: open.languageFrom,
                languageTo: open.languageTo,
                source: text.slice(open.contentFrom, contentTo).replace(/\r?\n$/u, ''),
            });
        }
        open = null;
    }
    return blocks;
}

/** Map one Mermaid parser failure from fence-local positions into Markdown offsets. */
export function mermaidDocumentDiagnostic(error, block) {
    const local = mermaidDiagnostic(error, block?.source || '');
    const contentFrom = Number(block?.contentFrom) || 0;
    const contentTo = Number(block?.contentTo) || contentFrom;
    let from = Math.min(contentFrom + local.from, contentTo);
    let to = Math.min(contentFrom + local.to, contentTo);

    if (to <= from && contentTo > contentFrom) {
        from = Math.max(contentFrom, Math.min(from - 1, contentTo - 1));
        to = from + 1;
    } else if (to <= from) {
        from = Number(block?.languageFrom) || contentFrom;
        to = Math.max(from + 1, Number(block?.languageTo) || from + 1);
    }
    return { ...local, from, to };
}

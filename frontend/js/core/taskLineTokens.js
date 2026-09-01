import { isISODate } from './dueDateModel.js';

/** Editable inline tokens, never dates/tags inside code, images or other links. */
export function taskLineTokens(line) {
    const source = String(line);
    const tokens = [];
    const pattern = /\\.|(`+).*?\1|!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^\n)]*\)|<[^>\n]*>|https?:\/\/\S+|\d{4}-\d{2}-\d{2}|#[a-zA-Z][\w-]*/g;
    for (const match of source.matchAll(pattern)) {
        const text = match[0];
        const from = match.index;
        const to = from + text.length;
        const linked = /^\[\[(\d{4}-\d{2}-\d{2})(?:\.md)?(?:\|[^\]]*)?\]\]$/.exec(text)
            || /^\[[^\]]*\]\((\d{4}-\d{2}-\d{2})\.md\)$/.exec(text);
        if (linked && isISODate(linked[1])) {
            tokens.push({ from, to, kind: 'date-link', value: linked[1] });
        } else if (isISODate(text) && !/[\w/-]/.test(source[from - 1] || '') && !/[\w/-]/.test(source[to] || '')
            && !/^\.[a-zA-Z0-9]/.test(source.slice(to))) {
            tokens.push({ from, to, kind: 'date', value: text });
        } else if (/^#[a-zA-Z][\w-]*$/.test(text) && !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(text)
            && (!from || /\s/.test(source[from - 1])) && (to === source.length || /\s/.test(source[to]))) {
            tokens.push({ from, to, kind: 'tag', value: text.slice(1).toLowerCase() });
        }
    }
    return tokens;
}

export function calendarDateLink(date, style = 'markdown') {
    return style === 'wikilink' ? `[[${date}]]` : `[${date}](${date}.md)`;
}

/** Build the exact syntax inserted when a note is chosen from autocomplete. */
function encodeMarkdownPathSegment(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, character =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

const atxHeading = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const setextHeading = /^\s*(=+|-+)\s*$/;
const fence = /^\s*(`{3,}|~{3,})/;

/** Keep fragments aligned with the stable IDs used by printable Markdown. */
export function markdownHeadingSlug(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
}

/**
 * Return document-local heading targets without offering frontmatter or code
 * examples as destinations. Repeated headings follow Markdown-It's stable
 * `title`, `title-2`, `title-3` anchor sequence.
 */
export function markdownHeadingTargets(source) {
    const targets = [];
    const duplicates = new Map();
    const lines = String(source || '').split('\n');
    let inFrontmatter = lines[0]?.trim() === '---';
    let fenceCharacter = '';

    const add = text => {
        const label = String(text || '').trim();
        if (!label) return;
        const baseSlug = markdownHeadingSlug(label);
        const count = (duplicates.get(baseSlug) || 0) + 1;
        duplicates.set(baseSlug, count);
        targets.push({
            label,
            slug: count === 1 ? baseSlug : `${baseSlug}-${count}`,
        });
    };

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].replace(/\r$/, '');
        const trimmed = line.trim();
        if (inFrontmatter) {
            if (index > 0 && (trimmed === '---' || trimmed === '...')) inFrontmatter = false;
            continue;
        }
        const fenceMatch = line.match(fence);
        if (fenceMatch) {
            const character = fenceMatch[1][0];
            if (!fenceCharacter) fenceCharacter = character;
            else if (fenceCharacter === character) fenceCharacter = '';
            continue;
        }
        if (fenceCharacter) continue;

        const atx = line.match(atxHeading);
        if (atx) {
            add(atx[2]);
            continue;
        }
        const underline = lines[index + 1]?.replace(/\r$/, '').match(setextHeading);
        if (trimmed && underline) add(trimmed);
    }
    return targets;
}

export function noteLinkCompletion(style, note) {
    const label = String(note?.name || '').replace(/\.md$/i, '');
    const path = String(note?.path || '').replaceAll('\\', '/');
    if (style === 'wikilink' && !/[|\]\r\n]/.test(path) && !/[|\]\r\n]/.test(label)) {
        return `[[${path}|${label}]] `;
    }
    const markdownLabel = label.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
    const markdownPath = path.split('/').map(encodeMarkdownPathSegment).join('/');
    return `[${markdownLabel}](${markdownPath}) `;
}

/** Match either "[Wel" or "[[Wel" while leaving image syntax alone. */
export function noteLinkCompletionMatch(textBeforeCursor) {
    const text = String(textBeforeCursor || '');
    const match = text.match(/\[\[?([^[]*)$/);
    if (!match || match[1].includes(']') || text[match.index - 1] === '!') return null;
    return { fromOffset: match.index, prefix: match[1] };
}

/** Match a Markdown-link fragment being authored, for example `[Jump](#start`. */
export function headingLinkCompletionMatch(textBeforeCursor) {
    const text = String(textBeforeCursor || '');
    const match = text.match(/\]\(#([^\s()\\]*)$/);
    if (!match) return null;
    const openingBracket = text.lastIndexOf('[', match.index);
    if (openingBracket < 0 || text[openingBracket - 1] === '!') return null;
    return { fromOffset: match.index + 2, prefix: match[1] };
}

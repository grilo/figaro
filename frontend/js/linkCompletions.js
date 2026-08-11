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
function markdownHeadingReferences(source) {
    const targets = [];
    const duplicates = new Map();
    const lines = String(source || '').split('\n');
    let inFrontmatter = lines[0]?.trim() === '---';
    let fenceCharacter = '';
    let position = 0;

    const add = (text, from) => {
        const label = String(text || '').trim();
        if (!label) return;
        const baseSlug = markdownHeadingSlug(label);
        const count = (duplicates.get(baseSlug) || 0) + 1;
        duplicates.set(baseSlug, count);
        targets.push({
            label,
            slug: count === 1 ? baseSlug : `${baseSlug}-${count}`,
            from,
        });
    };

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = rawLine.replace(/\r$/, '');
        const trimmed = line.trim();
        if (inFrontmatter) {
            if (index > 0 && (trimmed === '---' || trimmed === '...')) inFrontmatter = false;
            position += rawLine.length + 1;
            continue;
        }
        const fenceMatch = line.match(fence);
        if (fenceMatch) {
            const character = fenceMatch[1][0];
            if (!fenceCharacter) fenceCharacter = character;
            else if (fenceCharacter === character) fenceCharacter = '';
            position += rawLine.length + 1;
            continue;
        }
        if (fenceCharacter) {
            position += rawLine.length + 1;
            continue;
        }

        const atx = line.match(atxHeading);
        if (atx) {
            add(atx[2], position);
        } else {
            const underline = lines[index + 1]?.replace(/\r$/, '').match(setextHeading);
            if (trimmed && underline) add(trimmed, position);
        }
        position += rawLine.length + 1;
    }
    return targets;
}

export function markdownHeadingTargets(source) {
    return markdownHeadingReferences(source).map(({ label, slug }) => ({ label, slug }));
}

/** Resolve a same-document `#fragment` to its exact heading source offset. */
export function markdownHeadingPosition(source, fragment) {
    let slug = String(fragment || '').trim().replace(/^#/, '');
    try { slug = decodeURIComponent(slug); } catch (_) { /* keep the source spelling */ }
    if (!slug) return null;
    return markdownHeadingReferences(source).find(target => target.slug === slug)?.from ?? null;
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

export function planLinkedNoteCompletion({ label, currentPath = '', style = 'markdown' } = {}) {
    const displayLabel = String(label || '').trim();
    if (!displayLabel || /[\\/]/.test(displayLabel) || /^\.+$/.test(displayLabel)
        || Array.from(displayLabel).some(character => character.charCodeAt(0) < 0x20)) {
        return null;
    }
    const fileName = /\.md$/i.test(displayLabel) ? displayLabel : `${displayLabel}.md`;
    const title = fileName.slice(0, -3);
    const normalizedCurrentPath = String(currentPath || '').replaceAll('\\', '/');
    const separator = normalizedCurrentPath.lastIndexOf('/');
    const parentDirectory = separator >= 0 ? normalizedCurrentPath.slice(0, separator) : '';
    const path = parentDirectory ? `${parentDirectory}/${fileName}` : fileName;
    return {
        label: title,
        fileName,
        parentDirectory,
        path,
        content: `# ${title}\n\n`,
        style: style === 'wikilink' ? 'wikilink' : 'markdown',
    };
}

export function linkedNoteCompletionInsertion(plan, path = plan?.path) {
    if (!plan || !path) return '';
    const fileName = String(path).split('/').pop() || plan.fileName;
    return noteLinkCompletion(plan.style, { name: fileName, path });
}

export function shouldOfferLinkedNoteCreation(plan, notes) {
    if (!plan) return false;
    const wanted = plan.path.toLowerCase();
    return !(Array.isArray(notes) ? notes : []).some(note =>
        String(note?.path || '').replaceAll('\\', '/').toLowerCase() === wanted);
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

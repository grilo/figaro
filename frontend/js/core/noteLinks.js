function conventionalMarkdownLinkAtPosition(line, column) {
    const source = String(line || '');
    const position = Number(column);
    if (!Number.isInteger(position) || position < 0) return null;

    const links = /\[([^\]\r\n]+)\]\(([^)\r\n]*)\)/g;
    let match;
    while ((match = links.exec(source)) !== null) {
        if (match.index > 0 && source[match.index - 1] === '!') continue;
        const linkEnd = match.index + match[0].length;
        if (position < match.index || position > linkEnd) continue;
        const destinationOffset = match[0].indexOf('(') + 1;
        const destinationFrom = match.index + destinationOffset;
        return {
            linkFrom: match.index,
            label: match[1],
            target: match[2],
            destinationFrom,
            destinationTo: destinationFrom + match[2].length,
        };
    }
    return null;
}

// Return the destination range of the conventional Markdown link covering a
// position on one source line. Images are deliberately excluded.
export function markdownLinkDestinationAtPosition(line, column) {
    const link = conventionalMarkdownLinkAtPosition(line, column);
    if (!link) return null;
    return {
        label: link.label,
        target: link.target,
        destinationFrom: link.destinationFrom,
        destinationTo: link.destinationTo,
    };
}

/**
 * Classify an editor click that may navigate either a conventional Markdown
 * link or a standalone Kanban hashtag. Complete links win over hashtag-shaped
 * destinations such as `[Jump](#section)`.
 */
export function markdownEditorNavigationAtPosition(line, column) {
    const source = String(line || '');
    const position = Number(column);
    if (!Number.isInteger(position) || position < 0) return null;

    const link = conventionalMarkdownLinkAtPosition(source, position);
    if (link && position >= link.linkFrom && position <= link.destinationTo) {
        return {
            kind: 'link',
            label: link.label,
            target: link.target,
            destinationFrom: link.destinationFrom,
            destinationTo: link.destinationTo,
        };
    }

    const hashtags = /(?<!\w)(?<!#)#([a-zA-Z][a-zA-Z0-9_-]*)\b/g;
    let match;
    while ((match = hashtags.exec(source)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        const previous = from > 0 ? source[from - 1] : '';
        const next = to < source.length ? source[to] : '';
        if ((previous && !/\s/.test(previous)) || (next && !/\s/.test(next))) continue;
        if (position >= from && position <= to) {
            return { kind: 'hashtag', tag: match[1].toLowerCase() };
        }
    }
    return null;
}

export function encodeMarkdownLinkTarget(path) {
    return String(path || '').replaceAll(' ', '%20');
}

export function normalizeMarkdownReferenceLabel(label) {
    return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Parse the three CommonMark reference-link forms without treating a normal
// inline link, image, footnote, task checkbox, or wikilink as a reference.
export function markdownReferenceLink(source) {
    const text = String(source || '');
    const match = text.match(/^\[([^\]\r\n]+)\](?:\[([^\]\r\n]*)\])?$/);
    if (!match || match[1].startsWith('[') || match[1].startsWith('^')) return null;
    const label = match[1].trim();
    if (!label || /^[ xX]$/.test(label)) return null;
    const reference = match[2] === undefined || match[2] === '' ? label : match[2].trim();
    if (!reference) return null;
    return {
        label,
        reference,
        key: normalizeMarkdownReferenceLabel(reference),
    };
}

export function markdownReferenceDefinition(source) {
    const text = String(source || '');
    const match = text.match(/^ {0,3}\[([^\]\r\n]+)\]:[ \t]*(?:<([^>\r\n]+)>|([^\s\r\n]+))/);
    if (!match) return null;
    const label = match[1].trim();
    const target = match[2] || match[3] || '';
    if (!label || !target) return null;
    return {
        label,
        target,
        key: normalizeMarkdownReferenceLabel(label),
    };
}

export function markdownReferenceDefinitions(document) {
    const definitions = new Map();
    const lines = String(document || '').split(/\r?\n/);
    let fenceCharacter = '';
    let inFrontmatter = lines[0]?.trim() === '---';
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const trimmed = line.trim();
        if (inFrontmatter) {
            if (index > 0 && (trimmed === '---' || trimmed === '...')) inFrontmatter = false;
            continue;
        }
        const fence = line.match(/^\s*(`{3,}|~{3,})/);
        if (fence) {
            const character = fence[1][0];
            if (!fenceCharacter) fenceCharacter = character;
            else if (fenceCharacter === character) fenceCharacter = '';
            continue;
        }
        if (fenceCharacter) continue;
        const definition = markdownReferenceDefinition(line);
        if (definition && !definitions.has(definition.key)) definitions.set(definition.key, definition.target);
    }
    return definitions;
}

export function resolveMarkdownReferenceLink(source, definitions) {
    const link = markdownReferenceLink(source);
    if (!link) return null;
    const target = definitions instanceof Map
        ? definitions.get(link.key)
        : definitions?.[link.key];
    return target ? { ...link, target } : null;
}

// Revalidate the clicked source range before planning an editor transaction;
// a modal response must never overwrite text that changed in the meantime.
export function planMarkdownLinkTargetReplacement(document, edit, existingPath) {
    const source = String(document || '');
    const from = Number(edit?.from);
    const to = Number(edit?.to);
    const expectedTarget = String(edit?.target ?? '');
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.length) {
        return null;
    }
    if (source.slice(from, to) !== expectedTarget) return null;
    return { from, to, insert: encodeMarkdownLinkTarget(existingPath) };
}

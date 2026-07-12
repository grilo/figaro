/**
 * Small, deliberately conservative parser for leading YAML frontmatter.
 *
 * Figaro preserves frontmatter verbatim. We only need enough structure to show
 * a useful Properties summary and read scalar configuration values such as
 * `print-stylesheet`, so complex YAML remains untouched rather than being
 * parsed and re-serialized by the editor.
 */

const OPENING_BOUNDARY_RE = /^---[ \t]*$/;
const CLOSING_BOUNDARY_RE = /^(?:---|\.\.\.)[ \t]*$/;
const PROPERTY_RE = /^([A-Za-z0-9][A-Za-z0-9_.-]*)[ \t]*:[ \t]*(.*)$/;
const SINGLE_QUOTE = String.fromCharCode(39);

function lineEnd(source, from) {
    const newline = source.indexOf('\n', from);
    return newline === -1 ? source.length : newline;
}

function lineText(source, from, to) {
    const text = source.slice(from, to);
    return text.endsWith('\r') ? text.slice(0, -1) : text;
}

function nextLineStart(source, end) {
    return end < source.length ? end + 1 : source.length;
}

function inlineCommentIndex(value) {
    let quote = null;
    let escaped = false;

    for (let index = 0; index < value.length; index++) {
        const character = value[index];
        if (quote === '"' && character === '\\' && !escaped) {
            escaped = true;
            continue;
        }
        if (character === quote && !escaped) {
            quote = null;
        } else if (!quote && (character === '"' || character === SINGLE_QUOTE)) {
            quote = character;
        } else if (!quote && character === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
            return index;
        }
        escaped = false;
    }
    return -1;
}

function stripInlineComment(value) {
    const index = inlineCommentIndex(value);
    return (index === -1 ? value : value.slice(0, index)).trimEnd();
}

export function parseFrontmatterScalar(value) {
    const scalar = stripInlineComment(String(value || '').trim());
    if (!scalar || scalar === '|' || scalar === '>' || scalar === 'null' || scalar === '~') return '';

    if (scalar.length >= 2 && scalar[0] === '"' && scalar.at(-1) === '"') {
        try {
            return JSON.parse(scalar);
        } catch (_) {
            return scalar.slice(1, -1);
        }
    }
    if (scalar.length >= 2 && scalar[0] === SINGLE_QUOTE && scalar.at(-1) === SINGLE_QUOTE) {
        return scalar.slice(1, -1).replace(/''/g, SINGLE_QUOTE);
    }
    return scalar;
}

function parseEntries(content) {
    const entries = [];
    for (const rawLine of content.split(/\r?\n/)) {
        // Top-level scalar keys are enough for the compact summary. Nested
        // YAML remains visible when the user opens the source to edit it.
        if (/^[ \t]/.test(rawLine) || /^\s*#/.test(rawLine)) continue;
        const match = rawLine.match(PROPERTY_RE);
        if (!match) continue;
        entries.push({ key: match[1], value: parseFrontmatterScalar(match[2]) });
    }
    return entries;
}

function findLeadingFrontmatter(source) {
    const text = String(source || '');
    const openingFrom = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
    const openingEnd = lineEnd(text, openingFrom);
    if (!OPENING_BOUNDARY_RE.test(lineText(text, openingFrom, openingEnd))) return null;

    const contentFrom = nextLineStart(text, openingEnd);
    let from = contentFrom;
    while (from < text.length) {
        const end = lineEnd(text, from);
        if (CLOSING_BOUNDARY_RE.test(lineText(text, from, end))) {
            return {
                from: 0,
                to: nextLineStart(text, end),
                contentFrom,
                contentTo: from,
                closed: true,
            };
        }
        from = nextLineStart(text, end);
    }

    // While a user is still creating the frontmatter, keep the region open
    // through EOF so completion can assist with its first properties.
    return { from: 0, to: text.length, contentFrom, contentTo: text.length, closed: false };
}

/** Return a leading frontmatter region only when `position` is in its YAML. */
export function getFrontmatterRegionAt(source, position) {
    const text = String(source || '');
    const region = findLeadingFrontmatter(text);
    if (!region) return null;
    const pos = Math.max(0, Math.min(Number(position) || 0, text.length));
    const inside = pos >= region.contentFrom &&
        (pos < region.contentTo || (!region.closed && pos === region.contentTo));
    return inside ? region : null;
}

/**
 * Return the leading, closed YAML frontmatter block, or null when a Markdown
 * document has no complete frontmatter block. Positions are CodeMirror-safe
 * JavaScript string offsets.
 */
export function parseFrontmatter(source) {
    const text = String(source || '');
    const region = findLeadingFrontmatter(text);
    if (!region?.closed) return null;
    return {
        ...region,
        entries: parseEntries(text.slice(region.contentFrom, region.contentTo)),
    };
}

/** Whether the document starts with a complete or currently-being-edited YAML block. */
export function hasLeadingFrontmatter(source) {
    return Boolean(findLeadingFrontmatter(source));
}

export function getFrontmatterValue(source, key) {
    const frontmatter = parseFrontmatter(source);
    if (!frontmatter) return '';
    return frontmatter.entries.find(entry => entry.key === key)?.value || '';
}

export function getPrintStylesheet(source) {
    return getFrontmatterValue(source, 'print-stylesheet');
}

export function stripLeadingFrontmatter(source) {
    const text = String(source || '');
    const frontmatter = parseFrontmatter(text);
    return frontmatter ? text.slice(frontmatter.to) : text;
}

function lineEndingFor(source) {
    return String(source || '').includes('\r\n') ? '\r\n' : '\n';
}

function firstH1Title(source) {
    let inCodeFence = false;
    const codeFence = String.fromCharCode(96).repeat(3);

    for (const line of String(source || '').split(/\r?\n/)) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith(codeFence) || trimmed.startsWith('~~~')) {
            inCodeFence = !inCodeFence;
            continue;
        }
        if (inCodeFence) continue;

        const match = line.match(/^ {0,3}#(?!#)\s+(.+?)(?:\s+#+)?\s*$/);
        if (match) return match[1].trim();
    }
    return '';
}

function localDateString() {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
}

function scalarOrEmptyString(value) {
    return formatFrontmatterScalar(value) || '""';
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Serialize a one-line scalar without reformatting unrelated YAML. */
export function formatFrontmatterScalar(value) {
    const scalar = String(value ?? '').trim();
    if (!scalar) return '';
    return /^[A-Za-z0-9_./:-]+$/.test(scalar) ? scalar : JSON.stringify(scalar);
}

/**
 * Produce a CodeMirror change spec that updates or appends one top-level
 * scalar property while leaving every other frontmatter line byte-for-byte
 * intact. Returns null if there is no complete frontmatter block.
 */
export function frontmatterPropertyChange(source, key, value) {
    if (!PROPERTY_RE.test(`${key}: value`)) return null;
    const text = String(source || '');
    const frontmatter = parseFrontmatter(text);
    if (!frontmatter) return null;

    const content = text.slice(frontmatter.contentFrom, frontmatter.contentTo);
    const propertyLine = new RegExp(`^(${escapeRegExp(key)}[ \\t]*:)(.*?)(\\r?\\n|$)`, 'm');
    const match = propertyLine.exec(content);
    const lineEnding = lineEndingFor(text);
    const serialized = `${key}: ${formatFrontmatterScalar(value)}`;

    if (match) {
        const original = match[0];
        const existingValue = match[2];
        const commentStart = inlineCommentIndex(existingValue);
        const valueSpacing = existingValue.match(/^[ \t]*/)?.[0] || ' ';
        const commentSpacing = commentStart === -1
            ? ''
            : (existingValue.slice(0, commentStart).match(/[ \t]*$/)?.[0] || '');
        const comment = commentStart === -1 ? '' : existingValue.slice(commentStart);
        const ending = match[3];
        return {
            from: frontmatter.contentFrom + match.index,
            to: frontmatter.contentFrom + match.index + original.length,
            insert: `${match[1]}${valueSpacing}${formatFrontmatterScalar(value)}${commentSpacing}${comment}${ending}`,
        };
    }

    return {
        from: frontmatter.contentTo,
        to: frontmatter.contentTo,
        insert: serialized + lineEnding,
    };
}

/**
 * Create a leading YAML skeleton with useful PDF-export defaults. The caller
 * supplies the OS username; title and date are derived locally so this helper
 * remains deterministic in tests when those values are passed explicitly.
 * A custom print stylesheet is deliberately opt-in: PDF export uses the
 * built-in style until the author creates or selects a vault-local CSS file.
 */
export function frontmatterTemplateChange(source, defaults = {}) {
    const text = String(source || '');
    const lineEnding = lineEndingFor(text);
    const title = defaults.title ?? firstH1Title(text);
    const author = defaults.author ?? '';
    const date = defaults.date ?? localDateString();
    const template = [
        '---',
        `title: ${scalarOrEmptyString(title)}`,
        'subtitle: ""',
        `author: ${scalarOrEmptyString(author)}`,
        `date: ${formatFrontmatterScalar(date)}`,
        'cover-page: false',
        'toc-depth: 0',
        '---',
        '',
    ].join(lineEnding);
    return {
        from: 0,
        to: 0,
        insert: template + (text ? lineEnding : ''),
    };
}

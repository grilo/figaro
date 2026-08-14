const headingPattern = /^(?:ATX|Setext)Heading([1-6])$/;
export const MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH = 16;
const fencedCodeGuidePattern = new RegExp(
    `^[a-z0-9][a-z0-9.+#_-]{0,${MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH - 1}}$`,
);

export function markdownHeadingLevel(nodeName) {
    const match = headingPattern.exec(String(nodeName || ''));
    return match ? Number(match[1]) : null;
}

export function fencedCodeGuideLabel(info) {
    const firstToken = String(info || '').trim().split(/\s+/, 1)[0]
        .replace(/^\{\./, '')
        .replace(/\}$/, '')
        .toLowerCase();
    return fencedCodeGuidePattern.test(firstToken) ? firstToken : 'code';
}

export function markdownBlockGuideKind({ name, info = '' } = {}) {
    const headingLevel = markdownHeadingLevel(name);
    if (headingLevel) return `h${headingLevel}`;

    switch (name) {
    case 'FencedCode':
        return fencedCodeGuideLabel(info);
    case 'Table':
        return 'table';
    default:
        return null;
    }
}

export function markdownBlockGuidePlan(descriptor) {
    const level = markdownHeadingLevel(descriptor?.name);
    const label = markdownBlockGuideKind(descriptor);
    if (!label) return null;
    return {
        label,
        level,
        type: level ? 'heading' : descriptor.name === 'FencedCode' ? 'code' : 'table',
        rangeStrategy: level ? 'heading-section' : 'block-after-first-line',
    };
}

export function leadingFrontmatterEnd(source) {
    const text = String(source ?? '');
    if (!/^---[ \t]*(?:\r?\n|$)/.test(text)) return 0;
    const closing = /\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/g;
    closing.lastIndex = text.indexOf('\n') + 1;
    const match = closing.exec(text);
    if (!match) return 0;
    const lineEnd = text.indexOf('\n', match.index + match[0].length);
    return lineEnd < 0 ? text.length : lineEnd + 1;
}

const headingPattern = /^(?:ATX|Setext)Heading([1-6])$/;

export function markdownHeadingLevel(nodeName) {
    const match = headingPattern.exec(String(nodeName || ''));
    return match ? Number(match[1]) : null;
}

export function markdownBlockGuideKind({ name, source = '', info = '' } = {}) {
    const headingLevel = markdownHeadingLevel(name);
    if (headingLevel) return `h${headingLevel}`;

    const text = String(source).trimStart();
    switch (name) {
    case 'BulletList':
    case 'OrderedList':
        return /^(?:[-+*]|\d+[.)])\s+\[[ xX]\]/m.test(text) ? 'task' : 'list';
    case 'Blockquote':
        return /^>\s*\[!/m.test(text) ? 'callout' : 'quote';
    case 'FencedCode': {
        const language = String(info).trim().toLowerCase();
        if (language === 'mermaid') return 'mermaid';
        if (language === 'vega' || language === 'vega-lite') return 'chart';
        return 'code';
    }
    case 'CodeBlock':
        return 'code';
    case 'Table':
        return 'table';
    case 'HorizontalRule':
        return 'rule';
    case 'HTMLBlock':
        return 'html';
    case 'Paragraph':
        if (/^!\[/.test(text)) return 'image';
        if (/^\$\$/.test(text)) return 'math';
        return 'raw';
    case 'Frontmatter':
        return 'raw';
    default:
        return 'raw';
    }
}

export function markdownBlockGuidePlan(descriptor) {
    const level = markdownHeadingLevel(descriptor?.name);
    return {
        label: markdownBlockGuideKind(descriptor),
        level,
        rangeStrategy: level ? 'heading-section' : 'whole-block',
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

export const MAX_MERMAID_SOURCE_LENGTH = 50_000;

function leadingMermaidFrontmatter(source) {
    const lines = String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines[0]?.trim() !== '---') return '';

    const closingLine = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (closingLine < 0) return '';
    return lines.slice(1, closingLine).join('\n');
}

function containsOrderedMapTag(frontmatter) {
    const decoded = frontmatter.replace(/%([0-9a-f]{2})/gi, (_match, hex) => (
        String.fromCharCode(Number.parseInt(hex, 16))
    ));
    const normalized = decoded.toLowerCase();
    return normalized.includes('tag:yaml.org,2002:omap')
        || /(?:^|[\s[\]{},:])!!omap(?=$|[\s[\]{},])/.test(normalized)
        || /(?:^|[\s[\]{},:])![a-z-]+!omap(?=$|[\s[\]{},])/.test(normalized);
}

/**
 * Decide whether Mermaid source may reach the vendored parser. Mermaid's own
 * 50,000-character ceiling is applied after YAML frontmatter parsing, so the
 * same limit must be enforced before that parser runs.
 */
export function planMermaidSourceRender(source, maxLength = MAX_MERMAID_SOURCE_LENGTH) {
    const code = String(source || '');
    const safeLimit = Math.max(0, Math.floor(Number(maxLength) || 0));

    if (code.length > safeLimit) {
        return {
            action: 'preserve-source',
            reason: 'source-too-large',
            maxLength: safeLimit,
        };
    }

    const frontmatter = leadingMermaidFrontmatter(code);
    if (containsOrderedMapTag(frontmatter)) {
        return {
            action: 'preserve-source',
            reason: 'unsafe-yaml-ordered-map',
            maxLength: safeLimit,
        };
    }

    return {
        action: 'render',
        reason: null,
        maxLength: safeLimit,
    };
}

const HEADING = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const SETEXT = /^\s*(=+|-+)\s*$/;

/**
 * Return source positions for Markdown headings while deliberately ignoring
 * frontmatter and fenced code.
 */
export function extractOutlineHeadings(source) {
    const text = String(source ?? '');
    const headings = [];
    let inFence = false;
    let fenceCharacter = '';
    let inFrontmatter = text.split('\n')[0]?.trim() === '---';
    let position = 0;
    const lines = text.split('\n');

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        const trimmed = line.trim();
        if (inFrontmatter) {
            if (index > 0 && (trimmed === '---' || trimmed === '...')) inFrontmatter = false;
            position += rawLine.length + 1;
            continue;
        }
        const fence = line.match(FENCE);
        if (fence) {
            const character = fence[1][0];
            if (!inFence) {
                inFence = true;
                fenceCharacter = character;
            } else if (character === fenceCharacter) {
                inFence = false;
                fenceCharacter = '';
            }
            position += rawLine.length + 1;
            continue;
        }

        if (!inFence) {
            const match = line.match(HEADING);
            if (match) {
                headings.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    from: position,
                });
            } else {
                const next = lines[index + 1] || '';
                const underline = next.endsWith('\r') ? next.slice(0, -1) : next;
                const setext = underline.match(SETEXT);
                if (trimmed && setext) {
                    headings.push({
                        level: setext[1][0] === '=' ? 1 : 2,
                        text: trimmed,
                        from: position,
                    });
                }
            }
        }
        position += rawLine.length + 1;
    }
    return headings;
}

/** Return the heading whose section contains a CodeMirror document position. */
export function activeOutlineHeadingIndex(headings, position) {
    if (!Array.isArray(headings) || !headings.length || position < headings[0].from) return -1;
    let low = 0;
    let high = headings.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (headings[middle].from <= position) low = middle + 1;
        else high = middle - 1;
    }
    return high;
}

/** Return every active ancestor, including the current heading. */
export function activeOutlineHeadingHierarchy(headings, position) {
    const activeIndex = activeOutlineHeadingIndex(headings, position);
    if (activeIndex < 0) return [];
    const hierarchy = [];
    for (let index = 0; index <= activeIndex; index += 1) {
        const heading = headings[index];
        while (hierarchy.length && hierarchy[hierarchy.length - 1].level >= heading.level) {
            hierarchy.pop();
        }
        hierarchy.push(heading);
    }
    return hierarchy;
}

/**
 * Resolve the source position immediately beneath the sticky stack boundary.
 * A boundary in the padding above a line still belongs to the preceding
 * source position; crossing the line's top activates that line.
 */
export function stickyHeadingBoundaryPosition(boundaryHeight, lineBlock) {
    if (!Number.isFinite(boundaryHeight)
        || !Number.isInteger(lineBlock?.from)
        || !Number.isFinite(lineBlock?.top)) return -1;
    return boundaryHeight >= lineBlock.top ? lineBlock.from : lineBlock.from - 1;
}

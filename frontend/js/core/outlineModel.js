const HEADING = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const SETEXT = /^\s*(=+|-+)\s*$/;

/** Ordinary single-line prose edits can only shift existing heading offsets. */
export function outlineEditNeedsParse({ beforeLine, afterLine, beforeNextLine = '', afterNextLine = '' }) {
    const special = line => /[\r\n]/u.test(line)
        || /^\s*(?:#|`{3,}|~{3,}|(?:=+|-+)\s*$|\.\.\.\s*$)/u.test(line);
    return special(beforeLine) || special(afterLine)
        || SETEXT.test(beforeNextLine) || SETEXT.test(afterNextLine);
}

/** Map untouched headings through sorted, non-overlapping source changes. */
export function mapOutlineHeadings(headings, changes) {
    return headings.map(heading => {
        let from = heading.from;
        for (const change of changes) {
            if (change.to <= heading.from) from += change.insertedLength - (change.to - change.from);
        }
        return from === heading.from ? heading : { ...heading, from };
    });
}

export const OUTLINE_AVAILABLE_TOOLTIP = 'Show document outline';
export const OUTLINE_EMPTY_TOOLTIP = 'Document outline unavailable: this note has no headings';

/** Decide how the outline launcher represents the active note. */
export function documentOutlineControlState({
    enabled,
    markdownReady,
    hasHeadings,
    open,
}) {
    const hidden = !enabled || !markdownReady;
    const disabled = !hidden && !hasHeadings;
    return {
        hidden,
        disabled,
        expanded: Boolean(open),
        tooltip: disabled ? OUTLINE_EMPTY_TOOLTIP : OUTLINE_AVAILABLE_TOOLTIP,
        description: disabled ? 'Unavailable because this note has no headings.' : '',
    };
}

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

/** Bound corrections to actual sticky-height changes after an explicit jump. */
export function advanceOutlineHeadingAlignment(previous, height) {
    const realign = height !== previous.height && previous.adjustments < 6;
    const adjustments = previous.adjustments + Number(realign);
    return { height, adjustments, realign, pending: adjustments < 6 };
}

/** Build parent and following section boundaries in one pass over heading levels. */
export function outlineHeadingStructure(headings) {
    const parents = [], next = Array(headings.length).fill(-1), stack = [];
    for (let index = 0; index < headings.length; index++) {
        const level = headings[index].level;
        while (stack.length && stack[stack.length - 1].level >= level) {
            next[stack.pop().index] = index;
        }
        parents.push(stack.length ? stack[stack.length - 1].index : -1);
        stack.push({ index, level });
    }
    return { parents, next };
}

/** Return at most six active ancestors, using the document's retained structure. */
export function activeOutlineHeadingHierarchy(headings, position, structure = outlineHeadingStructure(headings)) {
    const activeIndex = activeOutlineHeadingIndex(headings, position);
    if (activeIndex < 0) return [];
    const hierarchy = [];
    for (let index = activeIndex; index >= 0; index = structure.parents[index]) {
        hierarchy.push(headings[index]);
    }
    return hierarchy.reverse();
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

export const MERMAID_DIAGRAM_HEIGHT_LIMITS = Object.freeze({ min: 180, max: 900 });
export const DEFAULT_MERMAID_DIAGRAM_HEIGHT = 300;

const HEIGHT_DIRECTIVE = /^\s*%%\s*figaro:height\s+(\d+)\s*$/iu;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function normalizeMermaidDiagramHeight(value) {
    const height = Math.round(Number(value) || DEFAULT_MERMAID_DIAGRAM_HEIGHT);
    return clamp(height, MERMAID_DIAGRAM_HEIGHT_LIMITS.min, MERMAID_DIAGRAM_HEIGHT_LIMITS.max);
}

export function authoredMermaidDiagramHeight(source) {
    for (const line of String(source || '').split(/\r?\n/u)) {
        const match = line.match(HEIGHT_DIRECTIVE);
        if (match) return normalizeMermaidDiagramHeight(match[1]);
    }
    return null;
}

export function mermaidDiagramHeight(source) {
    return authoredMermaidDiagramHeight(source) || DEFAULT_MERMAID_DIAGRAM_HEIGHT;
}

export function mermaidDiagramResizePlan({ startHeight, deltaY }) {
    return normalizeMermaidDiagramHeight(
        (Number(startHeight) || DEFAULT_MERMAID_DIAGRAM_HEIGHT) + (Number(deltaY) || 0),
    );
}

/**
 * Store the editor-only geometry as a portable Mermaid comment. Existing
 * source order and whitespace stay untouched, and duplicate directives are
 * collapsed so one drag always produces one deterministic source change.
 */
export function setMermaidDiagramHeight(source, height, lineBreak = '\n') {
    const normalized = normalizeMermaidDiagramHeight(height);
    const lines = String(source || '').split(/\r?\n/u);
    let replaced = false;
    const next = [];
    for (const line of lines) {
        if (!HEIGHT_DIRECTIVE.test(line)) {
            next.push(line);
            continue;
        }
        if (!replaced) next.push(`%% figaro:height ${normalized}`);
        replaced = true;
    }
    if (!replaced) next.push(`%% figaro:height ${normalized}`);
    return next.join(lineBreak);
}

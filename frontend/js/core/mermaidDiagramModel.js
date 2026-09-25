export const MERMAID_DIAGRAM_HEIGHT_LIMITS = Object.freeze({ min: 60, max: 900 });
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

/**
 * `maxHeight` is the tallest drawing the current column can show: past it the
 * width cap would keep the drawing the same size while the number grew.
 */
export function mermaidDiagramResizePlan({ startHeight, deltaY, maxHeight = Infinity }) {
    const height = normalizeMermaidDiagramHeight(
        (Number(startHeight) || DEFAULT_MERMAID_DIAGRAM_HEIGHT) + (Number(deltaY) || 0),
    );
    const limit = Math.floor(Number(maxHeight));
    return Number.isFinite(limit) ? Math.min(height, Math.max(limit, MERMAID_DIAGRAM_HEIGHT_LIMITS.min)) : height;
}

/** The drawing Mermaid produces does not depend on the editor-only directive. */
export function mermaidSourceWithoutHeight(source) {
    return String(source || '').split(/\r?\n/u).filter(line => !HEIGHT_DIRECTIVE.test(line)).join('\n');
}

/**
 * Vertical space around the drawing inside the editor widget: the widget's
 * padding and border, the language label and the canvas padding. Used only to
 * estimate a box before its first render; rendered boxes are measured.
 */
export const MERMAID_WIDGET_CHROME_HEIGHT = 65;

/**
 * Size at which the editor and PDF draw a diagram, before the column or page
 * width caps it: the rendered SVG's natural (viewBox) size, or an authored
 * height with the width its proportions need. `null` until the natural size
 * is known.
 */
export function mermaidDiagramDisplaySize({ natural, authoredHeight = null }) {
    const width = Number(natural?.width), height = Number(natural?.height);
    if (!(width > 0) || !(height > 0)) return null;
    const shown = authoredHeight ? normalizeMermaidDiagramHeight(authoredHeight) : height;
    return {
        width: Math.round(shown * width / height * 100) / 100,
        height: Math.round(shown * 100) / 100,
    };
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

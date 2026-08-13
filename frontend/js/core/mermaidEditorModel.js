const diagramTypeAliases = new Map([
    ['class', 'classDiagram'],
    ['classDiagram-v2', 'classDiagram'],
    ['flowchart', 'flowchart-v2'],
    ['graph', 'flowchart-v2'],
    ['stateDiagram-v2', 'stateDiagram'],
]);

/** Convert Mermaid's detected parser id to the matching template catalogue id. */
export function normalizeMermaidDiagramType(type) {
    const normalized = String(type || '').trim();
    return diagramTypeAliases.get(normalized) || normalized;
}

/** Normalize the vendored Mermaid examples into stable application data. */
export function mermaidTemplateCatalog(diagramData) {
    return (Array.isArray(diagramData) ? diagramData : []).map((diagram, diagramIndex) => {
        const examples = (Array.isArray(diagram?.examples) ? diagram.examples : []).map((example, exampleIndex) => ({
            id: `${String(diagram?.id || `diagram-${diagramIndex}`)}-${exampleIndex}`,
            title: String(example?.title || `Template ${exampleIndex + 1}`),
            code: String(example?.code || '').trim(),
            isDefault: Boolean(example?.isDefault),
        }));
        const defaultIndex = Math.max(0, examples.findIndex(example => example.isDefault));
        return {
            id: String(diagram?.id || `diagram-${diagramIndex}`),
            name: String(diagram?.name || `Diagram ${diagramIndex + 1}`),
            description: String(diagram?.description || ''),
            examples: examples.length && defaultIndex > 0
                ? [examples[defaultIndex], ...examples.filter((_example, index) => index !== defaultIndex)]
                : examples,
        };
    }).filter(diagram => diagram.examples.length > 0);
}

export function mermaidCatalogueType(catalog, detectedType) {
    const id = normalizeMermaidDiagramType(detectedType);
    return catalog.find(diagram => diagram.id === id) || catalog[0] || null;
}

export function mermaidTemplateForSource(catalog, source) {
    const code = String(source || '').replace(/\r\n/g, '\n').replace(/\n$/u, '');
    for (const diagram of catalog || []) {
        const example = diagram.examples.find(candidate => candidate.code === code);
        if (example) return { diagram, example };
    }
    return null;
}

/**
 * Initial editor selection and protection policy. Meaningful existing source
 * is protected; empty and whitespace-only fences start in live-browsing mode.
 */
export function initialMermaidTemplateState(catalog, source) {
    const existingSource = String(source || '');
    const hasSource = existingSource.trim().length > 0;
    const exact = hasSource ? mermaidTemplateForSource(catalog, existingSource) : null;
    const diagram = exact?.diagram || catalog?.[0] || null;
    const example = exact?.example || diagram?.examples?.[0] || null;
    const protectedSource = hasSource;
    return {
        diagram,
        example,
        source: protectedSource ? existingSource : (example?.code || ''),
        protectedSource,
    };
}

export const mermaidPreviewZoomLimits = Object.freeze({ min: 0.25, max: 4 });

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/** Keep a requested zoom centered on the same viewport coordinate. */
export function mermaidPreviewZoomAt(transform, requestedScale, origin, limits = mermaidPreviewZoomLimits) {
    const current = {
        scale: Number(transform?.scale) || 1,
        x: Number(transform?.x) || 0,
        y: Number(transform?.y) || 0,
    };
    const scale = clamp(Number(requestedScale) || current.scale, limits.min, limits.max);
    const ratio = scale / current.scale;
    const point = { x: Number(origin?.x) || 0, y: Number(origin?.y) || 0 };
    return {
        scale,
        x: point.x - ((point.x - current.x) * ratio),
        y: point.y - ((point.y - current.y) * ratio),
    };
}

/** Translate an already-fitted preview without coupling the decision to DOM events. */
export function mermaidPreviewPanBy(transform, delta) {
    return {
        scale: Number(transform?.scale) || 1,
        x: (Number(transform?.x) || 0) + (Number(delta?.x) || 0),
        y: (Number(transform?.y) || 0) + (Number(delta?.y) || 0),
    };
}

/** Convert wheel distance into a smooth, bounded scale request. */
export function mermaidPreviewWheelZoom(transform, deltaY, origin) {
    const scale = Number(transform?.scale) || 1;
    return mermaidPreviewZoomAt(transform, scale * Math.exp(-(Number(deltaY) || 0) * 0.0015), origin);
}

function lineRange(source, lineNumber, firstColumn = 0, lastColumn = firstColumn + 1) {
    const text = String(source || '');
    const lines = text.split('\n');
    const safeLine = Math.min(Math.max(Number(lineNumber) || 1, 1), Math.max(lines.length, 1));
    let lineFrom = 0;
    for (let index = 1; index < safeLine; index++) lineFrom += lines[index - 1].length + 1;
    const lineLength = lines[safeLine - 1]?.length || 0;
    const from = lineFrom + Math.min(Math.max(Number(firstColumn) || 0, 0), lineLength);
    const requestedTo = lineFrom + Math.min(Math.max(Number(lastColumn) || 0, 0), lineLength);
    return {
        from,
        to: Math.max(from + (from < text.length ? 1 : 0), requestedTo),
    };
}

function conciseMermaidError(error, lineNumber) {
    const expected = Array.isArray(error?.hash?.expected)
        ? error.hash.expected.map(token => String(token).replace(/^'|'$/g, '')).slice(0, 5)
        : [];
    const found = String(error?.hash?.token || error?.hash?.text || '').trim();
    if (expected.length) {
        return `Mermaid syntax error on line ${lineNumber}: expected ${expected.join(', ')}${found ? `; found ${found}` : ''}.`;
    }
    const firstLine = String(error?.message || error || 'Invalid Mermaid syntax')
        .split(/\r?\n/, 1)[0]
        .replace(/^Error:\s*/i, '')
        .trim();
    return lineNumber > 0 && !/line\s+\d+/i.test(firstLine)
        ? `Mermaid syntax error on line ${lineNumber}: ${firstLine}`
        : firstLine;
}

/** Translate Mermaid/Jison errors into CodeMirror diagnostics and hover text. */
export function mermaidDiagnostic(error, source) {
    const location = error?.hash?.loc || error?.loc || {};
    const line = Number(location.first_line || error?.hash?.line || error?.line || 1);
    const range = lineRange(source, line, location.first_column, location.last_column);
    return {
        ...range,
        severity: 'error',
        source: 'Mermaid',
        message: conciseMermaidError(error, line),
    };
}

/** Keep expensive renders responsive without imposing a fixed two-second wait. */
export function mermaidRenderDelay(lastRenderDurationMs) {
    const duration = Number(lastRenderDurationMs) || 0;
    if (duration > 750) return 2000;
    if (duration > 150) return 1000;
    return 0;
}

/** Replace only a fence's body and preserve its markers and line ending. */
export function mermaidBlockReplacement(block, source, lineBreak = '\n') {
    if (!block || !Number.isInteger(block.contentFrom) || !Number.isInteger(block.contentTo)
        || block.contentFrom < 0 || block.contentTo < block.contentFrom) {
        return null;
    }
    const code = String(source || '').replace(/\r?\n$/u, '');
    return {
        from: block.contentFrom,
        to: block.contentTo,
        insert: code ? `${code}${lineBreak}` : '',
    };
}

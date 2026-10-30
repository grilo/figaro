/**
 * Editable diagram kinds. Each is an SVG that carries its own editable source,
 * so it renders as an ordinary image everywhere and reopens in its editor tab.
 * The kind name doubles as the tab type and the block-guide label.
 */
const DIAGRAM_KINDS = Object.freeze({
    drawio: Object.freeze({
        kind: 'drawio',
        suffix: '.drawio.svg',
        editorName: 'Draw.io',
        noun: 'diagram',
        defaultName: 'diagram1',
        alt: 'Diagram',
    }),
    excalidraw: Object.freeze({
        kind: 'excalidraw',
        suffix: '.excalidraw.svg',
        editorName: 'Excalidraw',
        noun: 'drawing',
        defaultName: 'drawing1',
        alt: 'Drawing',
    }),
});

export const editableDiagramKinds = Object.freeze(Object.keys(DIAGRAM_KINDS));

export function editableDiagramSpec(kind) {
    return DIAGRAM_KINDS[kind] || null;
}

/** The diagram kind a vault path belongs to, from its complete suffix. */
export function editableDiagramKind(path) {
    const lower = String(path || '').toLowerCase();
    for (const spec of Object.values(DIAGRAM_KINDS)) {
        if (lower.endsWith(spec.suffix)) return spec.kind;
    }
    return null;
}

export function isEditableDiagramPath(path) {
    return editableDiagramKind(path) !== null;
}

/** Diagram tabs are path-backed like file tabs and use the kind as their type. */
export function isDiagramTabType(type) {
    return Object.hasOwn(DIAGRAM_KINDS, type);
}

export function isPathTabType(type) {
    return type === 'file' || isDiagramTabType(type);
}

function suffixStem(name, spec) {
    const bare = spec.suffix.slice(0, -'.svg'.length);
    const lower = name.toLowerCase();
    if (lower.endsWith(spec.suffix)) return name.slice(0, -spec.suffix.length);
    if (lower.endsWith('.svg')) name = name.slice(0, -'.svg'.length);
    if (name.toLowerCase().endsWith(bare)) name = name.slice(0, -bare.length);
    return name;
}

/** Validate a user-typed diagram name; returns an error message or ''. */
export function diagramNameError(kind, value) {
    const spec = editableDiagramSpec(kind);
    if (!spec) return 'Unknown diagram type.';
    const name = String(value || '').trim();
    if (!name) return `Enter a ${spec.noun} name.`;
    if (/[\\/]/u.test(name)) return 'Choose a name, not a path.';
    if (/^\.+$/u.test(name)) return 'Choose a name other than dots.';
    if (Array.from(name).some(character => character.charCodeAt(0) < 0x20)) {
        return 'The name contains an unsupported control character.';
    }
    return suffixStem(name, spec).trim() ? '' : `Enter a name before the ${spec.suffix} extension.`;
}

/** Normalize a stem, `.svg`, bare-kind or complete name to the kind's suffix. */
export function diagramFileName(kind, value) {
    if (diagramNameError(kind, value)) return '';
    const spec = editableDiagramSpec(kind);
    const name = String(value).trim();
    if (name.toLowerCase().endsWith(spec.suffix)) return name;
    return `${suffixStem(name, spec)}${spec.suffix}`;
}

/** The sibling Markdown image reference inserted for a new diagram. */
export function diagramMarkdownReference(kind, value) {
    const fileName = diagramFileName(kind, value);
    return fileName ? `![${editableDiagramSpec(kind).alt}](./${encodeURIComponent(fileName)})` : '';
}

import { normalizeMermaidDiagramType } from './mermaidEditorModel.js';

const FIGARO_STYLE_START = '%% Figaro node styles';
const FIGARO_STYLE_END = '%% End Figaro node styles';

const universalThemeVariables = Object.freeze([
    'primaryColor',
    'primaryBorderColor',
    'primaryTextColor',
    'secondaryColor',
    'tertiaryColor',
    'lineColor',
]);

function target(id, label, variable, options = {}) {
    return Object.freeze({ id, label, variable, ...options });
}

function paletteTargets(prefix, count, label = 'Palette', startIndex = 0) {
    return Array.from({ length: count }, (_value, index) => (
        target(`${prefix}${index + startIndex}`, `${label} ${index + 1}`, `${prefix}${index + startIndex}`)
    ));
}

const genericTargets = Object.freeze([
    target('elements', 'Elements', 'mainBkg', {
        borderVariable: 'nodeBorder',
        textVariable: 'nodeTextColor',
    }),
    target('connections', 'Connections', 'lineColor'),
]);

const flowchartTargets = Object.freeze([
    target('elements', 'Default node color', 'mainBkg', {
        borderVariable: 'nodeBorder',
        textVariable: 'nodeTextColor',
    }),
    target('connections', 'Connection color', 'lineColor'),
]);

const railroadTargets = Object.freeze([
    target('terminals', 'Terminals', 'secondBkg', { borderVariable: 'secondaryBorderColor', textVariable: 'secondaryTextColor' }),
    target('nonterminals', 'Nonterminals', 'mainBkg', { borderVariable: 'primaryBorderColor', textVariable: 'primaryTextColor' }),
    genericTargets[1],
]);

const descriptors = Object.freeze({
    'flowchart-v2': {
        id: 'flowchart-v2',
        label: 'Flowchart',
        kind: 'flowchart',
        targets: flowchartTargets,
    },
    sequence: {
        id: 'sequence',
        label: 'Sequence diagram',
        targets: [
            target('participants', 'Participants', 'actorBkg', {
                borderVariable: 'actorBorder', textVariable: 'actorTextColor',
            }),
            target('messages', 'Messages', 'signalColor', { textVariable: 'signalTextColor' }),
            target('notes', 'Notes', 'noteBkgColor', {
                borderVariable: 'noteBorderColor', textVariable: 'noteTextColor',
            }),
            target('activations', 'Activations', 'activationBkgColor', { borderVariable: 'activationBorderColor' }),
        ],
    },
    classDiagram: {
        id: 'classDiagram',
        label: 'Class diagram',
        targets: [
            target('classes', 'Classes', 'mainBkg', {
                borderVariable: 'primaryBorderColor', textVariable: 'classText',
            }),
            target('relationships', 'Relationships', 'lineColor'),
        ],
    },
    stateDiagram: {
        id: 'stateDiagram',
        label: 'State diagram',
        targets: [
            target('states', 'States', 'stateBkg', { textVariable: 'stateLabelColor' }),
            target('transitions', 'Transitions', 'transitionColor', { textVariable: 'transitionLabelColor' }),
            target('notes', 'Notes', 'noteBkgColor', {
                borderVariable: 'noteBorderColor', textVariable: 'noteTextColor',
            }),
        ],
    },
    er: {
        id: 'er',
        label: 'Entity relationship diagram',
        targets: [
            target('entities', 'Entities', 'mainBkg', {
                borderVariable: 'nodeBorder', textVariable: 'nodeTextColor',
            }),
            target('relationships', 'Relationships', 'lineColor'),
        ],
    },
    requirement: {
        id: 'requirement',
        label: 'Requirement diagram',
        targets: [
            target('requirements', 'Requirements', 'mainBkg', {
                borderVariable: 'nodeBorder', textVariable: 'nodeTextColor',
            }),
            target('relationships', 'Relationships', 'relationColor'),
        ],
    },
    gantt: {
        id: 'gantt',
        label: 'Gantt chart',
        targets: [
            target('tasks', 'Tasks', 'taskBkgColor', { borderVariable: 'taskBorderColor' }),
            target('active-tasks', 'Active tasks', 'activeTaskBkgColor', { borderVariable: 'activeTaskBorderColor' }),
            target('done-tasks', 'Completed tasks', 'doneTaskBkgColor', { borderVariable: 'doneTaskBorderColor' }),
            target('critical-tasks', 'Critical tasks', 'critBkgColor', { borderVariable: 'critBorderColor' }),
            target('sections', 'Sections', 'sectionBkgColor'),
            target('today', 'Today marker', 'todayLineColor'),
        ],
    },
    pie: { id: 'pie', label: 'Pie chart', kind: 'palette', targets: paletteTargets('pie', 8, 'Slice', 1) },
    journey: { id: 'journey', label: 'User journey', kind: 'palette', targets: paletteTargets('fillType', 8, 'Section') },
    gitGraph: { id: 'gitGraph', label: 'Git graph', kind: 'palette', targets: paletteTargets('git', 8, 'Branch') },
    timeline: { id: 'timeline', label: 'Timeline', kind: 'palette', targets: paletteTargets('cScale', 8, 'Section') },
    radar: { id: 'radar', label: 'Radar diagram', kind: 'palette', targets: paletteTargets('cScale', 8, 'Series') },
    xychart: { id: 'xychart', label: 'XY chart', kind: 'palette', targets: [] },
    mindmap: { id: 'mindmap', label: 'Mindmap', kind: 'palette', targets: paletteTargets('cScale', 8, 'Branch', 1) },
    kanban: { id: 'kanban', label: 'Kanban diagram', targets: [] },
    treemap: { id: 'treemap', label: 'Treemap', kind: 'palette', targets: paletteTargets('cScale', 8, 'Group') },
    venn: { id: 'venn', label: 'Venn diagram', kind: 'palette', targets: paletteTargets('venn', 8, 'Set', 1) },
    quadrantChart: {
        id: 'quadrantChart',
        label: 'Quadrant chart',
        targets: [
            target('quadrant-1', 'Quadrant 1', 'quadrant1Fill', { textVariable: 'quadrant1TextFill' }),
            target('quadrant-2', 'Quadrant 2', 'quadrant2Fill', { textVariable: 'quadrant2TextFill' }),
            target('quadrant-3', 'Quadrant 3', 'quadrant3Fill', { textVariable: 'quadrant3TextFill' }),
            target('quadrant-4', 'Quadrant 4', 'quadrant4Fill', { textVariable: 'quadrant4TextFill' }),
            target('points', 'Points', 'quadrantPointFill', { textVariable: 'quadrantPointTextFill' }),
        ],
    },
    architecture: {
        id: 'architecture',
        label: 'Architecture diagram',
        targets: [
            target('groups', 'Group outlines', 'archGroupBorderColor'),
            target('edges', 'Edges', 'archEdgeColor', { borderVariable: 'archEdgeArrowColor' }),
        ],
    },
    eventmodeling: {
        id: 'eventmodeling',
        label: 'Event modeling diagram',
        targets: [
            target('commands', 'Commands', 'emCommandFill', { borderVariable: 'emCommandStroke' }),
            target('events', 'Events', 'emEventFill', { borderVariable: 'emEventStroke' }),
            target('processors', 'Processors', 'emProcessorFill', { borderVariable: 'emProcessorStroke' }),
            target('read-models', 'Read models', 'emReadModelFill', { borderVariable: 'emReadModelStroke' }),
            target('interfaces', 'Interfaces', 'emUiFill', { borderVariable: 'emUiStroke' }),
            target('relationships', 'Relationships', 'emRelationStroke'),
        ],
    },
    c4: { id: 'c4', label: 'C4 diagram', targets: [] },
    ishikawa: { id: 'ishikawa', label: 'Ishikawa diagram', targets: genericTargets },
    block: { id: 'block', label: 'Block diagram', targets: genericTargets },
    sankey: { id: 'sankey', label: 'Sankey diagram', targets: [] },
    packet: { id: 'packet', label: 'Packet diagram', targets: [] },
    treeView: { id: 'treeView', label: 'Tree view', targets: [] },
    wardley: { id: 'wardley', label: 'Wardley map', targets: [target('connections', 'Connections', 'wardley.linkStroke')] },
    cynefin: { id: 'cynefin', label: 'Cynefin framework', targets: [target('connections', 'Transitions', 'cynefin.arrowColor')] },
    railroad: { id: 'railroad', label: 'Railroad diagram', targets: railroadTargets },
    railroadEbnf: { id: 'railroadEbnf', label: 'Railroad diagram', targets: railroadTargets },
    railroadAbnf: { id: 'railroadAbnf', label: 'Railroad diagram', targets: railroadTargets },
    railroadPeg: { id: 'railroadPeg', label: 'Railroad diagram', targets: railroadTargets },
});

const fallbackDescriptor = Object.freeze({
    id: 'generic',
    label: 'Mermaid diagram',
    targets: [],
});

const managedThemeVariables = Object.freeze(Array.from(new Set([
    ...universalThemeVariables,
    'xyChart.plotColorPalette',
    ...Object.values(descriptors).flatMap(descriptor => descriptor.targets.flatMap(styleTarget => [
        styleTarget.variable,
        styleTarget.borderVariable,
        styleTarget.textVariable,
    ].filter(Boolean))),
])));

/** Return the controls that are truthful for one Mermaid parser type. */
export function mermaidStyleDescriptor(type, inspection) {
    const id = normalizeMermaidDiagramType(type);
    const descriptor = descriptors[id] || { ...fallbackDescriptor, id: id || fallbackDescriptor.id };
    if (id === 'xychart' && inspection) {
        return { ...descriptor, targets: (inspection.plots || []).map((plot, index) => target(
            `plot-${index}`, `${plot.type === 'bar' ? 'Bar' : 'Line'} ${index + 1}`,
            'xyChart.plotColorPalette', { paletteIndex: index, plotCount: inspection.plots.length },
        )) };
    }
    if (descriptor.kind === 'palette' && inspection?.paletteCount !== undefined) {
        return { ...descriptor, targets: descriptor.targets.slice(0, inspection.paletteCount) };
    }
    return descriptor;
}

/** Adapt plain parser data to the palette slots actually used by a diagram. */
export function mermaidPaletteCount(type, data) {
    if (!data) return undefined;
    if (type === 'timeline') return data.sections.length || data.tasks.length;
    if (type === 'treemap') return data.filter(node => node.children?.length).length;
    return data.length;
}

export function mermaidTargetColor(styleTarget, state, effectiveVariables = {}) {
    const value = state.variables?.[styleTarget.variable]
        || styleTarget.variable.split('.').reduce((object, key) => object?.[key], effectiveVariables) || '';
    const colors = String(value).split(',');
    return Number.isInteger(styleTarget.paletteIndex)
        ? colors[styleTarget.paletteIndex % colors.length]?.trim() || '' : value;
}

function hexChannels(color) {
    const normalized = String(color || '').trim().toLowerCase();
    const match = normalized.match(/^#([\da-f]{6})$/u);
    if (!match) return null;
    return [0, 2, 4].map(offset => Number.parseInt(match[1].slice(offset, offset + 2), 16));
}

function toHex(channels) {
    return `#${channels.map(channel => Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16).padStart(2, '0')).join('')}`;
}

export function mermaidReadableTextColor(color) {
    const channels = hexChannels(color);
    if (!channels) return '#ffffff';
    const luminance = rgb => {
        const [red, green, blue] = rgb.map(channel => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
    };
    const background = luminance(channels);
    const dark = luminance([17, 24, 39]);
    const contrastWithWhite = 1.05 / (background + 0.05);
    const contrastWithDark = (Math.max(background, dark) + 0.05)
        / (Math.min(background, dark) + 0.05);
    return contrastWithDark >= contrastWithWhite ? '#111827' : '#ffffff';
}

export function mermaidBorderColor(color) {
    const channels = hexChannels(color);
    return channels ? toHex(channels.map(channel => channel * 0.72)) : String(color || '');
}

/** Expand one visible color choice into the native Mermaid theme variables it owns. */
export function mermaidTargetVariablePatch(styleTarget, color, state = {}, effectiveVariables = {}) {
    const value = String(color || '').trim().toLowerCase();
    if (Number.isInteger(styleTarget.paletteIndex)) {
        const palette = String(state.variables?.[styleTarget.variable]
            || effectiveVariables.xyChart?.plotColorPalette || '').split(',').map(item => item.trim());
        if (!value) return { [styleTarget.variable]: null };
        if (!palette[0]) return {};
        const colors = Array.from({ length: Math.max(palette.length, styleTarget.plotCount || styleTarget.paletteIndex + 1) },
            (_color, index) => palette[index % palette.length]);
        colors[styleTarget.paletteIndex] = value;
        return { [styleTarget.variable]: colors.join(',') };
    }
    const patch = { [styleTarget.variable]: value || null };
    if (styleTarget.borderVariable) patch[styleTarget.borderVariable] = value ? mermaidBorderColor(value) : null;
    if (styleTarget.textVariable) patch[styleTarget.textVariable] = value ? mermaidReadableTextColor(value) : null;
    return patch;
}

function splitFrontmatter(source) {
    const text = String(source || '');
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/u);
    if (lines[0]?.trim() !== '---') return { text, newline, hasFrontmatter: false, lines: [], body: text };
    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (closingIndex < 0) return { text, newline, hasFrontmatter: false, lines: [], body: text };
    return {
        text,
        newline,
        hasFrontmatter: true,
        lines: lines.slice(1, closingIndex),
        body: lines.slice(closingIndex + 1).join(newline),
    };
}

function yamlEntry(line) {
    if (!line || /^\s*(?:#|$)/u.test(line) || /\t/u.test(line)) return null;
    const match = line.match(/^( *)([A-Za-z][\w-]*):(?:\s*(.*))?$/u);
    return match ? { indent: match[1].length, key: match[2], value: String(match[3] || '').trim() } : null;
}

function directEntry(lines, parent, key) {
    const entries = [];
    for (let index = parent.start; index < parent.end; index++) {
        const entry = yamlEntry(lines[index]);
        if (entry && entry.indent > parent.indent) entries.push({ ...entry, index });
    }
    const childIndent = entries.length ? Math.min(...entries.map(entry => entry.indent)) : parent.indent + 2;
    const found = entries.find(entry => entry.indent === childIndent && entry.key === key) || null;
    if (!found) return { found: null, childIndent };
    let end = parent.end;
    for (let index = found.index + 1; index < parent.end; index++) {
        const entry = yamlEntry(lines[index]);
        if (entry && entry.indent <= found.indent) {
            end = index;
            break;
        }
    }
    return { found: { ...found, start: found.index + 1, end }, childIndent };
}

function locateYamlPath(lines, path) {
    let parent = { start: 0, end: lines.length, indent: -2 };
    const located = [];
    for (const key of path) {
        const result = directEntry(lines, parent, key);
        if (!result.found) return { found: null, parent, located, childIndent: result.childIndent, missingKey: key };
        located.push(result.found);
        parent = result.found;
    }
    return { found: located.at(-1), parent: located.at(-2) || { start: 0, end: lines.length, indent: -2 }, located };
}

function yamlScalar(value) {
    return `'${String(value).replaceAll('\'', '\'\'')}'`;
}

function setYamlPath(inputLines, path, value) {
    const lines = [...inputLines];
    for (let depth = 0; depth < path.length - 1; depth++) {
        const currentPath = path.slice(0, depth + 1);
        let location = locateYamlPath(lines, currentPath);
        if (!location.found) {
            const parentLocation = depth === 0
                ? { found: { end: lines.length, indent: -2 } }
                : locateYamlPath(lines, path.slice(0, depth));
            if (depth > 0 && (!parentLocation.found || parentLocation.found.value)) {
                return { ok: false, lines: inputLines };
            }
            const parent = parentLocation.found;
            lines.splice(parent.end, 0, `${' '.repeat(parent.indent + 2)}${path[depth]}:`);
            location = locateYamlPath(lines, currentPath);
        }
        if (location.found.value) return { ok: false, lines: inputLines };
    }

    const leafPath = path;
    const leaf = locateYamlPath(lines, leafPath);
    if (value === null || value === undefined || value === '') {
        if (leaf.found) lines.splice(leaf.found.index, 1);
    } else if (leaf.found) {
        lines[leaf.found.index] = `${' '.repeat(leaf.found.indent)}${leaf.found.key}: ${yamlScalar(value)}`;
    } else {
        const parent = path.length === 1
            ? { end: lines.length, indent: -2 }
            : locateYamlPath(lines, path.slice(0, -1)).found;
        if (!parent || parent.value) return { ok: false, lines: inputLines };
        lines.splice(parent.end, 0, `${' '.repeat(parent.indent + 2)}${path.at(-1)}: ${yamlScalar(value)}`);
    }

    for (let depth = path.length - 1; depth > 0; depth--) {
        const parentPath = path.slice(0, depth);
        const parent = locateYamlPath(lines, parentPath).found;
        if (!parent || parent.value) continue;
        const hasChildren = lines.slice(parent.start, parent.end).some(line => {
            const entry = yamlEntry(line);
            return entry && entry.indent > parent.indent;
        });
        const hasComments = lines.slice(parent.start, parent.end).some(line => /^\s*#/u.test(line));
        if (!hasChildren && !hasComments) lines.splice(parent.index, 1);
    }
    return { ok: true, lines };
}

function scalarAtPath(lines, path) {
    const found = locateYamlPath(lines, path).found;
    if (!found?.value) return '';
    const value = found.value.replace(/\s+#.*$/u, '').trim();
    if ((value.startsWith('\'') && value.endsWith('\'')) || (value.startsWith('"') && value.endsWith('"'))) {
        return value.slice(1, -1).replaceAll('\'\'', '\'');
    }
    return value;
}

function rebuildFrontmatter(parts, lines) {
    const meaningful = lines.some(line => yamlEntry(line) || /^\s*#/u.test(line));
    if (!meaningful) return parts.body.replace(/^\r?\n/u, '');
    const body = parts.body.replace(/^\r?\n/u, '');
    return ['---', ...lines, '---', body].join(parts.newline);
}

/** Read the subset of Mermaid frontmatter owned by the visual controls. */
export function mermaidStyleConfigState(source, authoredConfig) {
    const parts = splitFrontmatter(source);
    const variables = {};
    for (const variable of managedThemeVariables) {
        const value = authoredConfig
            ? variable.split('.').reduce((object, key) => object?.[key], authoredConfig.themeVariables)
            : scalarAtPath(parts.lines, ['config', 'themeVariables', ...variable.split('.')]);
        if (value) variables[variable] = value;
    }
    const themeVariables = locateYamlPath(parts.lines, ['config', 'themeVariables']).found;
    const authoredVariableCount = authoredConfig
        ? Object.keys(authoredConfig.themeVariables || {}).length
        : themeVariables ? parts.lines.slice(themeVariables.start, themeVariables.end).filter(line => yamlEntry(line)).length : 0;
    return {
        theme: authoredConfig ? authoredConfig.theme || '' : scalarAtPath(parts.lines, ['config', 'theme']),
        variables,
        authoredVariableCount,
        themeCSS: authoredConfig ? !!authoredConfig.themeCSS : parts.lines.some(line => /^\s*themeCSS:/u.test(line)),
        hasCustomTheme: authoredConfig ? Object.keys(authoredConfig.themeVariables || {}).length > 0 || !!authoredConfig.themeCSS
            : parts.lines.some(line => /^\s*(?:themeVariables|themeCSS):/u.test(line)) || /%%\{\s*init:/u.test(source),
        flowchartCurve: authoredConfig ? authoredConfig.flowchart?.curve || '' : scalarAtPath(parts.lines, ['config', 'flowchart', 'curve']),
    };
}

/** Merge safe scalar style settings into Mermaid frontmatter without touching unrelated YAML. */
export function mermaidSourceWithStyleConfig(source, {
    theme,
    variables = {},
    flowchartCurve,
} = {}) {
    if (/%%\{\s*init\s*:/iu.test(String(source || ''))) {
        return { source: String(source || ''), changed: false,
            reason: 'This diagram uses an init directive that can override frontmatter. Edit its theme in Source mode.' };
    }
    const parts = splitFrontmatter(source);
    let lines = [...parts.lines];
    const patches = [];
    if (theme !== undefined) patches.push([['config', 'theme'], theme]);
    for (const [key, value] of Object.entries(variables)) {
        if (!managedThemeVariables.includes(key)) continue;
        patches.push([['config', 'themeVariables', ...key.split('.')], value]);
    }
    if (flowchartCurve !== undefined) patches.push([['config', 'flowchart', 'curve'], flowchartCurve]);
    if (!parts.hasFrontmatter && patches.every(([_path, value]) => !value)) {
        return { source: String(source || ''), changed: false, reason: '' };
    }
    for (const [path, value] of patches) {
        const result = setYamlPath(lines, path, value);
        if (!result.ok) {
            return {
                source: String(source || ''),
                changed: false,
                reason: 'This diagram uses compact or advanced YAML configuration. Edit its styling in Source mode.',
            };
        }
        lines = result.lines;
    }
    const nextSource = rebuildFrontmatter(parts, lines);
    return { source: nextSource, changed: nextSource !== String(source || ''), reason: '' };
}

/** Produce a portable preset using only native Mermaid theme settings. */
export function mermaidThemePresetPatch(preset, accent = '#ef4444') {
    if (preset === 'neutral') {
        return {
            theme: 'neutral',
            variables: Object.fromEntries(universalThemeVariables.map(variable => [variable, null])),
        };
    }
    if (preset === 'accent') {
        const color = hexChannels(accent) ? String(accent).toLowerCase() : '#ef4444';
        return {
            theme: 'base',
            variables: {
                primaryColor: color,
                primaryBorderColor: mermaidBorderColor(color),
                primaryTextColor: mermaidReadableTextColor(color),
                secondaryColor: '#14b8a6',
                tertiaryColor: '#f59e0b',
                lineColor: mermaidBorderColor(color),
            },
        };
    }
    return {
        theme: null,
        variables: Object.fromEntries(universalThemeVariables.map(variable => [variable, null])),
    };
}

/** Recognize exact presets; never mislabel an authored/custom theme as one. */
export function mermaidThemePresetForState(state) {
    const variables = state?.variables || {};
    if (state?.theme === 'base' && variables.primaryColor && !state.themeCSS) {
        const preset = mermaidThemePresetPatch('accent', variables.primaryColor).variables;
        if (Object.keys(variables).length === Object.keys(preset).length
            && (state.authoredVariableCount === undefined || state.authoredVariableCount === Object.keys(preset).length)
            && Object.entries(preset).every(([key, value]) => variables[key] === value)) return 'accent';
    }
    if (Object.keys(variables).length || state?.hasCustomTheme) return 'custom';
    if (state?.theme === 'neutral') return 'neutral';
    return !state?.theme || state.theme === 'default' ? 'document' : 'custom';
}

function stripManagedStyleBlock(source) {
    const text = String(source || '');
    const start = text.search(/^%% Figaro node styles[\t ]*\r?$/mu);
    if (start < 0) return { source: text, block: '' };
    const relativeEnd = text.slice(start).search(/^%% End Figaro node styles[\t ]*\r?$/mu);
    if (relativeEnd < 0) return { source: text, block: '' };
    const end = start + relativeEnd;
    const after = end + FIGARO_STYLE_END.length;
    const beforeSource = text.slice(0, start).trimEnd();
    const afterSource = text.slice(after).trimStart();
    return {
        source: `${beforeSource}${afterSource ? `\n${afterSource}` : ''}`.trimEnd(),
        block: text.slice(start + FIGARO_STYLE_START.length, end),
    };
}

/** Inspection uses the original declarations so reset can restore authored styles. */
export function mermaidSourceWithoutManagedNodeStyles(source) {
    return stripManagedStyleBlock(source).source;
}

function managedNodeStyles(source) {
    const { block } = stripManagedStyleBlock(source);
    const styles = new Map();
    for (const line of block.split(/\r?\n/u)) {
        const style = line.match(/^\s*style\s+([\p{L}\p{N}_.-]+)\s+fill:(#[\da-fA-F]{6}),stroke:(#[\da-fA-F]{6}),color:(#[\da-fA-F]{6})\s*$/u);
        if (style) {
            styles.set(style[1], {
                ...(styles.get(style[1]) || {}),
                fill: style[2].toLowerCase(),
                border: style[3].toLowerCase(),
                text: style[4].toLowerCase(),
            });
            continue;
        }
        const shape = line.match(/^\s*([\p{L}\p{N}_.-]+)@\{\s*shape:\s*([\w-]+)\s*\}\s*$/u);
        if (shape) styles.set(shape[1], { ...(styles.get(shape[1]) || {}), shape: shape[2] });
    }
    return styles;
}

function flowchartBody(source) {
    return stripManagedStyleBlock(splitFrontmatter(source).body).source;
}

function cleanFlowchartLabel(value, fallback) {
    const label = String(value || '').trim()
        .replace(/^['"`]|['"`]$/gu, '')
        .replace(/^`|`$/gu, '')
        .trim();
    return label || fallback;
}

/** Project authoritative parser vertices; never infer identities from label text. */
export function mermaidFlowchartNodes(source, inspection = {}) {
    const styles = managedNodeStyles(source);
    return (inspection.nodes || []).map(node => {
        const inherited = [...(inspection.classes?.default?.styles || []),
            ...(node.classes || []).flatMap(name => inspection.classes?.[name]?.styles || []),
            ...(node.styles || [])];
        const sourceFill = inherited.flatMap(style => String(style).split(';'))
            .map(style => style.match(/^\s*fill\s*:\s*(.+?)\s*(?:!important)?$/iu)?.[1]).filter(Boolean).at(-1) || '';
        return { id: node.id, label: cleanFlowchartLabel(node.text, node.id),
            fill: sourceFill, sourceFill, ...styles.get(node.id) };
    });
}

/** Replace Figaro's native Mermaid node-style statements as one reversible section. */
export function mermaidSourceWithFlowchartNodeStyle(source, nodeId, patch = {}, inspection = {}) {
    const id = String(nodeId || '').trim();
    if (!/^[\p{L}\p{N}_.-]+$/u.test(id) || !inspection.nodes?.some(node => node.id === id)) {
        return { source: String(source || ''), changed: false, reason: 'Choose a parsed flowchart node. This node cannot be styled safely.' };
    }
    const styles = managedNodeStyles(source);
    const current = { ...(styles.get(id) || {}) };
    if (Object.hasOwn(patch, 'fill')) {
        const fill = String(patch.fill || '').trim().toLowerCase();
        if (fill && hexChannels(fill)) {
            current.fill = fill;
            current.border = mermaidBorderColor(fill);
            current.text = mermaidReadableTextColor(fill);
        } else {
            delete current.fill;
            delete current.border;
            delete current.text;
        }
    }
    if (Object.hasOwn(patch, 'shape')) {
        const shape = String(patch.shape || '').trim();
        if (['rounded', 'stadium'].includes(shape)) current.shape = shape;
        else delete current.shape;
    }
    if (current.fill || current.shape) styles.set(id, current);
    else styles.delete(id);

    const stripped = stripManagedStyleBlock(source).source;
    const nodeOrder = inspection.nodes.map(node => node.id);
    const orderedIds = Array.from(styles.keys()).sort((left, right) => {
        const leftIndex = nodeOrder.indexOf(left);
        const rightIndex = nodeOrder.indexOf(right);
        return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
            - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    });
    const lines = [];
    for (const styleId of orderedIds) {
        const style = styles.get(styleId);
        if (style.fill) lines.push(`style ${styleId} fill:${style.fill},stroke:${style.border},color:${style.text}`);
        if (style.shape) lines.push(`${styleId}@{ shape: ${style.shape} }`);
    }
    const nextSource = lines.length
        ? `${stripped.trimEnd()}\n\n${FIGARO_STYLE_START}\n${lines.join('\n')}\n${FIGARO_STYLE_END}`
        : stripped;
    return { source: nextSource, changed: nextSource !== String(source || ''), reason: '' };
}

/** Update only the direction token on a flowchart declaration. */
export function mermaidSourceWithFlowchartDirection(source, direction) {
    const normalized = String(direction || '').toUpperCase();
    if (!['TB', 'TD', 'BT', 'RL', 'LR'].includes(normalized)) {
        return { source: String(source || ''), changed: false, reason: 'Choose a valid flowchart direction.' };
    }
    const parts = splitFrontmatter(source);
    const body = parts.body;
    const pattern = /^(\s*(?:flowchart|graph))\s+(?:TB|TD|BT|RL|LR)\b/mu;
    if (!pattern.test(body)) {
        return { source: String(source || ''), changed: false, reason: 'The flowchart declaration has no editable direction.' };
    }
    const nextBody = body.replace(pattern, `$1 ${normalized}`);
    const nextSource = parts.hasFrontmatter
        ? ['---', ...parts.lines, '---', nextBody].join(parts.newline)
        : nextBody;
    return { source: nextSource, changed: nextSource !== String(source || ''), reason: '' };
}

export function mermaidFlowchartDirection(source) {
    const direction = flowchartBody(source).match(/^\s*(?:flowchart|graph)\s+(TB|TD|BT|RL|LR)\b/mu)?.[1] || '';
    return direction === 'TD' ? 'TB' : direction;
}

/** Match a rendered Mermaid flowchart node back to a known authored id. */
export function mermaidFlowchartNodeIdFromSvg(elementId, knownNodeIds) {
    const id = String(elementId || '');
    const known = [...(knownNodeIds || [])].sort((left, right) => right.length - left.length);
    return known.find(nodeId => id.endsWith(`-flowchart-${nodeId}-${id.match(/(\d+)$/u)?.[1] || ''}`)) || '';
}

export const mermaidStyleManagedThemeVariables = managedThemeVariables;

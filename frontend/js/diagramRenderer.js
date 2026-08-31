/**
 * Shared SVG renderers for live Markdown previews and printable exports.
 *
 * Keeping this outside the CodeMirror extension means exports use the same
 * Mermaid/Vega settings as the editor while remaining easy to exercise in
 * isolation.
 */

import { planMermaidSourceRender } from './core/diagramSecurityModel.js';
import { mermaidPaletteCount, mermaidSourceWithoutManagedNodeStyles } from './core/mermaidStyleEditorModel.js';
import {
    diagramRenderCacheKey,
    rebaseDiagramSvgIds,
} from './core/diagramRenderCacheModel.js';

export const diagramLanguages = ['mermaid', 'vega', 'vega-lite'];

let initializedMermaid = null;
let renderSequence = 0;
const DIAGRAM_RENDER_CACHE_LIMIT = 64;
const diagramRenderCache = new Map();
const pendingDiagramRenders = new Map();
let mermaidJob = Promise.resolve();

// Mermaid's parsers share theme/configuration state. Keep inspection and its
// snapshot atomic with respect to all other validation/render requests.
function withMermaid(operation) {
    const job = mermaidJob.then(operation, operation);
    mermaidJob = job.catch(() => {});
    return job;
}

export function isDiagramLanguage(language) {
    return diagramLanguages.includes(String(language || '').trim().toLowerCase());
}

function initialiseMermaid() {
    const mermaid = typeof window !== 'undefined' ? window.mermaid : null;
    if (!mermaid || typeof mermaid.initialize !== 'function' || typeof mermaid.render !== 'function') {
        return false;
    }
    if (initializedMermaid === mermaid) return true;

    mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
    });
    diagramRenderCache.clear();
    pendingDiagramRenders.clear();
    initializedMermaid = mermaid;
    return true;
}

function nextMermaidRenderId(idPrefix) {
    renderSequence += 1;
    return String(idPrefix || 'figaro-diagram') + '-mermaid-' + renderSequence;
}

function readCachedDiagram(key) {
    const entry = diagramRenderCache.get(key);
    if (!entry) return null;
    diagramRenderCache.delete(key);
    diagramRenderCache.set(key, entry);
    return entry;
}

function writeCachedDiagram(key, entry) {
    diagramRenderCache.delete(key);
    diagramRenderCache.set(key, entry);
    while (diagramRenderCache.size > DIAGRAM_RENDER_CACHE_LIMIT) {
        diagramRenderCache.delete(diagramRenderCache.keys().next().value);
    }
}

async function renderMermaidSVG(code, idPrefix) {
    const key = diagramRenderCacheKey('mermaid', code);
    const targetId = nextMermaidRenderId(idPrefix);
    const cached = readCachedDiagram(key);
    if (cached) return rebaseDiagramSvgIds(cached.svg, cached.renderId, targetId);

    let pending = pendingDiagramRenders.get(key);
    if (!pending) {
        const renderId = targetId;
        pending = withMermaid(() => window.mermaid.render(renderId, code))
            .then(result => {
                const svg = typeof result?.svg === 'string' && result.svg ? result.svg : null;
                if (!svg) return null;
                const entry = { svg, renderId };
                writeCachedDiagram(key, entry);
                return entry;
            })
            .finally(() => {
                if (pendingDiagramRenders.get(key) === pending) pendingDiagramRenders.delete(key);
            });
        pendingDiagramRenders.set(key, pending);
    }

    const entry = await pending;
    return entry ? rebaseDiagramSvgIds(entry.svg, entry.renderId, targetId) : null;
}

export function initializeDiagramRenderers() {
    return {
        mermaid: initialiseMermaid(),
        vega: typeof window !== 'undefined' && typeof window.vegaEmbed === 'function',
    };
}

function assertMermaidSourceAllowed(source) {
    const plan = planMermaidSourceRender(String(source || ''));
    if (plan.action === 'render') return;
    const error = new Error(plan.reason === 'source-too-large'
        ? `Mermaid source exceeds the ${plan.maxLength}-character safe rendering limit`
        : 'Mermaid YAML ordered maps are not rendered');
    error.code = plan.reason;
    throw error;
}

/** Validate Mermaid source without constructing an SVG. */
export async function validateMermaidSource(source) {
    const code = String(source || '');
    assertMermaidSourceAllowed(code);
    if (!code.trim()) {
        const error = new Error('Choose a template or enter a Mermaid diagram.');
        error.code = 'empty-mermaid-source';
        throw error;
    }
    if (!initialiseMermaid() || typeof window.mermaid.parse !== 'function') {
        const error = new Error('Mermaid renderer is unavailable');
        error.code = 'mermaid-unavailable';
        throw error;
    }
    return withMermaid(() => window.mermaid.parse(code));
}

/** Snapshot parsed identities and effective styling, without leaking Mermaid's mutable DB. */
export async function inspectMermaidSource(source) {
    const code = String(source || '');
    assertMermaidSourceAllowed(code);
    if (!code.trim() || !initialiseMermaid() || !window.mermaid.mermaidAPI?.getDiagramFromText) {
        return validateMermaidSource(code);
    }
    return withMermaid(async () => {
        const result = await window.mermaid.parse(code);
        const diagram = await window.mermaid.mermaidAPI.getDiagramFromText(mermaidSourceWithoutManagedNodeStyles(code));
        const config = window.mermaid.mermaidAPI.getConfig();
        const flowchart = result.diagramType === 'flowchart-v2' || result.diagramType === 'flowchart';
        const db = diagram.db;
        const paletteData = {
            pie: () => Array.from(db.getSections().keys()),
            journey: () => db.getSections(),
            timeline: () => ({ sections: db.getSections(), tasks: db.getTasks() }),
            gitGraph: () => db.getBranchesAsObjArray(),
            radar: () => db.getCurves(),
            mindmap: () => db.getMindmap()?.children || [],
            treemap: () => db.getNodes(),
            venn: () => db.getCurrentSets(),
        }[result.diagramType]?.();
        return JSON.parse(JSON.stringify({
            ...result,
            nodes: flowchart ? Array.from(diagram.db.getVertices().values()) : [],
            classes: flowchart ? Object.fromEntries(diagram.db.getClasses()) : {},
            plots: diagram.db.getXYChartData?.().plots?.map(plot => ({ type: plot.type })) || [],
            effectiveVariables: config.themeVariables,
            paletteCount: mermaidPaletteCount(result.diagramType, paletteData),
        }));
    });
}

function cssThemeValue(name, fallback) {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return fallback;
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function mergeVegaConfig(theme, authored = {}) {
    const merged = { ...theme, ...authored };
    for (const key of ['axis', 'header', 'legend', 'text', 'title', 'view']) {
        if (theme[key] || authored[key]) merged[key] = { ...(theme[key] || {}), ...(authored[key] || {}) };
    }
    return merged;
}

function applicationThemedVegaSpec(spec) {
    const text = cssThemeValue('--text-color', '#dcddde');
    const muted = cssThemeValue('--text-muted', '#72767d');
    const border = cssThemeValue('--border-color', '#2d2d2d');
    const grid = cssThemeValue('--border-light', border);
    const theme = {
        axis: {
            domainColor: border,
            gridColor: border,
            labelColor: muted,
            tickColor: grid,
            titleColor: text,
        },
        header: { labelColor: muted, titleColor: text },
        legend: { labelColor: muted, titleColor: text },
        text: { color: text },
        title: { color: text },
        view: { stroke: null },
    };
    return {
        ...spec,
        background: 'transparent',
        config: mergeVegaConfig(theme, spec.config),
    };
}

function createVegaRenderTarget(containerWidth, chartHeight) {
    const target = document.createElement('div');
    const width = Math.min(1600, Math.max(320, Math.round(Number(containerWidth) || 640)));
    const height = Math.min(1200, Math.max(360, Math.round(Number(chartHeight) || 340) + 80));
    target.dataset.figaroVegaRenderTarget = 'true';
    target.setAttribute('aria-hidden', 'true');
    target.style.position = 'fixed';
    target.style.left = '-10000px';
    target.style.top = '0';
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    target.style.overflow = 'hidden';
    target.style.visibility = 'hidden';
    target.style.pointerEvents = 'none';
    (document.body || document.documentElement).append(target);
    return target;
}

function assertRenderableVegaSVG(svg) {
    if (typeof svg !== 'string' || !svg.trim()) throw new Error('Vega-Lite did not produce an SVG preview.');
    const host = document.createElement('template');
    host.innerHTML = svg;
    const graphic = host.content.querySelector('svg');
    if (!graphic) throw new Error('Vega-Lite did not produce an SVG preview.');
    const viewBox = String(graphic.getAttribute('viewBox') || '').trim().split(/[\s,]+/u).map(Number);
    if (viewBox.length === 4 && viewBox.every(Number.isFinite) && (viewBox[2] <= 0 || viewBox[3] <= 0)) {
        throw new Error('Vega-Lite produced an empty chart. Check the selected columns and values.');
    }
    return svg;
}

/**
 * Render a diagram source block to standalone SVG. Unsupported renderers
 * return null; malformed diagram input rejects so callers can keep the
 * original source block visible instead of losing document content.
 */
export async function renderDiagramSVG(language, source, idPrefix = 'figaro-diagram', options = {}) {
    const normalizedLanguage = String(language || '').trim().toLowerCase();
    const code = String(source || '');

    if (normalizedLanguage === 'mermaid') {
        assertMermaidSourceAllowed(code);
        if (!initialiseMermaid()) return null;
        return renderMermaidSVG(code, idPrefix);
    }

    if ((normalizedLanguage === 'vega' || normalizedLanguage === 'vega-lite') &&
        typeof window !== 'undefined' &&
        typeof window.vegaEmbed === 'function' &&
        typeof document !== 'undefined') {
        const authoredSpec = JSON.parse(code);
        const spec = options.appearance === 'application'
            ? applicationThemedVegaSpec(authoredSpec)
            : authoredSpec;
        // Keep the target in the live document while Vega measures a portable
        // `width: "container"` spec. WebKitGTK reports zero geometry for the
        // equivalent detached node even when it has an inline width.
        const target = createVegaRenderTarget(options.containerWidth, spec.height);
        let result;

        try {
            result = await window.vegaEmbed(target, spec, {
                mode: normalizedLanguage === 'vega-lite' ? 'vega-lite' : 'vega',
                actions: false,
                renderer: 'svg',
            });
            if (typeof result?.view?.toSVG !== 'function') return null;
            return assertRenderableVegaSVG(await result.view.toSVG());
        } finally {
            result?.view?.finalize?.();
            target.remove();
        }
    }

    return null;
}

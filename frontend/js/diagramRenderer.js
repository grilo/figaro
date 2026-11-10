/**
 * Shared SVG renderers for live Markdown previews and printable exports.
 *
 * Keeping this outside the CodeMirror extension means exports use the same
 * Mermaid/Vega settings as the editor while remaining easy to exercise in
 * isolation.
 */

import {
    mermaidConfigResourceRefusal,
    mermaidCssRefusal,
    mermaidMarkupResourceRefusal,
    mermaidResourceRefusal,
    mermaidResourceRefusalMessage,
    mermaidSourceResourceRefusal,
    mermaidSvgAttributeIsUnsafe,
    planMermaidSourceRender,
    planVegaResourceAccess,
    vegaResourceRefusalMessage,
} from './core/diagramSecurityModel.js';
import {
    mermaidPaletteCount,
    mermaidSourceWithApplicationTheme,
    mermaidSourceWithoutManagedNodeStyles,
} from './core/mermaidStyleEditorModel.js';
import {
    diagramRenderCacheKey,
    rebaseDiagramSvgIds,
    rebaseSvgAttribute,
    vegaRenderCacheKey,
    vegaRenderDimensions,
} from './core/diagramRenderCacheModel.js';
import { createDiagramOutputReuse } from './usecases/diagramOutputReuse.js';
import { createMermaidValidationReuse } from './usecases/mermaidValidationReuse.js';

export const diagramLanguages = ['mermaid', 'vega', 'vega-lite'];

let initializedMermaid = null;
let mermaidGeneration = 0;
let renderSequence = 0;
const DIAGRAM_RENDER_CACHE_LIMIT = 64;
const diagramRenderCache = new Map();
const pendingDiagramRenders = new Map();
let mermaidJob = Promise.resolve();
const reuseMermaidValidation = createMermaidValidationReuse((code, mermaid) => withMermaid(() => mermaid.parse(code)));
let initializedVega = null;
let observedFonts = null;
let fontGeneration = 0;
const vegaOutput = createDiagramOutputReuse({ render: renderVegaOutput });

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
    observeDiagramFonts();
    if (initializedMermaid === mermaid) return true;

    mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        // Mermaid's `strict` level passes the finished SVG through a
        // sanitizer that also removes every <use>, which is how tree-view
        // diagrams draw their file and folder icons. Loose keeps them; what it
        // would let a note plant, a script link, is removed by
        // safeMermaidSvg before the SVG reaches the page.
        securityLevel: 'loose',
        // Mermaid passes every label through DOMPurify with this
        // configuration before drawing it into the live page. DOMPurify hands
        // its result to a Trusted Types policy's createHTML; this one removes
        // whatever would load from outside the vault, so a label's image or
        // CSS url() is never fetched. `style` stays forbidden, as in Mermaid's
        // default, and a diagram's own config cannot replace any of it.
        dompurifyConfig: {
            FORBID_TAGS: ['style'],
            RETURN_TRUSTED_TYPE: true,
            TRUSTED_TYPES_POLICY: { createHTML: mermaidLabelHtmlWithinVault, createScriptURL: url => url },
        },
        secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'dompurifyConfig'],
    });
    diagramRenderCache.clear();
    pendingDiagramRenders.clear();
    initializedMermaid = mermaid;
    mermaidGeneration++;
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

function mermaidResourceRefusedError(uri) {
    const error = new Error(mermaidResourceRefusalMessage(uri));
    error.code = 'mermaid-resource-refused';
    return error;
}

// Addresses the label policy removed during the current Mermaid job. Jobs are
// serialized by withMermaid, so one list at a time is enough.
let mermaidLabelRefusals = null;

/**
 * The Trusted Types createHTML that DOMPurify calls with each Mermaid label,
 * before parsing it and again with the sanitized result. Removes every
 * attribute or style element that would load from outside the vault and
 * remembers the address, so the render can be refused with a reason.
 */
function mermaidLabelHtmlWithinVault(html) {
    const text = String(html ?? '');
    if (!text.includes('<')) return text;
    const baseUrl = document.baseURI;
    const host = document.createElement('template');
    host.innerHTML = text;
    let changed = false;
    const refuse = address => {
        mermaidLabelRefusals?.push(address);
        changed = true;
    };
    for (const element of host.content.querySelectorAll('*')) {
        if (element.localName === 'style') {
            const refused = mermaidCssRefusal(element.textContent, { baseUrl });
            if (refused !== null) {
                element.remove();
                refuse(refused);
            }
            continue;
        }
        for (const attribute of [...element.attributes]) {
            const refused = mermaidMarkupResourceRefusal(element.localName, attribute.name, attribute.value, { baseUrl });
            if (refused === null) continue;
            element.removeAttributeNode(attribute);
            refuse(refused);
        }
    }
    return changed ? host.innerHTML : text;
}

/**
 * Refuse, before Mermaid draws anything into the page, a diagram whose
 * configuration, image shapes or style statements would load from outside the
 * vault. Parsing alone fetches nothing; it also runs every flowchart label
 * through the label policy above.
 */
async function assertMermaidResourcesAllowed(mermaid, code) {
    const baseUrl = document.baseURI;
    const fromSource = mermaidSourceResourceRefusal(code, { baseUrl });
    if (fromSource !== null) throw mermaidResourceRefusedError(fromSource);
    // A failed parse still applies the diagram's configuration to Mermaid's
    // error drawing, so it is reported without drawing anything.
    const parsed = await mermaid.parse(code);
    const fromConfig = mermaidConfigResourceRefusal(parsed?.config, { baseUrl });
    if (fromConfig !== null) throw mermaidResourceRefusedError(fromConfig);
    // Only flowchart shape data (`A@{ img: … }`) gives a node an image.
    if (String(parsed?.diagramType || '').startsWith('flowchart') && /@\s*\{/.test(code)) {
        const getDiagram = mermaid.mermaidAPI?.getDiagramFromText;
        if (typeof getDiagram !== 'function') throw new Error('Mermaid renderer is unavailable');
        const diagram = await getDiagram(code);
        for (const vertex of diagram?.db?.getVertices?.()?.values?.() || []) {
            const refused = mermaidResourceRefusal(vertex?.img, { baseUrl });
            if (refused !== null) throw mermaidResourceRefusedError(refused);
        }
    }
    if (mermaidLabelRefusals?.length) throw mermaidResourceRefusedError(mermaidLabelRefusals[0]);
}

async function renderMermaidWithinVault(renderId, code) {
    mermaidLabelRefusals = [];
    try {
        await assertMermaidResourcesAllowed(window.mermaid, code);
        const result = await window.mermaid.render(renderId, code);
        if (mermaidLabelRefusals.length) throw mermaidResourceRefusedError(mermaidLabelRefusals[0]);
        return result;
    } finally {
        mermaidLabelRefusals = null;
    }
}

/**
 * Drop what a diagram's own source could turn into script in the page: a
 * `click … href "javascript:…"` link, an event-handler attribute, a script
 * element. Refuse the drawing if anything in it would still load from
 * outside the vault once it joins the page. A drawing without any of them is
 * returned exactly as rendered.
 */
function safeMermaidSvg(svg) {
    const baseUrl = document.baseURI;
    const host = document.createElement('template');
    host.innerHTML = svg;
    let changed = false;
    for (const element of host.content.querySelectorAll('*')) {
        if (element.localName === 'script') {
            element.remove();
            changed = true;
            continue;
        }
        if (element.localName === 'style') {
            const refused = mermaidCssRefusal(element.textContent, { baseUrl });
            if (refused !== null) throw mermaidResourceRefusedError(refused);
        }
        for (const attribute of [...element.attributes]) {
            if (mermaidSvgAttributeIsUnsafe(element.localName, attribute.name, attribute.value)) {
                element.removeAttributeNode(attribute);
                changed = true;
                continue;
            }
            const refused = mermaidMarkupResourceRefusal(element.localName, attribute.name, attribute.value, { baseUrl });
            if (refused !== null) throw mermaidResourceRefusedError(refused);
        }
    }
    return changed ? host.innerHTML : svg;
}

async function renderMermaidSVG(code, idPrefix, key) {
    const targetId = nextMermaidRenderId(idPrefix);
    const cached = key ? readCachedDiagram(key) : null;
    if (cached) return rebaseDiagramSvgIds(cached.svg, cached.renderId, targetId);

    let pending = key ? pendingDiagramRenders.get(key) : null;
    if (!pending) {
        const renderId = targetId;
        pending = withMermaid(() => renderMermaidWithinVault(renderId, code))
            .then(result => {
                const rendered = typeof result?.svg === 'string' && result.svg ? result.svg : null;
                if (!rendered) return null;
                const entry = { svg: safeMermaidSvg(rendered), renderId };
                if (key) writeCachedDiagram(key, entry);
                return entry;
            })
            .finally(() => {
                if (pendingDiagramRenders.get(key) === pending) pendingDiagramRenders.delete(key);
            });
        if (key) pendingDiagramRenders.set(key, pending);
    }

    const entry = await pending;
    return entry ? rebaseDiagramSvgIds(entry.svg, entry.renderId, targetId) : null;
}

export function initializeDiagramRenderers() {
    return {
        mermaid: initialiseMermaid(),
        vega: initialiseVega(),
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
    return reuseMermaidValidation(code, initializedMermaid);
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

function applicationThemedMermaidSource(source) {
    const border = cssThemeValue('--border-color', '#62594f');
    return mermaidSourceWithApplicationTheme(source, {
        primaryColor: cssThemeValue('--panel-bg', '#24211d'),
        primaryBorderColor: cssThemeValue('--border-light', border),
        primaryTextColor: cssThemeValue('--text-color', '#f5eee4'),
        secondaryColor: cssThemeValue('--hover-bg', '#29251f'),
        tertiaryColor: cssThemeValue('--active-bg', '#3b2924'),
        lineColor: cssThemeValue('--text-muted', '#b9ac9e'),
    }).source;
}

function createVegaRenderTarget({ width, height }) {
    const target = document.createElement('div');
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

function initialiseVega() {
    const embed = typeof window !== 'undefined' ? window.vegaEmbed : null;
    if (typeof embed !== 'function') return false;
    if (initializedVega !== embed) {
        vegaOutput.clear();
        initializedVega = embed;
    }
    observeDiagramFonts();
    return true;
}

function observeDiagramFonts() {
    if (typeof document !== 'undefined' && document.fonts && observedFonts !== document.fonts) {
        observedFonts = document.fonts;
        const invalidate = () => {
            fontGeneration++;
            vegaOutput.clear();
            diagramRenderCache.clear();
        };
        observedFonts.addEventListener('loadingdone', invalidate);
        observedFonts.addEventListener('loadingerror', invalidate);
    }
}

function diagramFontIdentity() {
    if (typeof document === 'undefined') return [fontGeneration];
    const style = getComputedStyle(document.documentElement);
    return [fontGeneration, document.fonts?.status, style.font,
        style.getPropertyValue('--font-editor').trim(), style.getPropertyValue('--font-ui').trim()];
}

/**
 * The only way a chart reaches data, images and links. Vega asks its loader
 * for all three, so every render gets one that follows the vault-only policy;
 * a refused source is remembered because Vega itself only logs a failed load
 * and would draw an empty chart.
 */
function createVegaResourceGuard() {
    const refused = [];
    const baseUrl = document.baseURI;
    const allowed = (uri, context) => {
        const decision = planVegaResourceAccess(uri, { context, baseUrl });
        if (decision.action !== 'refuse') return decision.url;
        // No `url` on the error: Vega writes a rejected image's `url` into the SVG.
        const error = new Error(vegaResourceRefusalMessage(uri));
        error.code = 'vega-resource-refused';
        refused.push(error);
        throw error;
    };
    const loader = {};
    // A spec can carry embed options that are merged into the loader; the two
    // functions Vega calls stay ours.
    Object.defineProperties(loader, {
        sanitize: {
            enumerable: true,
            value: async (uri, options) => {
                if (options?.context !== 'href') return { href: allowed(uri, options?.context || 'dataflow') };
                // Vega reads a link's attributes without checking for a refusal,
                // so an unsafe link resolves to none and the mark is drawn unlinked.
                const link = planVegaResourceAccess(uri, { context: 'href', baseUrl });
                return link.action === 'link' ? { href: link.url } : {};
            },
        },
        load: {
            enumerable: true,
            value: async (uri, options) => {
                const url = allowed(uri, 'dataflow');
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
                const read = response[options?.response];
                return typeof read === 'function' ? read.call(response) : response.text();
            },
        },
    });
    return { loader, assertNothingRefused() { if (refused.length) throw refused[0]; } };
}

async function renderVegaOutput({ language, spec, dimensions, embed }) {
    // Connected geometry is required for portable width: "container" in WebKit.
    const target = createVegaRenderTarget(dimensions);
    const resources = createVegaResourceGuard();
    let result;
    try {
        result = await embed(target, spec, { mode: language, actions: false, renderer: 'svg', loader: resources.loader });
        if (typeof result?.view?.toSVG !== 'function') return null;
        const svg = await result.view.toSVG();
        resources.assertNothingRefused();
        return assertRenderableVegaSVG(svg);
    } finally {
        try { result?.view?.finalize?.(); } finally { target.remove(); }
    }
}

function uniqueVegaSvg(svg, idPrefix) {
    if (!svg) return svg;
    const host = document.createElement('template');
    host.innerHTML = svg;
    const prefix = `${String(idPrefix || 'figaro-diagram').replace(/[^\w-]/gu, '-')}-vega-${++renderSequence}`;
    const ids = new Map([...host.content.querySelectorAll('[id]')]
        .map((element, index) => [element.id, `${prefix}-${index}`]));
    if (!ids.size) return svg;
    for (const element of host.content.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
            const value = rebaseSvgAttribute(attribute.name, attribute.value, ids);
            if (value !== attribute.value) attribute.value = value;
        }
    }
    return host.innerHTML;
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

function diagramRenderInputs(language, source, options) {
    const normalizedLanguage = String(language || '').trim().toLowerCase();
    const code = String(source || '');

    if (normalizedLanguage === 'mermaid') {
        assertMermaidSourceAllowed(code);
        if (!initialiseMermaid()) return null;
        const renderSource = options.appearance === 'application'
            ? applicationThemedMermaidSource(code)
            : code;
        const key = typeof document !== 'undefined' && document.fonts?.status === 'loading' ? null
            : JSON.stringify([mermaidGeneration, diagramRenderCacheKey('mermaid', renderSource), diagramFontIdentity()]);
        return { language: normalizedLanguage, renderer: initializedMermaid, code: renderSource, key };
    }

    if ((normalizedLanguage === 'vega' || normalizedLanguage === 'vega-lite') &&
        initialiseVega() &&
        typeof document !== 'undefined') {
        const authoredSpec = JSON.parse(code);
        const spec = options.appearance === 'application'
            ? applicationThemedVegaSpec(authoredSpec)
            : authoredSpec;
        const dimensions = vegaRenderDimensions(options.containerWidth, spec.height);
        const fonts = diagramFontIdentity();
        const key = document.fonts?.status === 'loading' ? null
            : vegaRenderCacheKey(normalizedLanguage, spec, dimensions, fonts);
        return { language: normalizedLanguage, renderer: initializedVega, spec, dimensions, key };
    }

    return null;
}

/** Identity for completed live previews, using the renderer's exact reuse policy. */
export function diagramRenderIdentity(language, source, options = {}) {
    const input = diagramRenderInputs(language, source, options);
    return input?.key ? { key: input.key, renderer: input.renderer } : null;
}

/**
 * Render a diagram source block to standalone SVG. Unsupported renderers
 * return null; malformed diagram input rejects so callers can keep the
 * original source block visible instead of losing document content.
 */
export async function renderDiagramSVG(language, source, idPrefix = 'figaro-diagram', options = {}) {
    const input = diagramRenderInputs(language, source, options);
    if (!input) return null;
    if (input.language === 'mermaid') return renderMermaidSVG(input.code, idPrefix, input.key);
    const svg = await vegaOutput.render(input.key, {
        language: input.language, spec: input.spec, dimensions: input.dimensions, embed: input.renderer,
    });
    return uniqueVegaSvg(svg, idPrefix);
}

/**
 * Shared SVG renderers for live Markdown previews and printable exports.
 *
 * Keeping this outside the CodeMirror extension means exports use the same
 * Mermaid/Vega settings as the editor while remaining easy to exercise in
 * isolation.
 */

import { planMermaidSourceRender } from './core/diagramSecurityModel.js';

export const diagramLanguages = ['mermaid', 'vega', 'vega-lite'];

let initializedMermaid = null;
let renderSequence = 0;

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
    initializedMermaid = mermaid;
    return true;
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
    return window.mermaid.parse(code);
}

/**
 * Render a diagram source block to standalone SVG. Unsupported renderers
 * return null; malformed diagram input rejects so callers can keep the
 * original source block visible instead of losing document content.
 */
export async function renderDiagramSVG(language, source, idPrefix = 'figaro-diagram') {
    const normalizedLanguage = String(language || '').trim().toLowerCase();
    const code = String(source || '');

    if (normalizedLanguage === 'mermaid') {
        assertMermaidSourceAllowed(code);
        if (!initialiseMermaid()) return null;
        renderSequence += 1;
        const id = String(idPrefix || 'figaro-diagram') + '-mermaid-' + renderSequence;
        const result = await window.mermaid.render(id, code);
        return typeof result?.svg === 'string' && result.svg ? result.svg : null;
    }

    if ((normalizedLanguage === 'vega' || normalizedLanguage === 'vega-lite') &&
        typeof window !== 'undefined' &&
        typeof window.vegaEmbed === 'function' &&
        typeof document !== 'undefined') {
        const spec = JSON.parse(code);
        const target = document.createElement('div');
        let result;

        try {
            result = await window.vegaEmbed(target, spec, {
                mode: normalizedLanguage === 'vega-lite' ? 'vega-lite' : 'vega',
                actions: false,
                renderer: 'svg',
            });
            if (typeof result?.view?.toSVG !== 'function') return null;
            return await result.view.toSVG();
        } finally {
            result?.view?.finalize?.();
        }
    }

    return null;
}

/**
 * Browser bridge for the existing, locally vendored KaTeX UMD build.
 *
 * The print renderer bundle deliberately reuses window.katex instead of
 * bundling a second copy of KaTeX. index.html loads that local asset before
 * any application module runs.
 */
class MissingKatexParseError extends Error {}

export const ParseError = globalThis.katex?.ParseError || MissingKatexParseError;

export function renderToString(...args) {
    const katex = globalThis.katex;
    if (!katex || typeof katex.renderToString !== 'function') {
        throw new Error('KaTeX renderer is unavailable');
    }
    return katex.renderToString(...args);
}

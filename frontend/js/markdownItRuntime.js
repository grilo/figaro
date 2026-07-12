/**
 * Browser bridge for the existing, locally vendored markdown-it UMD build.
 *
 * The maintained @mdit plugins are ESM packages. The vendor bundle aliases
 * their markdown-it import to this bridge so Figaro keeps one copy of the
 * parser and the application's existing script-load order remains intact.
 */
export default function markdownIt(options) {
    if (typeof globalThis.markdownit !== 'function') {
        throw new Error('Markdown renderer is unavailable');
    }
    return globalThis.markdownit(options);
}

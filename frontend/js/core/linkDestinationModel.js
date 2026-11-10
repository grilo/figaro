/**
 * Whether a link or image destination leaves the vault, by the rule the
 * rename/move link rewriter applies (isExternalMarkdownDestination in
 * internal/links/rewrite.go): a "#heading", a protocol-relative "//host"
 * address, or a URL. A colon alone does not make a URL, because it is an
 * ordinary filename character: "Re: plan.md" and "v1.2:notes.md" are notes.
 * A destination is a URL only when its scheme is followed by "//"
 * ("https://…", "obsidian://…") or is one of the schemes written without an
 * authority ("mailto:", "data:"). The print renderer and PDF preview use it so
 * a note reads the same there as in the editor.
 */
export const OPAQUE_URL_SCHEMES = new Set([
    'about', 'bitcoin', 'blob', 'callto', 'cid', 'data', 'facetime', 'facetime-audio', 'file', 'geo',
    'im', 'javascript', 'magnet', 'mailto', 'maps', 'message', 'mid', 'news', 'obsidian', 'sip', 'sips',
    'skype', 'sms', 'smsto', 'spotify', 'tel', 'urn', 'vbscript', 'view-source', 'xmpp',
]);

const URL_SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;

export function isExternalLinkDestination(value) {
    const destination = String(value ?? '');
    if (destination.startsWith('#') || destination.startsWith('//')) return true;
    const scheme = URL_SCHEME.exec(destination);
    if (!scheme) return false;
    return destination.slice(scheme[0].length).startsWith('//') || OPAQUE_URL_SCHEMES.has(scheme[1].toLowerCase());
}

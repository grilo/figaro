/**
 * Escaping for strings placed into markup.
 *
 * One function serves both text and quoted attribute values, so a file name
 * such as `a" onmouseover="…` cannot leave the attribute it was written into.
 * Escaping through a detached element's textContent does not cover that case:
 * it leaves quotes as they are.
 */
const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
    '`': '&#96;',
};

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"'`]/g, character => htmlEntities[character]);
}

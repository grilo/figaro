export const MAX_MERMAID_SOURCE_LENGTH = 50_000;

function leadingMermaidFrontmatter(source) {
    const lines = String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines[0]?.trim() !== '---') return '';

    const closingLine = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (closingLine < 0) return '';
    return lines.slice(1, closingLine).join('\n');
}

function containsOrderedMapTag(frontmatter) {
    const decoded = frontmatter.replace(/%([0-9a-f]{2})/gi, (_match, hex) => (
        String.fromCharCode(Number.parseInt(hex, 16))
    ));
    const normalized = decoded.toLowerCase();
    return normalized.includes('tag:yaml.org,2002:omap')
        || /(?:^|[\s[\]{},:])!!omap(?=$|[\s[\]{},])/.test(normalized)
        || /(?:^|[\s[\]{},:])![a-z-]+!omap(?=$|[\s[\]{},])/.test(normalized);
}

/**
 * Decide whether Mermaid source may reach the vendored parser. Mermaid's own
 * 50,000-character ceiling is applied after YAML frontmatter parsing, so the
 * same limit must be enforced before that parser runs.
 */
export function planMermaidSourceRender(source, maxLength = MAX_MERMAID_SOURCE_LENGTH) {
    const code = String(source || '');
    const safeLimit = Math.max(0, Math.floor(Number(maxLength) || 0));

    if (code.length > safeLimit) {
        return {
            action: 'preserve-source',
            reason: 'source-too-large',
            maxLength: safeLimit,
        };
    }

    const frontmatter = leadingMermaidFrontmatter(code);
    if (containsOrderedMapTag(frontmatter)) {
        return {
            action: 'preserve-source',
            reason: 'unsafe-yaml-ordered-map',
            maxLength: safeLimit,
        };
    }

    return {
        action: 'render',
        reason: null,
        maxLength: safeLimit,
    };
}

const SCRIPT_URL_SCHEME = /^(?:javascript|vbscript):/i;
const DATA_URL_SCHEME = /^data:/i;

/**
 * Whether an attribute of a rendered Mermaid SVG must be dropped before the
 * drawing joins the application's own page. Mermaid runs at its `loose`
 * level (see diagramRenderer.js), which writes a `click … href` address into
 * the SVG as given, so a note could otherwise plant a `javascript:` link.
 *
 * Unsafe are: any event-handler attribute, a script address in any link
 * attribute, and a `data:` address anywhere but an image. Fragment, relative,
 * web and mail addresses stay. The value is the parsed attribute value; a
 * browser ignores control characters and spaces in a scheme, so they are
 * ignored here too.
 */
export function mermaidSvgAttributeIsUnsafe(elementName, attributeName, value) {
    const name = String(attributeName || '').toLowerCase();
    if (name.startsWith('on')) return true;
    if (name !== 'href' && name !== 'xlink:href' && name !== 'src' && name !== 'action' && name !== 'formaction') return false;
    // eslint-disable-next-line no-control-regex
    const address = String(value ?? '').replace(/[\u0000-\u0020\u007f-\u009f\u00a0\u2028\u2029\ufeff]/g, '');
    if (SCRIPT_URL_SCHEME.test(address)) return true;
    const element = String(elementName || '').toLowerCase();
    return DATA_URL_SCHEME.test(address) && element !== 'image' && element !== 'img';
}

/** The route the application serves the open vault under ("Vault Image Serving" in docs/PROMPT.md). */
export const VEGA_VAULT_ROUTE = '/vault/';
const VEGA_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function parsedURL(value, base) {
    try {
        return base === undefined ? new URL(value) : new URL(value, base);
    } catch (_) {
        return null;
    }
}

function refuseVegaResource(reason) {
    return { action: 'refuse', reason, url: '' };
}

/**
 * Decide what a Vega or Vega-Lite spec may reach while it renders. A chart
 * lives in a note, so opening the note must not contact the network or read
 * the disk: data and image marks may only name a file of the open vault on the
 * application's own origin (`/vault/…`), plus an image inlined as `data:`.
 * A hyperlink is not fetched; it is kept only as an absolute web or mail
 * address.
 *
 * `context` is the one Vega passes its loader: 'dataflow' for data, 'image'
 * for image marks and 'href' for links. Anything else is treated as data.
 * `baseUrl` is the address of the document that renders the chart.
 */
export function planVegaResourceAccess(uri, { context = 'dataflow', baseUrl = '' } = {}) {
    const value = typeof uri === 'string' ? uri.trim() : '';
    if (!value) return refuseVegaResource('invalid');

    const absolute = parsedURL(value);
    if (context === 'href') {
        return absolute && VEGA_LINK_PROTOCOLS.has(absolute.protocol)
            ? { action: 'link', reason: null, url: absolute.href }
            : refuseVegaResource('unsupported-link');
    }
    if (context === 'image' && absolute?.protocol === 'data:') {
        return /^image\//i.test(absolute.pathname)
            ? { action: 'load', reason: null, url: absolute.href }
            : refuseVegaResource('outside-vault');
    }

    const base = parsedURL(String(baseUrl || ''));
    const resolved = base ? parsedURL(value, base) : null;
    if (!base || !resolved) return refuseVegaResource('invalid');
    // `origin` is "null" for the wails: scheme, so compare its parts instead.
    if (resolved.protocol !== base.protocol || resolved.host !== base.host || !base.host) {
        return refuseVegaResource('remote');
    }
    if (resolved.username || resolved.password) return refuseVegaResource('remote');
    // URL parsing has already resolved ".." and "%2e%2e" segments, and "\" on an
    // http origin; the vault server contains whatever remains inside the vault.
    if (!resolved.pathname.startsWith(VEGA_VAULT_ROUTE) || resolved.pathname.length === VEGA_VAULT_ROUTE.length) {
        return refuseVegaResource('outside-vault');
    }
    return { action: 'load', reason: null, url: resolved.pathname + resolved.search };
}

/** The message a chart's error state shows for a refused data or image source. */
export function vegaResourceRefusalMessage(uri) {
    const text = String(uri ?? '').trim();
    const source = text.length > 80 ? `${text.slice(0, 79)}…` : text;
    return `This chart asks for ${source ? `“${source}”` : 'an empty address'}. `
        + `Charts only load data and images from this vault, never from the network or elsewhere on this computer. Use a ${VEGA_VAULT_ROUTE}… path.`;
}

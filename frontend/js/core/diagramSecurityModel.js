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

function quotedSource(uri) {
    const text = String(uri ?? '').trim();
    const source = text.length > 80 ? `${text.slice(0, 79)}…` : text;
    return source ? `“${source}”` : 'an empty address';
}

/** The message a chart's error state shows for a refused data or image source. */
export function vegaResourceRefusalMessage(uri) {
    return `This chart asks for ${quotedSource(uri)}. `
        + `Charts only load data and images from this vault, never from the network or elsewhere on this computer. Use a ${VEGA_VAULT_ROUTE}… path.`;
}

// ---------------------------------------------------------------------------
// What a Mermaid diagram may load while it renders. Mermaid draws into the
// live page to measure text, so an image or a CSS url() reached by a note's
// diagram is fetched during the render, before any finished SVG could be
// cleaned. The same vault-only rule as Vega charts therefore has to hold for
// every address Mermaid could hand the page.

const CSS_IMAGE_FUNCTIONS = new Set(['image-set', '-webkit-image-set', 'cross-fade', '-webkit-cross-fade']);
const CSS_WHITESPACE = /[ \t\n\r\f]/;
const CSS_IDENT_CHAR = /[A-Za-z0-9_-]/;

function isCssIdentStart(text, index) {
    const char = text[index];
    if (char === undefined) return false;
    if (char === '\\') return text[index + 1] !== undefined && text[index + 1] !== '\n';
    return CSS_IDENT_CHAR.test(char) || char.charCodeAt(0) >= 0x80;
}

/** Decode the CSS escape starting at text[index] (a backslash). */
function readCssEscape(text, index) {
    const hex = /^[0-9a-fA-F]{1,6}/.exec(text.slice(index + 1, index + 7));
    if (hex) {
        let end = index + 1 + hex[0].length;
        if (text[end] === '\r' && text[end + 1] === '\n') end += 2;
        else if (CSS_WHITESPACE.test(text[end] || '')) end += 1;
        const codePoint = Number.parseInt(hex[0], 16);
        const valid = codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
        return { value: valid ? String.fromCodePoint(codePoint) : '�', end };
    }
    if (index + 1 >= text.length) return { value: '�', end: index + 1 };
    return { value: text[index + 1], end: index + 2 };
}

function readCssIdent(text, index) {
    let value = '';
    let at = index;
    while (isCssIdentStart(text, at)) {
        if (text[at] === '\\') {
            const escape = readCssEscape(text, at);
            value += escape.value;
            at = escape.end;
        } else {
            value += text[at];
            at += 1;
        }
    }
    return { value, end: at };
}

function readCssString(text, index) {
    const quote = text[index];
    let value = '';
    let at = index + 1;
    while (at < text.length && text[at] !== quote && text[at] !== '\n') {
        if (text[at] === '\\') {
            if (text[at + 1] === '\n') { at += 2; continue; }
            const escape = readCssEscape(text, at);
            value += escape.value;
            at = escape.end;
        } else {
            value += text[at];
            at += 1;
        }
    }
    return { value, end: Math.min(text.length, at + 1) };
}

function skipCssSpace(text, index, comments) {
    let at = index;
    for (;;) {
        while (CSS_WHITESPACE.test(text[at] || '')) at += 1;
        if (!comments || text[at] !== '/' || text[at + 1] !== '*') return at;
        const close = text.indexOf('*/', at + 2);
        at = close < 0 ? text.length : close + 2;
    }
}

/** The argument of a url( token that starts at text[index], just past the parenthesis. */
function readCssUrlArgument(text, index) {
    const start = skipCssSpace(text, index, false);
    if (text[start] === '"' || text[start] === '\'') return readCssString(text, start);
    let value = '';
    let at = start;
    while (at < text.length && text[at] !== ')' && !CSS_WHITESPACE.test(text[at])) {
        if (text[at] === '\\') {
            const escape = readCssEscape(text, at);
            value += escape.value;
            at = escape.end;
        } else {
            value += text[at];
            at += 1;
        }
    }
    return { value, end: at };
}

/**
 * Every address a piece of CSS would fetch: the target of each url(), each
 * string inside image-set() or cross-fade(), and each @import. Escapes are
 * decoded the way a browser's CSS tokenizer decodes them, so `\75 rl(` is
 * still a url().
 *
 * With `strings: false` the text is not trusted to be CSS (a whole diagram
 * source): quotes do not open strings that could hide a url(, comments are not
 * skipped, and only the url( and image functions themselves are read.
 */
export function cssResourceAddresses(text, { strings = true } = {}) {
    const css = String(text ?? '');
    const addresses = [];
    const functions = [];
    let at = 0;
    while (at < css.length) {
        const char = css[at];
        if (strings && char === '/' && css[at + 1] === '*') {
            const close = css.indexOf('*/', at + 2);
            at = close < 0 ? css.length : close + 2;
            continue;
        }
        if (char === '"' || char === '\'') {
            const insideImageFunction = CSS_IMAGE_FUNCTIONS.has(functions[functions.length - 1]);
            if (strings || insideImageFunction) {
                const string = readCssString(css, at);
                if (insideImageFunction) addresses.push({ address: string.value, kind: 'image' });
                at = string.end;
                continue;
            }
            at += 1;
            continue;
        }
        if (char === '@') {
            const keyword = readCssIdent(css, at + 1);
            if (keyword.value.toLowerCase() === 'import') {
                let next = skipCssSpace(css, keyword.end, strings);
                let address = '';
                if (css[next] === '"' || css[next] === '\'') {
                    const string = readCssString(css, next);
                    address = string.value;
                    next = string.end;
                } else {
                    const name = readCssIdent(css, next);
                    if (name.value.toLowerCase() === 'url' && css[name.end] === '(') {
                        functions.push('url');
                        const argument = readCssUrlArgument(css, name.end + 1);
                        address = argument.value;
                        next = argument.end;
                    }
                }
                addresses.push({ address, kind: 'import' });
                at = Math.max(next, keyword.end);
                continue;
            }
            at = Math.max(at + 1, keyword.end);
            continue;
        }
        if (isCssIdentStart(css, at)) {
            const ident = readCssIdent(css, at);
            at = ident.end;
            if (css[at] !== '(') continue;
            const name = ident.value.toLowerCase();
            functions.push(name);
            if (name === 'url') {
                const argument = readCssUrlArgument(css, at + 1);
                addresses.push({ address: argument.value, kind: 'image' });
                at = argument.end;
                continue;
            }
            at += 1;
            continue;
        }
        if (char === '(') functions.push('(');
        else if (char === ')') functions.pop();
        at += 1;
    }
    return addresses;
}

function sameDocumentReference(value, base) {
    if (value.startsWith('#')) return true;
    const resolved = base ? parsedURL(value, base) : null;
    if (!resolved || !resolved.hash) return false;
    return resolved.href.slice(0, resolved.href.length - resolved.hash.length)
        === base.href.slice(0, base.href.length - base.hash.length);
}

/**
 * Whether a Mermaid diagram may load `uri` as an image: a file of the open
 * vault on the application's own origin, an inline `data:image/…`, or a
 * reference into the drawing itself (`#id`, as markers and icons use). An
 * empty address loads nothing. Returns the refused address, or null.
 */
export function mermaidResourceRefusal(uri, { baseUrl = '' } = {}) {
    const value = String(uri ?? '').trim();
    if (!value) return null;
    if (sameDocumentReference(value, parsedURL(String(baseUrl || '')))) return null;
    return planVegaResourceAccess(value, { context: 'image', baseUrl }).action === 'load' ? null : value;
}

/** The first address in some CSS that a diagram may not load (an @import never may), or null. */
export function mermaidCssRefusal(css, { baseUrl = '' } = {}) {
    for (const { address, kind } of cssResourceAddresses(css)) {
        if (kind === 'import') return address || '@import';
        const refused = mermaidResourceRefusal(address, { baseUrl });
        if (refused !== null) return refused;
    }
    return null;
}

const MERMAID_RESOURCE_ATTRIBUTES = new Set(['src', 'poster', 'background', 'data', 'lowsrc', 'dynsrc']);
const MERMAID_LINK_ELEMENTS = new Set(['a', 'area']);
const MERMAID_CSS_ATTRIBUTES = new Set([
    'style', 'fill', 'stroke', 'filter', 'mask', 'clip-path', 'cursor',
    'marker', 'marker-start', 'marker-mid', 'marker-end',
]);

/** The addresses of a `srcset` or `imagesrcset` value, without their descriptors. */
export function srcsetAddresses(value) {
    const text = String(value ?? '');
    const addresses = [];
    let at = 0;
    while (at < text.length) {
        while (at < text.length && /[\s,]/.test(text[at])) at += 1;
        let end = at;
        while (end < text.length && !/\s/.test(text[end])) end += 1;
        if (end === at) break;
        const candidate = text.slice(at, end);
        if (candidate.endsWith(',')) {
            addresses.push(candidate.replace(/,+$/, ''));
            at = end;
            continue;
        }
        addresses.push(candidate);
        let depth = 0;
        at = end;
        while (at < text.length && (text[at] !== ',' || depth > 0)) {
            if (text[at] === '(') depth += 1;
            else if (text[at] === ')') depth = Math.max(0, depth - 1);
            at += 1;
        }
    }
    return addresses;
}

/**
 * The first address an element attribute in Mermaid output or label HTML
 * would load against the vault-only rule, or null. Links (`<a href>`,
 * `action`) are navigation rather than loads and are judged by
 * mermaidSvgAttributeIsUnsafe instead. `value` is the parsed attribute value.
 */
export function mermaidMarkupResourceRefusal(elementName, attributeName, value, { baseUrl = '' } = {}) {
    const element = String(elementName || '').toLowerCase();
    const name = String(attributeName || '').toLowerCase();
    const text = String(value ?? '');
    if (name === 'srcset' || name === 'imagesrcset') {
        for (const address of srcsetAddresses(text)) {
            const refused = mermaidResourceRefusal(address, { baseUrl });
            if (refused !== null) return refused;
        }
        return null;
    }
    if (MERMAID_RESOURCE_ATTRIBUTES.has(name)) return mermaidResourceRefusal(text, { baseUrl });
    if (name === 'href' || name === 'xlink:href') {
        return MERMAID_LINK_ELEMENTS.has(element) ? null : mermaidResourceRefusal(text, { baseUrl });
    }
    return MERMAID_CSS_ATTRIBUTES.has(name) ? mermaidCssRefusal(text, { baseUrl }) : null;
}

/**
 * The first CSS address anywhere in a diagram's source that would leave the
 * application: another host, a protocol-relative or `file:` address, or any
 * scheme but `data:`. Mermaid copies `classDef`, `style` and similar
 * statements of many diagram types into the page's CSS, so the source is
 * searched without knowing each grammar. Ordinary text can mention `url(`,
 * so an address on the application's own origin is left to the exact checks
 * of the parsed configuration, the label HTML and the finished SVG.
 */
export function mermaidSourceResourceRefusal(source, { baseUrl = '' } = {}) {
    const base = parsedURL(String(baseUrl || ''));
    for (const { address } of cssResourceAddresses(source, { strings: false })) {
        const value = address.trim();
        if (!value || value.startsWith('#')) continue;
        const resolved = base ? parsedURL(value, base) : parsedURL(value);
        if (!resolved) continue;
        if (resolved.protocol === 'data:') continue;
        if (!base || resolved.protocol !== base.protocol || resolved.host !== base.host || resolved.username || resolved.password) {
            return value;
        }
    }
    return null;
}

/**
 * The first address a diagram's own configuration (frontmatter `config` and
 * `%%{init}%%` directives, as Mermaid parsed them) would load through CSS:
 * `themeCSS`, a font family or a theme variable is written into the drawing's
 * stylesheet or style attributes as given. Every string is checked, whichever
 * key holds it.
 */
export function mermaidConfigResourceRefusal(config, { baseUrl = '' } = {}) {
    const seen = new Set();
    const visit = (value, depth) => {
        if (typeof value === 'string') return mermaidCssRefusal(value, { baseUrl });
        if (!value || typeof value !== 'object' || depth > 16 || seen.has(value)) return null;
        seen.add(value);
        for (const entry of Array.isArray(value) ? value : Object.values(value)) {
            const refused = visit(entry, depth + 1);
            if (refused !== null) return refused;
        }
        return null;
    };
    return visit(config, 0);
}

/** The message a diagram's error state shows for a refused image or stylesheet. */
export function mermaidResourceRefusalMessage(uri) {
    return `This diagram asks for ${quotedSource(uri)}. `
        + `Diagrams only load images from this vault, never from the network or elsewhere on this computer. Use a ${VEGA_VAULT_ROUTE}… path.`;
}

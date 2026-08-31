/**
 * Canonical Markdown-It configuration for printable Markdown documents.
 *
 * This source file is bundled into frontend/vendored/markdown-it-plugins by
 * `npm run vendor:markdown`; browser code imports only that local artifact.
 */
import MarkdownIt from 'markdown-it';
import { anchor } from '@mdit/plugin-anchor';
import { footnote } from '@mdit/plugin-footnote';
import { katex } from '@mdit/plugin-katex';
import { mark } from '@mdit/plugin-mark';
import { sub } from '@mdit/plugin-sub';
import { sup } from '@mdit/plugin-sup';
import { tasklist } from '@mdit/plugin-tasklist';
import { parseMarkdownImageAlt } from './core/markdownImageModel.js';

// @mdit/plugin-anchor uses Object.hasOwn. Keep the bundle usable on older
// WebKitGTK runtimes that predate that ES2022 convenience method.
if (typeof Object.hasOwn !== 'function') {
    Object.hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
}

/** Keep existing Figaro PDF heading URLs stable while using the anchor plugin. */
export function figaroHeadingSlug(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
}

function headingTokenText(tokens) {
    return tokens
        .filter(token => ['text', 'code_inline', 'math_inline', 'math_block'].includes(token.type))
        .map(token => token.content)
        .join('');
}

function encodeWikiTarget(target) {
    const fragmentIndex = target.indexOf('#');
    let path = fragmentIndex < 0 ? target : target.slice(0, fragmentIndex);
    const fragment = fragmentIndex < 0 ? '' : target.slice(fragmentIndex);
    if (!path.toLowerCase().endsWith('.md')) path += '.md';
    const encoded = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/vault/${encoded}${fragment}`;
}

/** Conventional target-first [[target|label]] support for printable surfaces. */
function wikilinkPlugin(md) {
    md.inline.ruler.before('link', 'figaro_wikilink', (state, silent) => {
        const start = state.pos;
        if (state.src.slice(start, start + 2) !== '[[') return false;
        const end = state.src.indexOf(']]', start + 2);
        if (end < 0) return false;
        const body = state.src.slice(start + 2, end);
        if (!body || /[\r\n]/.test(body)) return false;
        const separator = body.indexOf('|');
        const target = (separator < 0 ? body : body.slice(0, separator)).trim();
        const label = (separator < 0 ? target.replace(/\.md(?=#|$)/i, '') : body.slice(separator + 1)).trim();
        if (!target || !label || target.startsWith('/') || target.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
            return false;
        }
        if (!silent) {
            const open = state.push('link_open', 'a', 1);
            open.attrs = [
                ['href', encodeWikiTarget(target)],
                ['class', 'figaro-wikilink'],
                ['data-wikilink-target', target],
            ];
            const text = state.push('text', '', 0);
            text.content = label;
            state.push('link_close', 'a', -1);
        }
        state.pos = end + 2;
        return true;
    });
}

const sourceMappedBlockTokens = new Set([
    'blockquote_open',
    'bullet_list_open',
    'code_block',
    'fence',
    'heading_open',
    'hr',
    'list_item_open',
    'math_block',
    'ordered_list_open',
    'paragraph_open',
    'table_open',
]);

/**
 * Preserve Markdown-It block source maps in the printable DOM. The PDF
 * preview owns different typography and pagination from CodeMirror, so a
 * source-line bridge is substantially more stable than whole-document scroll
 * percentages around tall code blocks, tables, and diagrams.
 */
function sourceMapPlugin(md) {
    md.core.ruler.after('inline', 'figaro_source_maps', state => {
        for (const token of state.tokens) {
            if (!sourceMappedBlockTokens.has(token.type) || !Array.isArray(token.map)) continue;
            const [start, end] = token.map;
            if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) continue;
            token.attrSet('data-figaro-source-start', String(start));
            token.attrSet('data-figaro-source-end', String(end));
        }
    });
}

/** Convert Figaro's source-only alt suffix into standard sized image attributes. */
function imageSizePlugin(md) {
    const renderImage = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, index, options, env, self) => {
        const token = tokens[index];
        const image = parseMarkdownImageAlt(token.content);
        if (image.sized) {
            const suffix = `|${image.width}x${image.height}`;
            token.content = image.alt;
            const lastText = [...(token.children || [])].reverse()
                .find(child => child.type === 'text');
            if (lastText?.content?.endsWith(suffix)) {
                lastText.content = lastText.content.slice(0, -suffix.length);
            }
            token.attrSet('width', String(image.width));
            token.attrSet('height', String(image.height));
            token.attrSet('data-figaro-image-size', `${image.width}x${image.height}`);
            token.attrSet('style', `width:${image.width}px;height:${image.height}px`);
        }
        return renderImage(tokens, index, options, env, self);
    };
}

/**
 * Create a safe renderer used exclusively for interactive PDF export.
 * Source HTML stays disabled; the selected extensions only parse Markdown.
 */
export function createPrintMarkdownRenderer() {
    const renderer = MarkdownIt({ html: false, linkify: true, typographer: true })
        .use(wikilinkPlugin)
        .use(sourceMapPlugin)
        .use(imageSizePlugin)
        .use(footnote)
        .use(katex, { delimiters: 'dollars' })
        .use(mark)
        .use(sub)
        .use(sup)
        .use(tasklist, {
            disabled: true,
            label: true,
            containerClass: 'figaro-print-task-list',
            itemClass: 'figaro-print-task-item',
            checkboxClass: 'figaro-print-task-checkbox',
            labelClass: 'figaro-print-task-label',
        })
        .use(anchor, {
            slugify: figaroHeadingSlug,
            getTokensText: headingTokenText,
            // Figaro historically used "title", "title-2", "title-3".
            uniqueSlugStartIndex: 2,
            // PDF headings need targets, not visible permalink controls.
            tabIndex: false,
        });

    // Keep repeated references compact (1, 2, 1) while the plugin still owns
    // definition parsing, destination IDs, and one backlink per occurrence.
    renderer.renderer.rules.footnote_caption = (tokens, index) => String(tokens[index].meta.id + 1);
    const renderHorizontalRule = renderer.renderer.rules.hr
        || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
    renderer.renderer.rules.hr = (tokens, index, options, env, self) => {
        const token = tokens[index];
        if (token.markup === '---') {
            token.attrJoin('class', 'figaro-print-page-break figaro-print-authored-page-break');
        }
        return renderHorizontalRule(tokens, index, options, env, self);
    };
    return renderer;
}

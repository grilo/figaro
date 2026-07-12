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

/**
 * Create a safe renderer used exclusively for interactive PDF export.
 * Source HTML stays disabled; the selected extensions only parse Markdown.
 */
export function createPrintMarkdownRenderer() {
    const renderer = MarkdownIt({ html: false, linkify: true, typographer: true })
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
    return renderer;
}

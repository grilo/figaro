import TurndownService from 'turndown';
import {
    RICH_PASTE_MAX_HTML_CHARS,
    RICH_PASTE_MAX_DOM_NODES,
    fencedCodeMarkdown,
    normalizeRichClipboardMarkdown,
    normalizedCodeLanguage,
    richClipboardDecision,
} from './core/richPasteModel.js';

const semanticSelector = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'del', 's', 'strike', 'mark',
    'a[href]', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'table', 'hr', 'input[type="checkbox"]', 'img[alt]',
].join(',');

const blockSelector = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'blockquote', 'pre', 'table', 'hr',
].join(',');

const unsafeSelector = [
    'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed',
    'frame', 'frameset', 'base', 'meta', 'link[rel="stylesheet"]',
].join(',');

const knownCodeLanguages = new Set([
    'asm', 'assembly', 'bash', 'batch', 'c', 'c#', 'c++', 'clojure', 'cmd',
    'cobol', 'cpp', 'cs', 'csharp', 'css', 'dart',
    'diff', 'dockerfile', 'elixir', 'elm', 'erlang', 'fish', 'go', 'graphql',
    'groovy', 'haskell', 'html', 'ini', 'java', 'javascript', 'js', 'json',
    'jsx', 'julia', 'kotlin', 'latex', 'less', 'log', 'lua', 'makefile',
    'markdown', 'matlab', 'md', 'mermaid', 'objective-c', 'output', 'perl',
    'php', 'plaintext', 'powershell', 'ps1', 'py', 'python', 'r', 'ruby',
    'rust', 'sass', 'scala', 'scss', 'sh', 'shell', 'sql', 'swift', 'text',
    'toml', 'ts', 'tsx', 'txt', 'typescript', 'vega', 'vue', 'xml', 'yaml',
    'yml', 'zsh',
]);

function parseClipboardDocument(html) {
    if (typeof DOMParser === 'undefined') return null;
    try {
        return new DOMParser().parseFromString(String(html || ''), 'text/html');
    } catch (_) {
        return null;
    }
}

function normalizedLanguageCandidate(value) {
    const language = normalizedCodeLanguage(value);
    return language && knownCodeLanguages.has(language) ? language : '';
}

function languageFromClassName(value) {
    const match = String(value || '').match(/(?:^|\s)(?:language|lang)-([a-z0-9.+#_-]{1,32})(?:\s|$)/i);
    return normalizedCodeLanguage(match?.[1]);
}

function codeLanguage(node) {
    for (const element of [node, node?.querySelector?.('code'), node?.closest?.('pre'), node?.parentElement]) {
        if (!element) continue;
        for (const attribute of ['data-language', 'data-lang', 'lang']) {
            const language = normalizedCodeLanguage(element.getAttribute?.(attribute));
            if (language) return language;
        }
        const fromClass = languageFromClassName(element.className);
        if (fromClass) return fromClass;
    }
    return '';
}

function codeText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll?.('br').forEach(element => element.replaceWith('\n'));
    return String(clone.textContent || '');
}

function geminiLanguage(block) {
    for (const label of block.querySelectorAll('span')) {
        const next = label.nextElementSibling;
        const language = normalizedCodeLanguage(label.textContent);
        if (language && /buttons/i.test(String(next?.className || ''))) return language;
    }
    return '';
}

function repairCustomCodeBlocks(document) {
    let repairs = 0;
    for (const block of [...document.querySelectorAll('code-block')]) {
        const source = block.querySelector('pre code, pre, code');
        if (!source) continue;
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        const language = codeLanguage(source) || geminiLanguage(block);
        if (language) code.className = `language-${language}`;
        code.textContent = codeText(source);
        pre.append(code);
        block.replaceWith(pre);
        repairs += 1;
    }
    return repairs;
}

function labelLike(element) {
    const descriptor = `${element?.className || ''} ${element?.getAttribute?.('data-testid') || ''}`;
    return /(?:language|syntax|code)[-_ ]*(?:label|header|title|name)|(?:label|header)[-_ ]*(?:language|code)/i
        .test(descriptor);
}

function repairAdjacentCodeLabels(document) {
    let repairs = 0;
    for (const pre of document.querySelectorAll('pre')) {
        const label = pre.previousElementSibling;
        if (!label || !labelLike(label) || label.children.length > 1) continue;
        const candidate = normalizedLanguageCandidate(label.textContent);
        if (!candidate) continue;
        const code = pre.querySelector('code') || pre;
        const existing = codeLanguage(code);
        if (!existing) code.classList.add(`language-${candidate}`);
        if (!existing || existing === candidate) {
            label.remove();
            repairs += 1;
        }
    }
    return repairs;
}

function replaceCodeBreaks(document) {
    let repairs = 0;
    for (const pre of document.querySelectorAll('pre')) {
        for (const lineBreak of [...pre.querySelectorAll('br')]) {
            lineBreak.replaceWith('\n');
            repairs += 1;
        }
    }
    return repairs;
}

function wrapContents(document, element, tagName) {
    const wrapper = document.createElement(tagName);
    while (element.firstChild) wrapper.append(element.firstChild);
    element.append(wrapper);
}

function promoteSemanticInlineStyles(document) {
    let promoted = 0;
    for (const element of [...document.querySelectorAll('[style]')]) {
        if (element.closest('pre, code')) continue;
        const style = String(element.getAttribute('style') || '');
        const fontWeight = style.match(/font-weight\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase();
        const bold = fontWeight === 'bold' || Number.parseInt(fontWeight, 10) >= 600;
        const italic = /font-style\s*:\s*(?:italic|oblique)\b/i.test(style);
        const strike = /text-decoration(?:-line)?\s*:[^;]*line-through/i.test(style);
        if (bold && !element.matches('strong, b') && !element.closest('strong, b')) {
            wrapContents(document, element, 'strong');
            promoted += 1;
        }
        if (italic && !element.matches('em, i') && !element.closest('em, i')) {
            wrapContents(document, element, 'em');
            promoted += 1;
        }
        if (strike && !element.matches('del, s, strike') && !element.closest('del, s, strike')) {
            wrapContents(document, element, 'del');
            promoted += 1;
        }
        element.removeAttribute('style');
    }
    return promoted;
}

function sanitizeClipboardDocument(document) {
    document.querySelectorAll(unsafeSelector).forEach(element => element.remove());
    for (const anchor of document.querySelectorAll('a[href]')) {
        const href = String(anchor.getAttribute('href') || '').trim();
        const compact = [...href].filter(character => character.charCodeAt(0) > 0x20).join('');
        if (/^(?:javascript|vbscript|data|file):/i.test(compact)) anchor.removeAttribute('href');
    }
    for (const element of document.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
            if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
        }
    }
}

function prepareClipboardDocument(document) {
    sanitizeClipboardDocument(document);
    const aiRepairCount = repairCustomCodeBlocks(document)
        + replaceCodeBreaks(document)
        + repairAdjacentCodeLabels(document);
    const semanticStyleCount = promoteSemanticInlineStyles(document);
    return { aiRepairCount, semanticStyleCount };
}

function escapedTableCell(markdown) {
    return String(markdown || '')
        .trim()
        .replace(/\n{2,}/g, '<br>')
        .replace(/\n/g, '<br>')
        .replace(/(^|[^\\])\|/g, '$1\\|');
}

function tableMarkdown(table, service) {
    if (table.querySelector('table table')) return '';
    const rows = [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
    if (rows.length < 2 || rows.some(row => [...row.children].some(cell => Number(cell.rowSpan) > 1))) return '';
    const values = rows.map(row => [...row.children]
        .filter(cell => /^(?:TH|TD)$/.test(cell.tagName))
        .flatMap(cell => {
            const value = escapedTableCell(service.turndown(cell));
            return [value, ...Array(Math.max(0, (Number(cell.colSpan) || 1) - 1)).fill('')];
        }));
    const columns = values[0]?.length || 0;
    if (columns < 2 || values.some(row => row.length !== columns)) return '';
    const line = row => `| ${row.join(' | ')} |`;
    return [line(values[0]), line(Array(columns).fill('---')), ...values.slice(1).map(line)].join('\n');
}

function fallbackTableText(table) {
    return [...table.querySelectorAll('tr')]
        .filter(row => row.closest('table') === table)
        .map(row => [...row.children]
            .filter(cell => /^(?:TH|TD)$/.test(cell.tagName))
            .map(cell => String(cell.textContent || '').trim())
            .join('\t'))
        .filter(Boolean)
        .join('\n');
}

function markdownLinkDestination(value) {
    const destination = String(value || '')
        .replaceAll('<', '%3C')
        .replaceAll('>', '%3E');
    return /[\s()]/.test(destination) ? `<${destination}>` : destination;
}

function createTurndownService() {
    const service = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '*',
        strongDelimiter: '**',
        linkStyle: 'inlined',
        br: '  ',
    });

    service.addRule('figaroCodeBlock', {
        filter: 'pre',
        replacement: (_content, node) => `\n\n${fencedCodeMarkdown(
            codeText(node.querySelector('code') || node),
            codeLanguage(node),
        )}\n\n`,
    });
    service.addRule('figaroTable', {
        filter: 'table',
        replacement: (_content, node) => {
            const markdown = tableMarkdown(node, service);
            return `\n\n${markdown || fallbackTableText(node)}\n\n`;
        },
    });
    service.addRule('figaroTaskCheckbox', {
        filter: node => node.nodeName === 'INPUT' && String(node.getAttribute('type')).toLowerCase() === 'checkbox',
        replacement: (_content, node) => `[${node.checked || node.hasAttribute('checked') ? 'x' : ' '}] `,
    });
    service.addRule('figaroStrikethrough', {
        filter: ['del', 's', 'strike'],
        replacement: content => content ? `~~${content}~~` : '',
    });
    service.addRule('figaroHighlight', {
        filter: 'mark',
        replacement: content => content ? `==${content}==` : '',
    });
    service.addRule('figaroLink', {
        filter: node => node.nodeName === 'A' && node.hasAttribute('href'),
        replacement: (content, node) => {
            const href = String(node.getAttribute('href') || '').trim();
            if (!href) return content;
            const title = node.getAttribute('title');
            const destination = markdownLinkDestination(href);
            return `[${content || href}](${destination}${title ? ` "${title.replaceAll('"', '\\"')}"` : ''})`;
        },
    });
    service.addRule('figaroImageAlt', {
        filter: 'img',
        replacement: (_content, node) => String(node.getAttribute('alt') || '').trim(),
    });
    return service;
}

export function richClipboardHTMLSignals(html) {
    const source = String(html || '');
    if (!source || source.length > RICH_PASTE_MAX_HTML_CHARS) {
        return {
            decision: richClipboardDecision({ htmlLength: source.length }),
            document: null,
            block: false,
        };
    }
    const document = parseClipboardDocument(source);
    if (!document) {
        return { decision: { convert: false, reason: 'invalid-html' }, document: null, block: false };
    }
    const nodeCount = document.querySelectorAll('*').length;
    if (nodeCount > RICH_PASTE_MAX_DOM_NODES) {
        return {
            decision: richClipboardDecision({ htmlLength: source.length, nodeCount }),
            document: null,
            block: false,
        };
    }
    const repairs = prepareClipboardDocument(document);
    const semanticElementCount = document.querySelectorAll(semanticSelector).length;
    const paragraphCount = document.querySelectorAll('p').length;
    const block = Boolean(document.querySelector(blockSelector)) || paragraphCount > 1;
    return {
        decision: richClipboardDecision({
            htmlLength: source.length,
            nodeCount,
            semanticElementCount,
            ...repairs,
        }),
        document,
        block,
        nodeCount,
        semanticElementCount,
        ...repairs,
    };
}

/** Convert only demonstrably semantic clipboard HTML; plain text never enters this path. */
export function richMarkdownFromClipboard({ html = '', text = '' } = {}, options = {}) {
    const inspected = richClipboardHTMLSignals(html);
    if (!inspected.decision.convert || !inspected.document) {
        return { converted: false, reason: inspected.decision.reason, markdown: '', block: false };
    }
    if (options.inlineOnly && inspected.block) {
        return { converted: false, reason: 'block-in-inline-context', markdown: '', block: true };
    }
    try {
        const markdown = normalizeRichClipboardMarkdown(createTurndownService().turndown(inspected.document.body));
        if (!markdown && String(text || '')) {
            return { converted: false, reason: 'empty-conversion', markdown: '', block: inspected.block };
        }
        return {
            converted: Boolean(markdown),
            reason: markdown ? inspected.decision.reason : 'empty-conversion',
            markdown,
            block: inspected.block,
            aiRepairCount: inspected.aiRepairCount,
        };
    } catch (_) {
        return { converted: false, reason: 'conversion-failed', markdown: '', block: inspected.block };
    }
}

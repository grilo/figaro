/** Return the explicit Markdown fence language, if one is present. */
export function printableCodeLanguage(classNames) {
    const names = typeof classNames === 'string'
        ? classNames.split(/\s+/)
        : Array.from(classNames || []);
    const languageClass = names.find(name => String(name).startsWith('language-'));
    return languageClass ? String(languageClass).slice('language-'.length).trim().toLowerCase() : '';
}

/**
 * Plan syntax-highlight markup without depending on the printable DOM. Typed
 * fences use their declared language; untyped fences follow the editor's
 * automatic detection behavior.
 */
export function planPrintableCodeHighlight({ source, classNames, highlight } = {}) {
    if (typeof highlight !== 'function') return null;
    const code = String(source || '');
    const declaredLanguage = printableCodeLanguage(classNames);
    try {
        const result = highlight(code, declaredLanguage || undefined);
        if (!result || typeof result.html !== 'string') return null;
        return {
            html: result.html,
            language: String(result.language || declaredLanguage || 'text').toLowerCase(),
            detected: !declaredLanguage && Boolean(result.detected),
        };
    } catch (_) {
        return null;
    }
}

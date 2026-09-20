/** Expose interactive gutters while keeping decorative line numbers silent. */
export function syncEditorGutterAccessibility(view) {
    if (view.isDestroyed) return;
    const families = [
        ['cm-markdownBlockGutter', 'Markdown block controls'],
        ['cm-foldGutter', 'Code folding'],
        ['cm-activityGutter', 'Passage activity'],
    ];
    for (const rail of view.dom.querySelectorAll('.cm-gutters')) {
        let interactive = false;
        for (const gutter of rail.querySelectorAll(':scope > .cm-gutter')) {
            const family = families.find(([name]) => gutter.classList.contains(name));
            if (family) {
                interactive = true;
                if (gutter.hasAttribute('aria-hidden')) gutter.removeAttribute('aria-hidden');
                if (gutter.getAttribute('role') !== 'group') gutter.setAttribute('role', 'group');
                if (gutter.getAttribute('aria-label') !== family[1]) gutter.setAttribute('aria-label', family[1]);
            } else if (gutter.getAttribute('aria-hidden') !== 'true') gutter.setAttribute('aria-hidden', 'true');
        }
        if (interactive) {
            if (rail.hasAttribute('aria-hidden')) rail.removeAttribute('aria-hidden');
        } else if (rail.getAttribute('aria-hidden') !== 'true') rail.setAttribute('aria-hidden', 'true');
    }
}

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
                gutter.removeAttribute('aria-hidden');
                gutter.setAttribute('role', 'group');
                gutter.setAttribute('aria-label', family[1]);
            } else gutter.setAttribute('aria-hidden', 'true');
        }
        if (interactive) rail.removeAttribute('aria-hidden');
        else rail.setAttribute('aria-hidden', 'true');
    }
}

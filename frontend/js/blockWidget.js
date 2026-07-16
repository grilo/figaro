/**
 * Wrap a CodeMirror block widget whose visual surface needs outside spacing.
 *
 * CodeMirror measures the element returned by WidgetType.toDOM(). Vertical
 * margins sit outside that measurement and can desynchronise its height map
 * from the browser's layout. Padding on this transparent wrapper is measured,
 * while preserving the appearance of space around the widget surface.
 */
export function wrapBlockWidget(content, spacingClass) {
    const wrapper = document.createElement('div');
    wrapper.className = `cm-block-widget cm-block-widget-spacing ${spacingClass}`;
    wrapper.appendChild(content);
    return wrapper;
}

/** Mark an unwrapped block widget whose spacing is already internal. */
export function markBlockWidget(element) {
    element.classList.add('cm-block-widget');
    return element;
}

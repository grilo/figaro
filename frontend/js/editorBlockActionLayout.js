import { editorBlockActionLayout } from './core/editorBlockActionLayoutModel.js';

function numericPixels(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function horizontalTranslation(transform) {
    if (!transform || transform === 'none') return 0;
    const match = /^matrix(?:3d)?\((.+)\)$/.exec(transform);
    if (!match) return 0;
    const values = match[1].split(',').map(value => Number.parseFloat(value.trim()));
    const translation = values.length === 6 ? values[4] : values.length === 16 ? values[12] : 0;
    return Number.isFinite(translation) ? translation : 0;
}

function railMeasurement(element, ownerWindow) {
    if (!element) return {};
    const rect = element.getBoundingClientRect();
    const translation = horizontalTranslation(ownerWindow.getComputedStyle(element).transform);
    return {
        baseRight: rect.right - translation,
        width: rect.width,
    };
}

function measureWritingEdges(view) {
    const content = view?.contentDOM;
    const beforeRail = view?.scrollDOM?.querySelector?.('.cm-editorHelperRail-before');
    const ownerWindow = content?.ownerDocument?.defaultView;
    if (!content || !ownerWindow?.getComputedStyle) return {};

    const contentRect = content.getBoundingClientRect();
    const viewportRect = view.dom.getBoundingClientRect();
    const contentStyle = ownerWindow.getComputedStyle(content);
    const before = railMeasurement(beforeRail, ownerWindow);
    return {
        viewportLeft: viewportRect.left,
        writingLeft: contentRect.left + numericPixels(contentStyle.paddingLeft),
        beforeRailBaseRight: before.baseRight,
        beforeRailWidth: before.width,
    };
}

/** Publish one measured action layout for rendered blocks and the left helper rail. */
export function synchronizeEditorBlockActionLayout(view, width = view?.dom?.getBoundingClientRect?.().width) {
    if (!view || view.isDestroyed || !Number.isFinite(width)) return;
    const layout = editorBlockActionLayout(width, measureWritingEdges(view));
    view.dom.style.setProperty('--editor-block-before-rail-offset', `${layout.beforeRailOffset}px`);
    view.dom.style.setProperty('--editor-block-before-rail-width', `${layout.beforeRailWidth}px`);
    view.scrollDOM?.classList.toggle('cm-editor-block-actions-stacked', layout.stacked);
}

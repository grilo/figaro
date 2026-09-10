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
    const appliedInset = numericPixels(view.dom.style.getPropertyValue('--editor-block-writing-inset'));
    const before = railMeasurement(beforeRail, ownerWindow);
    const activity = railMeasurement(view.scrollDOM.querySelector('.cm-activityGutter'), ownerWindow);
    return {
        viewportLeft: viewportRect.left,
        // Recover the ordinary writing edge so reserving the lane does not
        // disable itself on the next CodeMirror measurement.
        writingLeft: contentRect.left + numericPixels(contentStyle.paddingLeft) - appliedInset,
        beforeRailBaseRight: before.baseRight,
        beforeRailWidth: before.width,
        activityRailBaseRight: activity.baseRight,
        activityRailWidth: activity.width,
    };
}

/** Publish one measured action layout for rendered blocks and the left helper rail. */
export function synchronizeEditorBlockActionLayout(view, width = view?.dom?.getBoundingClientRect?.().width) {
    if (!view || view.isDestroyed || !Number.isFinite(width)) return;
    const setPixels = (property, value) => {
        const pixels = `${value}px`;
        if (view.dom.style.getPropertyValue(property) !== pixels) view.dom.style.setProperty(property, pixels);
    };
    let layout = editorBlockActionLayout(width, measureWritingEdges(view));
    // A newly installed gutter initially occupies flex space. Publish its
    // negative-margin reservation before measuring the centered writing edge;
    // otherwise applying the width would invalidate the position just read.
    const widths = [
        ['--editor-activity-rail-width', layout.activityRailWidth ?? 0],
        ['--editor-block-before-rail-width', layout.beforeRailWidth],
    ];
    if (widths.some(([property, value]) => numericPixels(view.dom.style.getPropertyValue(property)) !== value)) {
        for (const [property, value] of widths) setPixels(property, value);
        layout = editorBlockActionLayout(width, measureWritingEdges(view));
    }
    setPixels('--editor-activity-rail-offset', layout.activityRailOffset ?? 0);
    setPixels('--editor-activity-rail-width', layout.activityRailWidth ?? 0);
    setPixels('--editor-block-before-rail-offset', layout.beforeRailOffset);
    setPixels('--editor-block-before-rail-width', layout.beforeRailWidth);
    setPixels('--editor-block-writing-inset', layout.writingInset);
}

export function clearEditorBlockActionLayout(view) {
    for (const property of ['--editor-block-before-rail-offset', '--editor-block-before-rail-width', '--editor-block-writing-inset']) {
        view.dom.style.removeProperty(property);
    }
}

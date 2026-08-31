import {
    graphicFootprintPlan,
    normalizeSourceLineCount,
    sourceFootprintMode,
} from './core/sourceFootprintModel.js';
import { ViewPlugin } from '@codemirror/view';

const observers = new WeakMap();
const sourceHeightCache = new WeakMap();
const SOURCE_TEXT_PROPERTY = '__figaroSourceFootprintText';

/** Mark the DOM boundary that CodeMirror measures for a block replacement. */
export function markSourceFootprint(element, { kind, lineCount, lineHeight, sourceText }) {
    const policyMode = sourceFootprintMode(kind);
    if (!policyMode) return element;
    const lines = normalizeSourceLineCount(lineCount);
    element.classList.add('cm-source-footprint', `cm-source-footprint--${policyMode}`);
    element.dataset.sourceFootprint = kind;
    element.dataset.sourceFootprintState = 'pending';
    element.dataset.sourceLines = String(lines);
    element.style.setProperty('--cm-source-footprint-lines', element.dataset.sourceLines);
    const measuredLineHeight = Number(lineHeight);
    element.style.setProperty(
        '--cm-source-footprint-height',
        Number.isFinite(measuredLineHeight) && measuredLineHeight > 0
            ? `${lines * measuredLineHeight}px`
            : `${lines * 1.65}em`,
    );
    if (typeof sourceText === 'string') element[SOURCE_TEXT_PROPERTY] = sourceText;
    return element;
}

function sourceMeasurementMetrics(view) {
    const line = Array.from(view.contentDOM.children).find(element => element.classList.contains('cm-line'));
    const style = line ? getComputedStyle(line) : getComputedStyle(view.contentDOM);
    return {
        width: line?.getBoundingClientRect().width || view.contentDOM.clientWidth,
        font: style.font,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        overflowWrap: style.overflowWrap,
        tabSize: style.tabSize,
        whiteSpace: style.whiteSpace,
        wordBreak: style.wordBreak,
    };
}

function measureWrappedSourceHeight(view, sourceText, metrics) {
    if (!metrics.width) return 0;
    const sizer = document.createElement('div');
    sizer.className = 'cm-source-footprint-sizer cm-source-footprint-sizer-line';
    sizer.setAttribute('aria-hidden', 'true');
    sizer.style.width = `${metrics.width}px`;
    sizer.style.font = metrics.font;
    sizer.style.lineHeight = metrics.lineHeight;
    sizer.style.letterSpacing = metrics.letterSpacing;
    sizer.style.overflowWrap = metrics.overflowWrap;
    sizer.style.tabSize = metrics.tabSize;
    sizer.style.whiteSpace = metrics.whiteSpace;
    sizer.style.wordBreak = metrics.wordBreak;
    sizer.textContent = sourceText || '\u200b';
    // Keep the temporary ruler outside CodeMirror's contentDOM. CodeMirror
    // owns that subtree and may interpret foreign children as editor input.
    view.dom.appendChild(sizer);
    const height = sizer.getBoundingClientRect().height;
    sizer.remove();
    return height;
}

function cachedWrappedSourceHeight(view, element, sourceText, metrics) {
    const metricsKey = [
        metrics.width,
        metrics.font,
        metrics.lineHeight,
        metrics.letterSpacing,
        metrics.overflowWrap,
        metrics.tabSize,
        metrics.whiteSpace,
        metrics.wordBreak,
    ].join('\u0000');
    const cached = sourceHeightCache.get(element);
    if (cached?.sourceText === sourceText && cached.metricsKey === metricsKey) return cached.height;
    const height = measureWrappedSourceHeight(view, sourceText, metrics);
    sourceHeightCache.set(element, { sourceText, metricsKey, height });
    return height;
}

function refreshWrappedSourceFootprints(view) {
    if (!view?.contentDOM) return;
    const metrics = sourceMeasurementMetrics(view);
    let changed = false;
    view.contentDOM.querySelectorAll('.cm-source-footprint[data-source-lines]').forEach(element => {
        const measured = typeof element[SOURCE_TEXT_PROPERTY] === 'string'
            ? cachedWrappedSourceHeight(view, element, element[SOURCE_TEXT_PROPERTY], metrics)
            : 0;
        const lines = normalizeSourceLineCount(element.dataset.sourceLines);
        const chartHeight = Number(element.dataset.figaroChartHeight);
        const authoredChartFootprint = Number.isFinite(chartHeight) && chartHeight > 0
            ? chartHeight + 44
            : 0;
        // Managed Figaro charts author their visible geometry directly. Their
        // compact JSON source is deliberately kept on non-wrapping lines and
        // receives a matching placeholder while revealed, so measuring that
        // JSON with the ordinary wrapped-line ruler would incorrectly make
        // the rendered chart hundreds of pixels taller than requested.
        const height = authoredChartFootprint || measured || lines * view.defaultLineHeight;
        const value = `${height}px`;
        if (element.style.getPropertyValue('--cm-source-footprint-height') !== value) {
            element.style.setProperty('--cm-source-footprint-height', value);
            changed = true;
        }
        if (element.classList.contains('cm-source-footprint--scroll')) {
            element.dataset.sourceFootprintState = element.scrollHeight > height + 1
                ? 'overflow'
                : 'underflow';
        }
    });
    if (changed) view.requestMeasure();
}

export function sourceFootprintUpdateNeedsMeasure(update) {
    return Boolean(update.docChanged || update.geometryChanged || update.viewportChanged);
}

export const sourceFootprintExtension = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
        this.scheduled = false;
        this.width = 0;
        this.resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(entries => {
                const width = entries[0]?.contentRect?.width || view.contentDOM.clientWidth;
                if (Math.abs(width - this.width) < 0.5) return;
                this.width = width;
                this.schedule();
            })
            : null;
        this.resizeObserver?.observe(view.contentDOM);
        this.mutationObserver = typeof MutationObserver === 'function'
            ? new MutationObserver(mutations => {
                const footprintChanged = mutations.some(mutation => (
                    [...mutation.addedNodes, ...mutation.removedNodes].some(node => (
                        node.nodeType === Node.ELEMENT_NODE
                        && (node.matches?.('.cm-source-footprint')
                            || node.querySelector?.('.cm-source-footprint'))
                    ))
                ));
                if (footprintChanged) this.schedule();
            })
            : null;
        this.mutationObserver?.observe(view.contentDOM, { childList: true, subtree: true });
        this.schedule();
    }

    schedule() {
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            if (!this.view.isDestroyed) refreshWrappedSourceFootprints(this.view);
        });
    }

    update(update) {
        if (sourceFootprintUpdateNeedsMeasure(update)) this.schedule();
    }

    destroy() {
        this.resizeObserver?.disconnect();
        this.mutationObserver?.disconnect();
    }
});

function elementSize(element) {
    const rect = element.getBoundingClientRect();
    return {
        width: Math.max(rect.width, element.scrollWidth || 0),
        height: Math.max(rect.height, element.scrollHeight || 0),
    };
}

function contentBoxSize(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const horizontalPadding = Number.parseFloat(style.paddingLeft || '0')
        + Number.parseFloat(style.paddingRight || '0');
    const verticalPadding = Number.parseFloat(style.paddingTop || '0')
        + Number.parseFloat(style.paddingBottom || '0');
    return {
        width: Math.max(0, rect.width - horizontalPadding),
        height: Math.max(0, rect.height - verticalPadding),
    };
}

/**
 * Scale a graphic down (never up) to the measured source slot. The adapter is
 * deliberately DOM-only; the sizing decision itself lives in the pure model.
 */
export function fitGraphicToSourceFootprint(root, viewport, graphic) {
    observers.get(root)?.disconnect?.();

    const fit = () => {
        if (!root.isConnected) return;
        graphic.style.removeProperty('transform');
        const available = contentBoxSize(viewport);
        const content = elementSize(graphic);
        const plan = graphicFootprintPlan({
            availableWidth: available.width,
            availableHeight: available.height,
            contentWidth: content.width,
            contentHeight: content.height,
        });
        root.dataset.sourceFootprintState = plan.state;
        if (plan.scale < 1) {
            graphic.style.transform = `scale(${plan.scale})`;
            graphic.style.transformOrigin = 'center';
        }
    };

    queueMicrotask(fit);
    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(fit);
        observer.observe(root);
        observer.observe(graphic);
        observers.set(root, observer);
    }
    return () => {
        observers.get(root)?.disconnect?.();
        observers.delete(root);
    };
}

/** Recompute fixed slots after CodeMirror's configured line height changes. */
export function requestSourceFootprintMeasure(view) {
    if (!view?.requestMeasure) return;
    view.requestMeasure({
        read: () => view.defaultLineHeight,
        write: lineHeight => {
            view.dom.querySelectorAll('.cm-source-footprint[data-source-lines]').forEach(element => {
                const lines = normalizeSourceLineCount(element.dataset.sourceLines);
                const chartHeight = Number(element.dataset.figaroChartHeight);
                const height = Number.isFinite(chartHeight) && chartHeight > 0
                    ? chartHeight + 44
                    : lines * lineHeight;
                element.style.setProperty('--cm-source-footprint-height', `${height}px`);
            });
            queueMicrotask(() => {
                if (!view.isDestroyed && view.contentDOM) refreshWrappedSourceFootprints(view);
            });
        },
    });
}

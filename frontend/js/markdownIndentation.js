import { markdownListIndentPlan, markdownQuoteIndentPlan } from './core/markdownLineModel.js';
import { countEditorWork } from './editorDiagnostics.js';

const metricsByView = new WeakMap();

/** Read fonts once at an invalidation boundary and retain measured prefixes for that font. */
export function markdownIndentationMetrics(view) {
    countEditorWork('geometry.indentationStyle');
    const computed = getComputedStyle(view.contentDOM);
    const family = computed.fontFamily || 'sans-serif', size = computed.fontSize || '16px';
    const style = computed.fontStyle || 'normal', weight = computed.fontWeight || '400';
    const key = [family, size, style, weight].join('\u0000');
    const cached = metricsByView.get(view);
    if (cached?.key === key) return cached;
    let context;
    const widths = new Map();
    const metrics = { key, measure(text, fontWeight = weight, fontStyle = style) {
        const widthKey = `${fontStyle}\u0000${fontWeight}\u0000${text}`;
        if (widths.has(widthKey)) return widths.get(widthKey);
        context ??= document.createElement('canvas').getContext?.('2d');
        if (!context) return null;
        context.font = `${fontStyle} ${fontWeight} ${size} ${family}`;
        countEditorWork('geometry.indentationText');
        const width = context.measureText(text).width;
        widths.set(widthKey, width);
        return width;
    } };
    metricsByView.set(view, metrics);
    return metrics;
}

export function markdownListHangingIndentAttributes(lineText, options = {}) {
    options ??= {};
    const plan = markdownListIndentPlan(lineText, { ...options, tabSize: options.tabSize ?? options.view?.state.tabSize });
    if (!plan) return null;
    let indent = `${plan.columns}ch`;
    const metrics = options.metrics || (options.view && options.markerText ? markdownIndentationMetrics(options.view) : null);
    if (metrics && options.markerText) {
        const leading = metrics.measure(plan.leading), marker = metrics.measure(options.markerText, options.markerWeight || undefined);
        if (leading !== null && marker !== null) indent = `${leading + marker + (options.markerMargin || 0)}px`;
    }
    return { class: 'cm-markdown-list-item', style: `--cm-list-hanging-indent: ${indent}; --cm-list-hanging-outdent: -${indent};` };
}

export function markdownBlockquoteHangingIndentAttributes(lineText, options = {}) {
    options ??= {};
    const plan = markdownQuoteIndentPlan(lineText, { ...options, tabSize: options.tabSize ?? options.view?.state.tabSize });
    if (!plan) return null;
    let indent = `${plan.columns}ch`;
    const metrics = options.metrics || (options.view && plan.text ? markdownIndentationMetrics(options.view) : null);
    const width = metrics && plan.text ? metrics.measure(plan.text, undefined, 'italic') : null;
    if (width !== null) indent = `${width}px`;
    return { class: 'cm-blockquote-line', style: `--cm-blockquote-hanging-indent: ${indent}; --cm-blockquote-hanging-outdent: -${indent};` };
}

import { Transaction } from '@codemirror/state';

import { activateModal, createDialogShell, createPendingChangesNotice, errorDialog } from './dialogs.js';
import { makeEditorModalResizable } from './editorModalResize.js';
import { openColorPalettePicker } from './colorPalettePicker.js';
import { renderDiagramSVG } from './diagramRenderer.js';
import { renderLucideIcon } from './lucideIcons.js';
import { enhanceSelectCombobox } from './selectCombobox.js';
import { createLatestPreviewSession } from './usecases/latestPreviewSession.js';
import {
    buildVegaLiteChartSpec,
    createVegaLiteChartEditorStateFromSource,
    createVegaLiteChartEditorStateFromTable,
    serializeVegaLiteChartFence,
    validateVegaLiteChartConfiguration,
    vegaLiteChartResolvedColor,
    vegaLiteChartTrendlineAvailable,
} from './core/vegaLiteChartEditorModel.js';

const markOptions = [
    ['bar', 'Bar'],
    ['stacked', 'Stacked Bar'],
    ['line', 'Line'],
    ['area', 'Area'],
    ['point', 'Points'],
];

function returnFocus(mainView, target, from) {
    setTimeout(() => {
        if (target?.isConnected) target.focus();
        else {
            const guide = mainView?.dom?.querySelector?.(
                `.vega-lite-chart-editor-guide[data-chart-from="${from}"], `
                + `.markdown-table-chart-guide[data-table-from="${from}"]`,
            );
            if (guide) guide.focus();
            else mainView?.focus?.();
        }
    }, 0);
}

function option(select, value, label) {
    const entry = document.createElement('option');
    entry.value = value;
    entry.textContent = label;
    select.append(entry);
}

function setPressedGroup(root, selector, value, dataKey) {
    root.querySelectorAll(selector).forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset[dataKey] === value));
    });
}

function exactOriginalSource(originalBlock, sourceKind) {
    return sourceKind === 'table'
        ? String(originalBlock.source || '')
        : String(originalBlock.sourceText || '');
}

function editorState(originalBlock, sourceKind) {
    return sourceKind === 'table'
        ? createVegaLiteChartEditorStateFromTable(originalBlock.source)
        : createVegaLiteChartEditorStateFromSource(originalBlock.rawCode ?? originalBlock.code);
}

/** Open a transactional table-backed Vega-Lite chart editor. */
export function openVegaLiteChartEditor(mainView, originalBlock, options = {}) {
    if (!mainView || !originalBlock) return null;
    const sourceKind = options.sourceKind === 'vega-lite' ? 'vega-lite' : 'table';
    const initialState = editorState(originalBlock, sourceKind);
    if (!initialState.valid) {
        errorDialog('Chart editor unavailable', initialState.error, 'Edit the source and try again.');
        return null;
    }
    const state = initialState;
    const unsupported = sourceKind === 'vega-lite' && !initialState.roundTrip;
    const initialStateSignature = JSON.stringify(initialState);
    const { overlay } = createDialogShell({
        title: 'Chart Editor',
        description: sourceKind === 'table'
            ? 'Configure this Markdown table, then replace it with one reversible Vega-Lite block.'
            : 'Edit the visual mapping while preserving the chart’s embedded Markdown table.',
        icon: 'table',
        className: 'vega-lite-chart-editor-modal',
        content: `
            <div class="vega-lite-chart-editor-workspace">
                <fieldset class="vega-lite-chart-editor-config" ${unsupported ? 'disabled' : ''}>
                    <section class="vega-lite-chart-editor-section">
                        <div class="vega-lite-chart-editor-section-heading"><h4>Chart</h4></div>
                        <div class="vega-lite-chart-editor-mode-layout">
                            <div class="vega-lite-chart-editor-control-label"><span>Mode</span>
                                <span class="ui-segmented-control ui-segmented-control--quiet" role="group" aria-label="Chart mode">
                                    <button type="button" class="ui-button" data-chart-mode="cartesian">Cartesian</button>
                                    <button type="button" class="ui-button" data-chart-mode="pie">Pie</button>
                                    <button type="button" class="ui-button" data-chart-mode="waterfall">Waterfall</button>
                                </span>
                            </div>
                            <div class="vega-lite-chart-editor-control-label" data-orientation-group><span>Orientation</span>
                                <span class="ui-segmented-control ui-segmented-control--quiet" role="group" aria-label="Chart orientation">
                                    <button type="button" class="ui-button" data-chart-orientation="vertical">Vertical</button>
                                    <button type="button" class="ui-button" data-chart-orientation="horizontal">Horizontal</button>
                                </span>
                            </div>
                        </div>
                        <div class="vega-lite-chart-editor-control-label vega-lite-chart-editor-legend-position" data-legend-group><span>Legend position</span>
                            <span class="ui-segmented-control ui-segmented-control--quiet" role="group" aria-label="Legend position">
                                <button type="button" class="ui-button" data-legend-position="top">Top</button>
                                <button type="button" class="ui-button" data-legend-position="right">Right</button>
                                <button type="button" class="ui-button" data-legend-position="bottom">Bottom</button>
                                <button type="button" class="ui-button" data-legend-position="left">Left</button>
                            </span>
                        </div>
                    </section>

                    <section class="vega-lite-chart-editor-section" data-cartesian-section data-columns-section>
                        <div class="vega-lite-chart-editor-section-heading"><h4>Columns</h4><span>Hidden settings are preserved</span></div>
                        <div class="vega-lite-chart-editor-column-head" aria-hidden="true"><span>Show</span><span>Column</span><span>Mark</span><span>Axis</span><span>Color</span></div>
                        <div data-chart-columns></div>
                        <p class="vega-lite-chart-editor-stack-summary" data-stack-summary hidden></p>
                    </section>

                    <section class="vega-lite-chart-editor-section" data-cartesian-section>
                        <div class="vega-lite-chart-editor-section-heading"><h4>Axes &amp; guides</h4></div>
                        <div class="vega-lite-chart-editor-guide-grid">
                            <div class="vega-lite-chart-editor-guide-toggles">
                                <label class="vega-lite-chart-editor-check"><input class="ui-checkbox" type="checkbox" data-grid-x> X gridlines</label>
                                <label class="vega-lite-chart-editor-check"><input class="ui-checkbox" type="checkbox" data-grid-y> Y gridlines</label>
                            </div>
                            <div class="vega-lite-chart-editor-threshold-controls">
                                <label class="vega-lite-chart-editor-check vega-lite-chart-editor-threshold-toggle"><input class="ui-checkbox" type="checkbox" data-threshold-visible> Threshold</label>
                                <div class="vega-lite-chart-editor-control-label vega-lite-chart-editor-threshold-value-control"><span>Value</span>
                                    <div class="ui-stepper ui-stepper--quiet vega-lite-chart-editor-threshold-stepper" role="group" aria-label="Threshold value">
                                        <button type="button" class="ui-stepper-button" data-threshold-step="-1" aria-label="Decrease threshold value">−</button>
                                        <input class="ui-stepper-value" type="number" step="any" data-threshold-value aria-label="Threshold value">
                                        <button type="button" class="ui-stepper-button" data-threshold-step="1" aria-label="Increase threshold value">+</button>
                                    </div>
                                </div>
                                <div class="vega-lite-chart-editor-control-label"><span>Axis</span>
                                    <span class="ui-segmented-control ui-segmented-control--quiet vega-lite-chart-editor-threshold-axis" role="group" aria-label="Threshold axis">
                                        <button type="button" class="ui-button" data-threshold-axis="primary">Primary</button>
                                        <button type="button" class="ui-button" data-threshold-axis="secondary">Opposite</button>
                                    </span>
                                </div>
                                <div class="vega-lite-chart-editor-control-label"><span>Color</span><button type="button" class="ui-icon-button vega-lite-chart-editor-color-button" data-threshold-color-button><span class="kanban-column-color-indicator" data-color-indicator aria-hidden="true"></span></button></div>
                            </div>
                            <label class="vega-lite-chart-editor-control-label vega-lite-chart-editor-threshold-label">Label<input class="ui-field ui-field--quiet" type="text" maxlength="80" data-threshold-label></label>
                        </div>
                    </section>

                    <section class="vega-lite-chart-editor-section" data-pie-section hidden>
                        <div class="vega-lite-chart-editor-section-heading"><h4>Pie settings</h4><span>Values are normalized to percentages</span></div>
                        <div class="vega-lite-chart-editor-special-grid">
                            <label class="vega-lite-chart-editor-control-label">Category<select class="ui-field ui-field--quiet" data-pie-category></select></label>
                            <label class="vega-lite-chart-editor-control-label">Values<select class="ui-field ui-field--quiet" data-pie-value></select></label>
                            <label class="vega-lite-chart-editor-check vega-lite-chart-editor-span"><input class="ui-checkbox" type="checkbox" data-pie-percent> Percentage labels</label>
                        </div>
                    </section>

                    <section class="vega-lite-chart-editor-section" data-waterfall-section hidden>
                        <div class="vega-lite-chart-editor-section-heading"><h4>Waterfall settings</h4><span>One change column</span></div>
                        <div class="vega-lite-chart-editor-special-grid">
                            <label class="vega-lite-chart-editor-control-label">Category<select class="ui-field ui-field--quiet" data-waterfall-category></select></label>
                            <label class="vega-lite-chart-editor-control-label">Changes<select class="ui-field ui-field--quiet" data-waterfall-value></select></label>
                            <label class="vega-lite-chart-editor-control-label">Starting value<input class="ui-field ui-field--quiet" type="number" data-waterfall-start></label>
                            <label class="vega-lite-chart-editor-check"><input class="ui-checkbox" type="checkbox" data-waterfall-total> Show final total</label>
                            <div class="vega-lite-chart-editor-control-label"><span>Positive</span><button type="button" class="ui-icon-button vega-lite-chart-editor-color-button" data-waterfall-positive-button><span class="kanban-column-color-indicator" data-color-indicator aria-hidden="true"></span></button></div>
                            <div class="vega-lite-chart-editor-control-label"><span>Negative</span><button type="button" class="ui-icon-button vega-lite-chart-editor-color-button" data-waterfall-negative-button><span class="kanban-column-color-indicator" data-color-indicator aria-hidden="true"></span></button></div>
                        </div>
                    </section>
                </fieldset>

                <section class="vega-lite-chart-editor-preview-pane" aria-label="Chart preview">
                    <div class="vega-lite-chart-editor-preview-heading">
                        <h4>Preview</h4>
                        <span class="vega-lite-chart-editor-preview-tools">
                            <span class="vega-lite-chart-editor-roundtrip" data-roundtrip-status></span>
                            <button type="button" class="ui-button" data-json-toggle aria-pressed="false">JSON</button>
                        </span>
                    </div>
                    <div class="vega-lite-chart-editor-preview" data-chart-preview role="status" aria-live="polite" aria-atomic="true">
                        <div class="vega-lite-chart-editor-preview-state"><span class="ui-spinner" aria-hidden="true"></span><span>Rendering chart…</span></div>
                    </div>
                    <textarea class="ui-field ui-field--quiet vega-lite-chart-editor-json" data-chart-json readonly spellcheck="false" aria-label="Generated Vega-Lite JSON" hidden></textarea>
                </section>
            </div>
        `,
        footer: `
            <span class="vega-lite-chart-editor-status" role="status" aria-live="polite"></span>
            <button type="button" class="ui-button custom-modal-btn vega-lite-chart-editor-cancel">Cancel</button>
            <button type="button" class="ui-button ui-button--primary custom-modal-btn vega-lite-chart-editor-apply" ${unsupported ? 'disabled' : ''}>${sourceKind === 'table' ? 'Create chart' : 'Apply'}</button>
        `,
    });

    const config = overlay.querySelector('.vega-lite-chart-editor-config');
    const columnsHost = overlay.querySelector('[data-chart-columns]');
    const preview = overlay.querySelector('[data-chart-preview]');
    const json = overlay.querySelector('[data-chart-json]');
    const jsonToggle = overlay.querySelector('[data-json-toggle]');
    const applyButton = overlay.querySelector('.vega-lite-chart-editor-apply');
    const cancelButton = overlay.querySelector('.vega-lite-chart-editor-cancel');
    const status = overlay.querySelector('.vega-lite-chart-editor-status');
    const roundtrip = overlay.querySelector('[data-roundtrip-status]');
    const modalResize = makeEditorModalResizable(overlay.querySelector('.custom-modal'));
    let lifecycle = null;
    let settled = false;
    let jsonVisible = false;
    let colorPicker = null;
    let previewSession = null;
    const {
        notice: discard,
        keepButton,
        discardButton,
    } = createPendingChangesNotice('chart');
    discard.classList.add('vega-lite-chart-editor-discard');
    overlay.querySelector('.vega-lite-chart-editor-workspace').append(discard);

    const categories = state.columns;
    const values = state.columns.filter(column => column.dataType === 'quantitative');
    for (const select of overlay.querySelectorAll('[data-pie-category], [data-waterfall-category]')) {
        categories.forEach(column => option(select, column.field, column.label));
    }
    for (const select of overlay.querySelectorAll('[data-pie-value], [data-waterfall-value]')) {
        values.forEach(column => option(select, column.field, column.label));
    }
    const staticComboboxLabels = new Map([
        ['[data-pie-category]', 'Pie category column'],
        ['[data-pie-value]', 'Pie values column'],
        ['[data-waterfall-category]', 'Waterfall category column'],
        ['[data-waterfall-value]', 'Waterfall changes column'],
    ]);
    const staticComboboxes = [...staticComboboxLabels].map(([selector, ariaLabel]) => {
        const select = overlay.querySelector(selector);
        return enhanceSelectCombobox(select, {
            className: 'ui-picker--quiet vega-lite-chart-editor-combobox',
            ariaLabel,
        });
    }).filter(Boolean);

    const axisChoices = () => state.orientation === 'vertical'
        ? [['primary', 'Left'], ['secondary', 'Right']]
        : [['primary', 'Bottom'], ['secondary', 'Top']];

    const syncColorButton = (selector, color, description, { automatic = false } = {}) => {
        const button = overlay.querySelector(selector);
        if (!button) return;
        const indicator = button.querySelector('[data-color-indicator]');
        indicator?.style.setProperty('--kanban-column-color', color);
        const stateText = automatic ? `automatic color ${color}` : `selected color ${color}`;
        button.setAttribute('aria-label', `Choose ${description}; ${stateText}`);
        button.dataset.uiTooltip = `Choose ${description} · ${stateText}`;
    };

    const openPalette = (button, {
        currentColor,
        description,
        includeEmpty = false,
        onSelect,
    }) => {
        colorPicker?.close();
        colorPicker = openColorPalettePicker(button, {
            currentColor,
            emptyLabel: 'Automatic color',
            includeEmpty,
            label: `Choose ${description}`,
            onSelect: color => {
                colorPicker = null;
                onSelect(color);
                sync();
            },
        });
    };

    const renderColumns = () => {
        columnsHost.replaceChildren();
        for (const column of state.columns) {
            const isCategory = column.kind === 'dimension';
            const isSeries = column.kind === 'series' && column.dataType === 'quantitative';
            const isShown = isCategory || column.visible;
            const row = document.createElement('div');
            row.className = `vega-lite-chart-editor-column${isShown ? '' : ' is-hidden'}${isCategory ? ' is-category' : ''}`;
            row.dataset.chartColumn = column.field;

            const visible = document.createElement('button');
            visible.type = 'button';
            visible.className = 'ui-icon-button vega-lite-chart-editor-visibility';
            visible.dataset.columnVisible = column.field;
            visible.disabled = !isSeries;
            visible.setAttribute('aria-pressed', String(isShown));
            const visibilityLabel = isCategory
                ? `${column.label} is always shown as the first-column category`
                : isSeries
                    ? `${column.visible ? 'Hide' : 'Show'} ${column.label}`
                    : `${column.label} is not charted because it is not numeric`;
            visible.setAttribute('aria-label', visibilityLabel);
            visible.dataset.uiTooltip = visibilityLabel;
            visible.innerHTML = renderLucideIcon(isShown ? 'Eye' : 'EyeOff', { size: 14 })
                || (isShown ? '◉' : '⊘');

            const name = document.createElement('span');
            name.className = 'vega-lite-chart-editor-column-name';
            const label = document.createElement('span');
            label.textContent = column.label;
            const type = document.createElement('small');
            type.textContent = column.dataType === 'quantitative'
                ? 'Number'
                : column.dataType === 'temporal' ? 'Date' : 'Category';
            name.append(label, type);

            if (isCategory) {
                const role = document.createElement('span');
                role.className = 'vega-lite-chart-editor-category-role';
                role.textContent = `Labels on ${state.orientation === 'vertical' ? 'bottom' : 'left'} axis`;
                row.append(visible, name, role);
            } else if (!isSeries) {
                const role = document.createElement('span');
                role.className = 'vega-lite-chart-editor-category-role';
                role.textContent = 'Not charted (text)';
                row.append(visible, name, role);
            } else {
                const mark = document.createElement('select');
                mark.className = 'ui-field ui-field--quiet';
                mark.dataset.columnMark = column.field;
                mark.setAttribute('aria-label', `Mark type for ${column.label}`);
                markOptions.forEach(([value, text]) => option(mark, value, text));
                mark.value = column.mark;

                const axis = document.createElement('span');
                axis.className = 'ui-segmented-control ui-segmented-control--quiet vega-lite-chart-editor-axis';
                axis.setAttribute('role', 'group');
                axis.setAttribute('aria-label', `Axis for ${column.label}`);
                for (const [value, text] of axisChoices()) {
                    const choice = document.createElement('button');
                    choice.type = 'button';
                    choice.className = 'ui-button';
                    choice.dataset.columnAxis = column.field;
                    choice.dataset.axisChoice = value;
                    choice.textContent = text;
                    choice.setAttribute('aria-pressed', String(column.axis === value));
                    axis.append(choice);
                }

                const color = document.createElement('button');
                color.type = 'button';
                color.className = 'ui-icon-button vega-lite-chart-editor-color-button';
                color.dataset.columnColorButton = column.field;
                const colorIndicator = document.createElement('span');
                colorIndicator.className = 'kanban-column-color-indicator';
                colorIndicator.dataset.colorIndicator = '';
                colorIndicator.setAttribute('aria-hidden', 'true');
                color.append(colorIndicator);
                const resolvedColor = vegaLiteChartResolvedColor(state, column);
                colorIndicator.style.setProperty('--kanban-column-color', resolvedColor);
                const colorState = column.color ? `selected color ${column.color}` : `automatic color ${resolvedColor}`;
                color.setAttribute('aria-label', `Choose color for ${column.label}; ${colorState}`);
                color.dataset.uiTooltip = `Choose color for ${column.label} · ${colorState}`;

                const trend = document.createElement('label');
                trend.className = 'vega-lite-chart-editor-column-extra';
                const trendInput = document.createElement('input');
                trendInput.type = 'checkbox';
                trendInput.className = 'ui-checkbox';
                trendInput.checked = column.trendline;
                trendInput.dataset.columnTrendline = column.field;
                trendInput.disabled = !vegaLiteChartTrendlineAvailable(state) || column.mark === 'stacked';
                const trendText = document.createElement('span');
                trendText.textContent = 'Linear trendline';
                if (trendInput.disabled) {
                    const reason = column.mark === 'stacked'
                        ? 'Choose a non-stacked mark to use a linear trendline.'
                        : 'Add at least two data rows to use a linear trendline.';
                    trend.classList.add('is-disabled');
                    trend.dataset.uiTooltip = reason;
                    trend.tabIndex = 0;
                    trend.setAttribute('aria-disabled', 'true');
                    trend.setAttribute('aria-label', `Linear trendline unavailable. ${reason}`);
                    trend.append(trendInput, trendText);
                } else {
                    trend.append(trendInput, trendText);
                }
                const options = document.createElement('div');
                options.className = 'vega-lite-chart-editor-column-options';
                options.append(color, trend);
                row.append(visible, name, mark, axis, options);
                enhanceSelectCombobox(mark, {
                    className: 'ui-picker--quiet vega-lite-chart-editor-combobox',
                    ariaLabel: `Mark type for ${column.label}`,
                });
            }
            columnsHost.append(row);
        }
        const stacked = state.columns.filter(column => (
            column.kind === 'series'
            && column.dataType === 'quantitative'
            && column.visible
            && column.mark === 'stacked'
        ));
        const summary = overlay.querySelector('[data-stack-summary]');
        summary.hidden = stacked.length < 2;
        summary.textContent = stacked.length < 2
            ? ''
            : `${stacked.length} columns share one ${state.orientation} stack on the primary axis.`;
    };

    const previewSource = () => unsupported
        ? String(originalBlock.rawCode ?? originalBlock.code ?? '')
        : JSON.stringify(buildVegaLiteChartSpec(state));

    const beginPreview = () => {
        preview.setAttribute('aria-busy', 'true');
        applyButton.disabled = true;
        status.classList.remove('is-error');
        status.textContent = 'Rendering chart preview…';
        preview.innerHTML = '<div class="vega-lite-chart-editor-preview-state"><span class="ui-spinner" aria-hidden="true"></span><span>Rendering chart…</span></div>';
    };

    const showPreviewError = error => {
        if (settled) return;
        preview.innerHTML = '';
        preview.setAttribute('aria-busy', 'false');
        const message = document.createElement('div');
        message.className = 'ui-notice ui-notice--danger vega-lite-chart-editor-preview-error';
        message.setAttribute('role', 'alert');
        const heading = document.createElement('strong');
        heading.textContent = 'Chart preview failed';
        const detail = document.createElement('span');
        detail.textContent = String(error?.message || 'Unable to render this chart.');
        message.append(heading, detail);
        preview.append(message);
        status.textContent = 'The chart cannot be created until its preview renders successfully.';
        status.classList.add('is-error');
        applyButton.disabled = true;
    };

    previewSession = createLatestPreviewSession({
        async render(job) {
            if (job.error) throw job.error;
            const svg = await renderDiagramSVG('vega-lite', job.source, 'figaro-chart-editor-preview', {
                appearance: 'application',
                containerWidth: job.containerWidth,
            });
            if (!svg) throw new Error('Vega-Lite renderer unavailable');
            return { ...job, svg };
        },
        publish(result) {
            if (settled) return;
            preview.innerHTML = result.svg;
            const graphic = preview.querySelector('svg');
            graphic?.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            graphic?.setAttribute('aria-label', 'Generated chart preview');
            graphic?.setAttribute('role', 'img');
            preview.setAttribute('aria-busy', 'false');
            status.textContent = '';
            applyButton.disabled = unsupported;
        },
        reportError: showPreviewError,
    });

    const renderPreview = () => {
        beginPreview();
        try {
            const validation = validateVegaLiteChartConfiguration(state);
            if (!validation.valid) throw new Error(validation.error);
            const source = previewSource();
            json.value = JSON.stringify(JSON.parse(source), null, 2);
            previewSession.request({
                source,
                containerWidth: preview.clientWidth > 36 ? preview.clientWidth - 36 : 640,
            });
        } catch (error) {
            previewSession.request({ error });
            showPreviewError(error);
        }
    };

    const sync = () => {
        setPressedGroup(overlay, '[data-chart-mode]', state.mode, 'chartMode');
        setPressedGroup(overlay, '[data-chart-orientation]', state.orientation, 'chartOrientation');
        setPressedGroup(overlay, '[data-legend-position]', state.legendPosition, 'legendPosition');
        overlay.querySelector('[data-orientation-group]').hidden = state.mode !== 'cartesian';
        overlay.querySelector('[data-legend-group]').hidden = state.mode === 'waterfall';
        overlay.querySelectorAll('[data-cartesian-section]').forEach(section => { section.hidden = state.mode !== 'cartesian'; });
        overlay.querySelector('[data-pie-section]').hidden = state.mode !== 'pie';
        overlay.querySelector('[data-waterfall-section]').hidden = state.mode !== 'waterfall';
        overlay.querySelector('[data-grid-x]').checked = state.gridX;
        overlay.querySelector('[data-grid-y]').checked = state.gridY;
        overlay.querySelector('[data-threshold-visible]').checked = state.threshold.visible;
        overlay.querySelector('[data-threshold-value]').value = String(state.threshold.value);
        setPressedGroup(overlay, '[data-threshold-axis]', state.threshold.axis, 'thresholdAxis');
        overlay.querySelector('[data-threshold-label]').value = state.threshold.label;
        overlay.querySelector('[data-pie-category]').value = state.pie.categoryField;
        overlay.querySelector('[data-pie-value]').value = state.pie.valueField;
        overlay.querySelector('[data-pie-percent]').checked = state.pie.percentageLabels;
        overlay.querySelector('[data-waterfall-category]').value = state.waterfall.categoryField;
        overlay.querySelector('[data-waterfall-value]').value = state.waterfall.valueField;
        overlay.querySelector('[data-waterfall-start]').value = String(state.waterfall.startingValue);
        overlay.querySelector('[data-waterfall-total]').checked = state.waterfall.showFinalTotal;
        syncColorButton('[data-threshold-color-button]', state.threshold.color, 'threshold color');
        syncColorButton('[data-waterfall-positive-button]', state.waterfall.positiveColor, 'positive-change color');
        syncColorButton('[data-waterfall-negative-button]', state.waterfall.negativeColor, 'negative-change color');
        staticComboboxes.forEach(combobox => combobox.sync());
        roundtrip.classList.toggle('is-warning', unsupported);
        roundtrip.textContent = unsupported ? initialState.warning : 'Can convert back to table';
        renderColumns();
        void renderPreview();
    };

    const finish = apply => {
        if (settled) return false;
        if (apply) {
            if (unsupported) return false;
            const current = mainView.state.sliceDoc(originalBlock.from, originalBlock.to);
            if (current !== exactOriginalSource(originalBlock, sourceKind)) {
                status.textContent = `The original ${sourceKind === 'table' ? 'table' : 'chart'} changed. Close and reopen the editor.`;
                status.classList.add('is-error');
                applyButton.disabled = true;
                return false;
            }
            const replacement = serializeVegaLiteChartFence(state, mainView.state.lineBreak);
            if (replacement !== current) {
                mainView.dispatch({
                    changes: { from: originalBlock.from, to: originalBlock.to, insert: replacement },
                    selection: { anchor: originalBlock.from },
                    scrollIntoView: true,
                    annotations: Transaction.userEvent.of(sourceKind === 'table'
                        ? 'input.table-to-chart'
                        : 'input.chart-editor'),
                });
            }
        }
        settled = true;
        modalResize.destroy();
        previewSession.destroy();
        colorPicker?.close();
        colorPicker = null;
        lifecycle.close(false);
        returnFocus(mainView, options.returnFocus, originalBlock.from);
        return true;
    };

    const dirty = () => JSON.stringify(state) !== initialStateSignature;
    const hideDiscard = () => {
        discard.hidden = true;
        cancelButton.focus();
    };
    const requestCancel = () => {
        colorPicker?.close();
        colorPicker = null;
        if (!dirty()) return finish(false);
        discard.hidden = false;
        keepButton.focus();
        return false;
    };

    overlay.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || config.disabled) return;
        if (button.matches('[data-chart-mode]')) state.mode = button.dataset.chartMode;
        else if (button.matches('[data-chart-orientation]')) state.orientation = button.dataset.chartOrientation;
        else if (button.matches('[data-legend-position]')) state.legendPosition = button.dataset.legendPosition;
        else if (button.matches('[data-column-visible]')) {
            const column = state.columns.find(candidate => candidate.field === button.dataset.columnVisible);
            if (column) column.visible = !column.visible;
        } else if (button.matches('[data-column-axis]')) {
            const column = state.columns.find(candidate => candidate.field === button.dataset.columnAxis);
            if (column) column.axis = button.dataset.axisChoice;
        } else if (button.matches('[data-threshold-axis]')) {
            state.threshold.axis = button.dataset.thresholdAxis;
        } else if (button.matches('[data-column-color-button]')) {
            const column = state.columns.find(candidate => candidate.field === button.dataset.columnColorButton);
            if (column) openPalette(button, {
                currentColor: column.color,
                description: `color for ${column.label}`,
                includeEmpty: true,
                onSelect: color => { column.color = color; },
            });
            return;
        } else if (button.matches('[data-threshold-color-button]')) {
            openPalette(button, {
                currentColor: state.threshold.color,
                description: 'threshold color',
                onSelect: color => { state.threshold.color = color; },
            });
            return;
        } else if (button.matches('[data-waterfall-positive-button]')) {
            openPalette(button, {
                currentColor: state.waterfall.positiveColor,
                description: 'positive-change color',
                onSelect: color => { state.waterfall.positiveColor = color; },
            });
            return;
        } else if (button.matches('[data-waterfall-negative-button]')) {
            openPalette(button, {
                currentColor: state.waterfall.negativeColor,
                description: 'negative-change color',
                onSelect: color => { state.waterfall.negativeColor = color; },
            });
            return;
        } else if (button.matches('[data-threshold-step]')) {
            state.threshold.value += Number(button.dataset.thresholdStep) || 0;
        } else return;
        sync();
    });

    config.addEventListener('change', event => {
        const target = event.target;
        const findColumn = field => state.columns.find(column => column.field === field);
        if (target.matches('[data-column-mark]')) findColumn(target.dataset.columnMark).mark = target.value;
        else if (target.matches('[data-column-trendline]')) findColumn(target.dataset.columnTrendline).trendline = target.checked;
        else if (target.matches('[data-grid-x]')) state.gridX = target.checked;
        else if (target.matches('[data-grid-y]')) state.gridY = target.checked;
        else if (target.matches('[data-threshold-visible]')) state.threshold.visible = target.checked;
        else if (target.matches('[data-threshold-value]')) state.threshold.value = Number(target.value) || 0;
        else if (target.matches('[data-threshold-label]')) state.threshold.label = target.value.trim() || 'Threshold';
        else if (target.matches('[data-pie-category]')) state.pie.categoryField = target.value;
        else if (target.matches('[data-pie-value]')) state.pie.valueField = target.value;
        else if (target.matches('[data-pie-percent]')) state.pie.percentageLabels = target.checked;
        else if (target.matches('[data-waterfall-category]')) state.waterfall.categoryField = target.value;
        else if (target.matches('[data-waterfall-value]')) state.waterfall.valueField = target.value;
        else if (target.matches('[data-waterfall-start]')) state.waterfall.startingValue = Number(target.value) || 0;
        else if (target.matches('[data-waterfall-total]')) state.waterfall.showFinalTotal = target.checked;
        else return;
        sync();
    });

    jsonToggle.addEventListener('click', () => {
        jsonVisible = !jsonVisible;
        json.hidden = !jsonVisible;
        preview.hidden = jsonVisible;
        jsonToggle.setAttribute('aria-pressed', String(jsonVisible));
        jsonToggle.textContent = jsonVisible ? 'Preview' : 'JSON';
        if (!jsonVisible) renderPreview();
    });
    cancelButton.addEventListener('click', requestCancel);
    applyButton.addEventListener('click', () => finish(true));
    keepButton.addEventListener('click', hideDiscard);
    discardButton.addEventListener('click', () => finish(false));

    lifecycle = activateModal(overlay, {
        initialFocus: unsupported ? cancelButton : overlay.querySelector('[data-chart-mode="cartesian"]'),
        dismissOnBackdrop: false,
        onDismiss: () => finish(false),
        shouldDismissOnEscape: event => {
            if (overlay.querySelector('.select-combobox-trigger[aria-expanded="true"]')) return false;
            if (colorPicker?.picker.isConnected) {
                event.preventDefault();
                colorPicker.close({ restoreFocus: true });
                colorPicker = null;
                return false;
            }
            event.preventDefault();
            event.stopPropagation();
            if (!discard.hidden) hideDiscard();
            else requestCancel();
            return false;
        },
    });
    sync();

    return {
        overlay,
        apply: () => finish(true),
        cancel: requestCancel,
        get state() { return state; },
    };
}

export default openVegaLiteChartEditor;

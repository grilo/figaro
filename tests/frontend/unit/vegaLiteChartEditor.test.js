import { history, undo } from '@codemirror/commands';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
    buildVegaLiteChartSpec,
    createVegaLiteChartEditorStateFromSource,
    createVegaLiteChartEditorStateFromTable,
    serializeVegaLiteChartFence,
    vegaLiteChartTableSource,
} from '../frontend/js/core/vegaLiteChartEditorModel.js';
import { scanDiagramFences } from '../frontend/js/liveDiagramPlugin.js';
import { scanMarkdownTables } from '../frontend/js/liveMarkdownTablePlugin.js';
import { openVegaLiteChartEditor } from '../frontend/js/vegaLiteChartEditor.js';

const tableSource = [
    '| Month | Revenue | Costs |',
    '| --- | ---: | ---: |',
    '| Jan | 42 | 18 |',
    '| Feb | 56 | 24 |',
].join('\n');

const flush = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

describe('Vega-Lite Chart Editor dialog', () => {
    let view;

    beforeEach(() => {
        document.body.innerHTML = '<main id="app"><div id="editor"></div></main>';
        window.lucide = { icons: {
            Eye: [
                ['path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z' }],
                ['circle', { cx: '12', cy: '12', r: '3' }],
            ],
            EyeOff: [
                ['path', { d: 'm3 3 18 18' }],
                ['path', { d: 'M10.6 10.6a2 2 0 0 0 2.8 2.8' }],
            ],
        } };
        window.vegaEmbed = jest.fn().mockResolvedValue({
            view: {
                toSVG: jest.fn().mockResolvedValue('<svg viewBox="0 0 640 340"><rect width="640" height="340"/></svg>'),
                finalize: jest.fn(),
            },
        });
    });

    afterEach(() => {
        document.querySelector('.custom-modal-overlay')?.remove();
        view?.destroy();
        view = null;
        delete window.lucide;
        delete window.vegaEmbed;
    });

    function createView(source = tableSource) {
        view = new EditorView({
            parent: document.getElementById('editor'),
            state: EditorState.create({ doc: source, extensions: [history(), markdownLanguage] }),
        });
        return view;
    }

    function openTable(source = tableSource) {
        createView(source);
        return openVegaLiteChartEditor(view, scanMarkdownTables(view.state)[0], {
            sourceKind: 'table',
        });
    }

    test('gives the preview the dedicated chart pane and vertically centers rendered SVG output', async () => {
        const dialog = openTable();
        await flush();

        const workspace = dialog.overlay.querySelector('.vega-lite-chart-editor-workspace');
        const config = workspace.querySelector('.vega-lite-chart-editor-config');
        const pane = workspace.querySelector('[aria-label="Chart preview"]');
        const preview = pane.querySelector('[data-chart-preview]');

        expect(dialog.overlay.querySelector('.custom-modal-resize-handle').getAttribute('aria-label'))
            .toBe('Resize editor dialog');
        expect([...workspace.children]).toEqual(expect.arrayContaining([config, pane]));
        expect(preview.querySelector('svg')).not.toBeNull();
        expect(preview.querySelector('svg').getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
        expect(preview.querySelector('svg').getAttribute('aria-label')).toBe('Generated chart preview');
        expect(preview.getAttribute('aria-busy')).toBe('false');
        expect(dialog.overlay.querySelector('[data-column-mark="Revenue"]')
            .classList.contains('select-combobox-native')).toBe(true);
        expect([...dialog.overlay.querySelectorAll('select')].every(select => (
            select.classList.contains('select-combobox-native')
        ))).toBe(true);
        expect(dialog.overlay.querySelector('[data-chart-column="Revenue"] .select-combobox-trigger')
            .getAttribute('aria-label')).toBe('Mark type for Revenue');
        const jsonToggle = dialog.overlay.querySelector('[data-json-toggle]');
        expect(jsonToggle.classList.contains('ui-button')).toBe(true);
        expect(jsonToggle.classList.contains('ui-button--quiet')).toBe(false);
        expect(window.vegaEmbed).toHaveBeenCalledWith(
            expect.objectContaining({ style: expect.objectContaining({ width: '640px' }) }),
            expect.objectContaining({
                width: 'container',
                height: 340,
                background: 'transparent',
                config: expect.objectContaining({
                    axis: expect.objectContaining({ labelColor: expect.any(String), titleColor: expect.any(String) }),
                }),
            }),
            expect.objectContaining({ mode: 'vega-lite', renderer: 'svg' }),
        );

        const markTrigger = dialog.overlay.querySelector(
            '[data-chart-column="Revenue"] .select-combobox-trigger',
        );
        markTrigger.click();
        markTrigger.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));
        expect(dialog.overlay.isConnected).toBe(true);
        expect(markTrigger.getAttribute('aria-expanded')).toBe('false');
    });

    test('serializes rapid preview changes and renders only the latest pending configuration', async () => {
        const renderResult = () => ({
            view: {
                toSVG: jest.fn().mockResolvedValue('<svg viewBox="0 0 640 340"></svg>'),
                finalize: jest.fn(),
            },
        });
        let finishInitial;
        let finishLatest;
        window.vegaEmbed
            .mockReset()
            .mockImplementationOnce(() => new Promise(resolve => { finishInitial = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { finishLatest = resolve; }));

        const dialog = openTable();
        dialog.overlay.querySelector('[data-chart-orientation="horizontal"]').click();
        dialog.overlay.querySelector('[data-chart-orientation="vertical"]').click();
        dialog.overlay.querySelector('[data-chart-orientation="horizontal"]').click();
        expect(window.vegaEmbed).toHaveBeenCalledTimes(1);

        finishInitial(renderResult());
        await flush();
        expect(window.vegaEmbed).toHaveBeenCalledTimes(2);
        expect(window.vegaEmbed.mock.calls[1][1].usermeta.figaro.chart.orientation).toBe('horizontal');
        finishLatest(renderResult());
        await flush();
        expect(dialog.overlay.querySelector('[data-chart-preview] svg')).not.toBeNull();
        expect(dialog.overlay.querySelector('.vega-lite-chart-editor-apply').disabled).toBe(false);
    });

    test('preserves a hidden column mapping and supports chart-wide modes and focused settings', async () => {
        const dialog = openTable();
        await flush();

        let costs = dialog.overlay.querySelector('[data-chart-column="Costs"]');
        const mark = costs.querySelector('[data-column-mark="Costs"]');
        mark.value = 'area';
        mark.dispatchEvent(new Event('change', { bubbles: true }));
        costs = dialog.overlay.querySelector('[data-chart-column="Costs"]');
        const axis = costs.querySelector('[role="group"][aria-label="Axis for Costs"]');
        expect([...axis.querySelectorAll('[data-column-axis="Costs"]')].map(button => button.textContent))
            .toEqual(['Left', 'Right']);
        axis.querySelector('[data-axis-choice="primary"]').click();
        costs = dialog.overlay.querySelector('[data-chart-column="Costs"]');
        const color = costs.querySelector('[data-column-color-button="Costs"]');
        color.click();
        document.querySelector('.kanban-color-swatch[data-color="#a855f7"]').click();
        costs = dialog.overlay.querySelector('[data-chart-column="Costs"]');
        const visible = costs.querySelector('[data-column-visible="Costs"]');
        expect(visible.classList.contains('ui-icon-button')).toBe(true);
        expect(visible.querySelector('svg')).not.toBeNull();
        expect(visible.getAttribute('aria-pressed')).toBe('true');
        visible.click();

        expect(dialog.state.columns.find(column => column.field === 'Costs')).toMatchObject({
            visible: false,
            mark: 'area',
            axis: 'primary',
            color: '#a855f7',
        });

        dialog.overlay.querySelector('[data-chart-mode="pie"]').click();
        expect(dialog.state.mode).toBe('pie');
        expect(dialog.overlay.querySelector('[data-pie-section]').hidden).toBe(false);
        expect(dialog.overlay.querySelector('[data-orientation-group]').hidden).toBe(true);
        expect(dialog.overlay.querySelector('[data-legend-group]').hidden).toBe(false);
        const pieCategory = dialog.overlay.querySelector('[data-pie-category]');
        expect(Array.from(pieCategory.options, entry => entry.value))
            .toEqual(['Month', 'Revenue', 'Costs']);
        pieCategory.value = 'Costs';
        pieCategory.dispatchEvent(new Event('change', { bubbles: true }));
        expect(dialog.state.pie.categoryField).toBe('Costs');

        dialog.overlay.querySelector('[data-chart-mode="waterfall"]').click();
        expect(dialog.state.mode).toBe('waterfall');
        expect(dialog.overlay.querySelector('[data-waterfall-section]').hidden).toBe(false);
        expect(dialog.overlay.querySelector('[data-legend-group]').hidden).toBe(true);
        expect(Array.from(dialog.overlay.querySelector('[data-waterfall-category]').options, entry => entry.value))
            .toEqual(['Month', 'Revenue', 'Costs']);
        expect(dialog.overlay.querySelector('[data-waterfall-positive-button]')).not.toBeNull();
        expect(dialog.overlay.querySelector('[data-waterfall-negative-button]')).not.toBeNull();
    });

    test('clarifies and condenses category, axis, palette, tooltip, and threshold controls', async () => {
        const dialog = openTable();
        await flush();

        const category = dialog.overlay.querySelector('[data-chart-column="Month"]');
        expect(category.classList.contains('is-category')).toBe(true);
        expect(category.querySelector('.vega-lite-chart-editor-category-role').textContent)
            .toBe('Labels on bottom axis');
        expect(category.querySelector('.select-combobox-trigger')).toBeNull();
        expect(category.textContent).not.toContain('—');

        expect(dialog.overlay.querySelector('[data-cartesian-category]')).toBeNull();
        expect(dialog.state).not.toHaveProperty('cartesianCategoryField');
        expect(dialog.overlay.querySelector('[data-column-visible="Month"]').disabled).toBe(true);

        const revenue = dialog.overlay.querySelector('[data-chart-column="Revenue"]');
        const color = revenue.querySelector('[data-column-color-button="Revenue"]');
        expect(color.classList.contains('ui-icon-button')).toBe(true);
        expect(color.querySelector('.kanban-column-color-indicator')).not.toBeNull();
        color.click();
        const palette = document.querySelector('.kanban-color-picker');
        expect(palette.getAttribute('aria-label')).toBe('Choose color for Revenue');
        palette.querySelector('[data-color="#14b8a6"]').click();
        expect(dialog.state.columns.find(column => column.field === 'Revenue').color).toBe('#14b8a6');

        const trend = dialog.overlay.querySelector(
            '[data-chart-column="Revenue"] .vega-lite-chart-editor-column-extra',
        );
        expect(trend.textContent.trim()).toBe('Linear trendline');
        expect(trend.querySelector('[data-column-trendline="Revenue"]').disabled).toBe(false);
        expect(trend.hasAttribute('aria-disabled')).toBe(false);
        trend.querySelector('[data-column-trendline="Revenue"]').click();
        expect(dialog.state.columns.find(column => column.field === 'Revenue').trendline).toBe(true);

        const revenueMark = dialog.overlay.querySelector('[data-column-mark="Revenue"]');
        revenueMark.value = 'stacked';
        revenueMark.dispatchEvent(new Event('change', { bubbles: true }));
        const disabledTrend = dialog.overlay.querySelector(
            '[data-chart-column="Revenue"] .vega-lite-chart-editor-column-extra',
        );
        expect(disabledTrend.getAttribute('aria-disabled')).toBe('true');
        expect(disabledTrend.tabIndex).toBe(0);
        expect(disabledTrend.classList.contains('is-disabled')).toBe(true);
        expect(disabledTrend.dataset.uiTooltip).toBe(
            'Choose a non-stacked mark to use a linear trendline.',
        );
        expect(disabledTrend.querySelector('.vega-lite-chart-editor-trendline-help')).toBeNull();

        const legend = dialog.overlay.querySelector('[role="group"][aria-label="Legend position"]');
        expect(legend.querySelector('[data-legend-position="right"]').getAttribute('aria-pressed'))
            .toBe('true');
        legend.querySelector('[data-legend-position="bottom"]').click();
        expect(dialog.state.legendPosition).toBe('bottom');
        expect(dialog.overlay.querySelector('[data-legend-position="bottom"]').getAttribute('aria-pressed'))
            .toBe('true');

        const threshold = dialog.overlay.querySelector('[data-threshold-value]');
        const stepper = threshold.closest('.ui-stepper');
        expect(stepper.getAttribute('aria-label')).toBe('Threshold value');
        expect(stepper.classList.contains('ui-stepper--quiet')).toBe(true);
        expect(stepper.querySelector('[data-threshold-step="-1"]')).not.toBeNull();
        expect(stepper.querySelector('[data-threshold-step="1"]')).not.toBeNull();
        stepper.querySelector('[data-threshold-step="1"]').click();
        expect(dialog.state.threshold.value).toBe(1);
        threshold.value = '12.5';
        threshold.dispatchEvent(new Event('change', { bubbles: true }));
        expect(dialog.state.threshold.value).toBe(12.5);

        const thresholdAxis = dialog.overlay.querySelector('[role="group"][aria-label="Threshold axis"]');
        expect(dialog.overlay.querySelector('select[data-threshold-axis]')).toBeNull();
        expect(thresholdAxis.querySelector('[data-threshold-axis="primary"]').getAttribute('aria-pressed'))
            .toBe('true');
        thresholdAxis.querySelector('[data-threshold-axis="secondary"]').click();
        expect(dialog.state.threshold.axis).toBe('secondary');
        expect(dialog.overlay.querySelector('[data-threshold-axis="secondary"]').getAttribute('aria-pressed'))
            .toBe('true');

        const thresholdColor = dialog.overlay.querySelector('[data-threshold-color-button]');
        thresholdColor.click();
        expect(document.querySelector('.kanban-color-picker [data-color=""]')).toBeNull();
        document.querySelector('.kanban-color-picker [data-color="#ef4444"]').click();
        expect(dialog.state.threshold.color).toBe('#ef4444');
        expect(dialog.overlay.querySelector('[data-threshold-label]').classList.contains('ui-field'))
            .toBe(true);
        expect([...dialog.overlay.querySelectorAll('.ui-segmented-control')]
            .every(control => control.classList.contains('ui-segmented-control--quiet'))).toBe(true);
        expect([...dialog.overlay.querySelectorAll('.vega-lite-chart-editor-combobox')]
            .every(control => control.classList.contains('ui-picker--quiet'))).toBe(true);
        expect([...dialog.overlay.querySelectorAll('.ui-field')]
            .every(control => control.classList.contains('ui-field--quiet'))).toBe(true);
        expect(dialog.overlay.querySelector('[data-threshold-visible]')
            .closest('.vega-lite-chart-editor-threshold-controls')).not.toBeNull();
        expect(dialog.overlay.textContent).not.toContain('One mode, one orientation');
        expect(dialog.overlay.textContent).not.toContain('Resize vertically in the note');
        expect(dialog.overlay.textContent).not.toContain('Apply writes one change');
    });

    test('explains that a trendline needs at least two authored data rows', async () => {
        const dialog = openTable([
            '| Label | Value |',
            '| --- | ---: |',
            '| Only | 10 |',
        ].join('\n'));
        await flush();

        const trend = dialog.overlay.querySelector(
            '[data-chart-column="Value"] .vega-lite-chart-editor-column-extra',
        );
        expect(trend.getAttribute('aria-disabled')).toBe('true');
        expect(trend.dataset.uiTooltip).toBe(
            'Add at least two data rows to use a linear trendline.',
        );
    });

    test('Cancel is non-destructive and Create chart is one reversible buffer transaction', async () => {
        const cancelled = openTable();
        await flush();
        const horizontal = cancelled.overlay.querySelector('[data-chart-orientation="horizontal"]');
        horizontal.click();
        await flush();
        horizontal.focus();
        horizontal.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));
        const confirmation = cancelled.overlay.querySelector('.vega-lite-chart-editor-discard');
        expect(confirmation.hidden).toBe(false);
        expect(document.activeElement).toBe(confirmation.querySelector('.custom-modal-pending-keep'));
        expect(cancelled.overlay.isConnected).toBe(true);
        expect(view.state.doc.toString()).toBe(tableSource);
        confirmation.querySelector('.custom-modal-pending-discard').click();
        expect(cancelled.overlay.isConnected).toBe(false);

        const reopened = openVegaLiteChartEditor(view, scanMarkdownTables(view.state)[0], {
            sourceKind: 'table',
        });
        await flush();
        reopened.overlay.querySelector('[data-chart-orientation="horizontal"]').click();
        await flush();
        reopened.overlay.querySelector('.vega-lite-chart-editor-apply').click();

        const chart = scanDiagramFences(view.state.doc)[0];
        expect(chart.lang).toBe('vega-lite');
        expect(vegaLiteChartTableSource(chart.rawCode)).toBe(tableSource);
        expect(JSON.parse(chart.rawCode).usermeta.figaro.chart.orientation).toBe('horizontal');
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(tableSource);
        expect(undo(view)).toBe(false);
    });

    test('reopens a managed chart and applies visual changes without losing its table', async () => {
        const state = createVegaLiteChartEditorStateFromTable(tableSource);
        const source = serializeVegaLiteChartFence(state);
        createView(source);
        const dialog = openVegaLiteChartEditor(view, scanDiagramFences(view.state.doc)[0], {
            sourceKind: 'vega-lite',
        });

        await flush();
        dialog.overlay.querySelector('[data-chart-mode="pie"]').click();
        await flush();
        dialog.overlay.querySelector('.vega-lite-chart-editor-apply').click();
        const chart = scanDiagramFences(view.state.doc)[0];
        expect(createVegaLiteChartEditorStateFromSource(chart.rawCode)).toMatchObject({
            valid: true,
            roundTrip: true,
            mode: 'pie',
            tableSource,
        });
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(source);
    });

    test('does not overwrite a changed source or offer destructive round-tripping for foreign JSON edits', async () => {
        const stale = openTable();
        await flush();
        view.dispatch({ changes: { from: 0, insert: 'Intro\n' } });
        stale.overlay.querySelector('.vega-lite-chart-editor-apply').click();
        expect(stale.overlay.querySelector('.vega-lite-chart-editor-status').textContent)
            .toContain('original table changed');
        expect(stale.overlay.querySelector('.vega-lite-chart-editor-apply').disabled).toBe(true);

        stale.cancel();
        view.destroy();
        const state = createVegaLiteChartEditorStateFromTable(tableSource);
        const spec = buildVegaLiteChartSpec(state);
        spec.title = 'Manual edit';
        const source = `\`\`\`vega-lite\n${JSON.stringify(spec)}\n\`\`\``;
        createView(source);
        const dialog = openVegaLiteChartEditor(view, scanDiagramFences(view.state.doc)[0], {
            sourceKind: 'vega-lite',
        });

        expect(dialog.state.roundTrip).toBe(false);
        expect(dialog.overlay.querySelector('.vega-lite-chart-editor-config').disabled).toBe(true);
        expect(dialog.overlay.querySelector('.vega-lite-chart-editor-apply').disabled).toBe(true);
        expect(dialog.overlay.querySelector('[data-roundtrip-status]').textContent).toContain('outside the reversible');
        dialog.cancel();
        expect(view.state.doc.toString()).toBe(source);
    });

    test('announces renderer errors visibly and prevents creation until a preview succeeds', async () => {
        window.vegaEmbed.mockRejectedValueOnce(new Error('Invalid Vega-Lite encoding'));

        const dialog = openTable();
        await flush();

        const preview = dialog.overlay.querySelector('[data-chart-preview]');
        const alert = preview.querySelector('[role="alert"]');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Chart preview failed');
        expect(alert.textContent).toContain('Invalid Vega-Lite encoding');
        expect(preview.getAttribute('aria-busy')).toBe('false');
        expect(dialog.overlay.querySelector('.vega-lite-chart-editor-status').textContent)
            .toContain('cannot be created');
        expect(dialog.overlay.querySelector('.vega-lite-chart-editor-apply').disabled).toBe(true);
    });

    test('announces an invalid empty mapping instead of rendering a blank chart', async () => {
        const dialog = openTable();
        await flush();
        for (const field of ['Revenue', 'Costs']) {
            const visible = dialog.overlay.querySelector(`[data-column-visible="${field}"]`);
            visible.click();
        }
        await flush();

        const alert = dialog.overlay.querySelector('[data-chart-preview] [role="alert"]');
        expect(alert.textContent).toContain('Select at least one visible number column');
        expect(dialog.overlay.querySelector('.vega-lite-chart-editor-apply').disabled).toBe(true);
    });
});

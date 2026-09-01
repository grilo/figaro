import { ACCENT_COLOR_PALETTE } from './colorPaletteModel.js';
import {
    createMarkdownTableEditorState,
    markdownTableEditorCellValue,
} from './markdownTableEditorModel.js';

export const FIGARO_CHART_EDITOR_VERSION = 1;
export const VEGA_LITE_CHART_HEIGHT_LIMITS = Object.freeze({ min: 180, max: 900 });

const VEGA_LITE_SCHEMA = 'https://vega.github.io/schema/vega-lite/v5.json';
const MARKS = new Set(['bar', 'stacked', 'line', 'area', 'point']);
const MODES = new Set(['cartesian', 'pie', 'waterfall']);
const ORIENTATIONS = new Set(['vertical', 'horizontal']);
const AXES = new Set(['primary', 'secondary']);
const LEGEND_POSITIONS = new Set(['top', 'right', 'bottom', 'left']);
const palette = ACCENT_COLOR_PALETTE.filter(Boolean);
const ROW_ORDER_FIELD_BASE = '__figaro_row_order__';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function normalizeVegaLiteChartHeight(value) {
    const height = Math.round(Number(value) || 340);
    return clamp(height, VEGA_LITE_CHART_HEIGHT_LIMITS.min, VEGA_LITE_CHART_HEIGHT_LIMITS.max);
}

export function vegaLiteChartResizePlan({ startHeight, deltaY }) {
    return normalizeVegaLiteChartHeight((Number(startHeight) || 340) + (Number(deltaY) || 0));
}

function cellText(state, row, column) {
    return markdownTableEditorCellValue(state, row, column)
        .replace(/<br\s*\/?>/giu, '\n')
        .replace(/\\\|/gu, '|');
}

function uniqueFields(labels) {
    const counts = new Map();
    return labels.map((label, index) => {
        const base = String(label || '').trim() || `Column ${index + 1}`;
        const count = (counts.get(base) || 0) + 1;
        counts.set(base, count);
        return count === 1 ? base : `${base} (${count})`;
    });
}

function numericValue(value) {
    const normalized = String(value || '').trim().replace(/,/gu, '');
    if (!normalized) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function columnDataType(values) {
    const present = values.map(value => String(value || '').trim()).filter(Boolean);
    if (present.length && present.every(value => numericValue(value) !== null)) return 'quantitative';
    if (present.length && present.every(value => /^\d{4}-\d{2}(?:-\d{2})?$/u.test(value))) return 'temporal';
    return 'nominal';
}

function dataValue(value, type) {
    return type === 'quantitative' ? (numericValue(value) ?? 0) : String(value || '').trim();
}

function rowOrderField(state) {
    const fields = new Set(state.columns.map(column => column.field));
    let field = ROW_ORDER_FIELD_BASE;
    while (fields.has(field)) field += '_';
    return field;
}

function activeTrendlineColumns(state) {
    if (state.mode !== 'cartesian' || state.rows.length < 2) return [];
    return state.columns.filter(column => (
        column.kind === 'series'
        && column.dataType === 'quantitative'
        && column.visible
        && column.mark !== 'stacked'
        && column.trendline
    ));
}

function chartDataRows(state, { legacyCategoryTrendlines = false } = {}) {
    if (legacyCategoryTrendlines || !activeTrendlineColumns(state).length) return state.rows;
    const field = rowOrderField(state);
    return state.rows.map((row, index) => ({ ...row, [field]: index + 1 }));
}

function baseStateFromTable(tableSource) {
    const source = String(tableSource ?? '');
    const table = createMarkdownTableEditorState(source);
    if (!table.valid) return { valid: false, error: table.error || 'The Markdown table is invalid.' };
    if (table.spans.length) {
        return { valid: false, error: 'Merged Markdown cells must be split before creating a chart.' };
    }
    if (table.columns < 2 || table.rows.length < 2) {
        return { valid: false, error: 'A chart needs at least two columns and one data row.' };
    }

    const labels = Array.from({ length: table.columns }, (_unused, column) => cellText(table, 0, column));
    const fields = uniqueFields(labels);
    const rawRows = table.rows.slice(1).map((_row, rowIndex) => (
        Array.from({ length: table.columns }, (_unused, column) => cellText(table, rowIndex + 1, column))
    ));
    const types = fields.map((_field, column) => columnDataType(rawRows.map(row => row[column])));
    const dimensionIndex = 0;
    const quantitative = types
        .map((type, index) => ({ type, index }))
        .filter(candidate => candidate.type === 'quantitative' && candidate.index !== dimensionIndex);
    if (!quantitative.length) {
        return { valid: false, error: 'A chart needs at least one numeric value column.' };
    }

    const rows = rawRows.map(row => Object.fromEntries(fields.map((field, column) => (
        [field, dataValue(row[column], types[column])]
    ))));
    let seriesIndex = 0;
    const columns = fields.map((field, index) => {
        const dimension = index === dimensionIndex;
        const next = {
            field,
            label: labels[index] || field,
            kind: dimension ? 'dimension' : 'series',
            dataType: types[index],
            visible: dimension || types[index] === 'quantitative',
        };
        if (!dimension) {
            next.mark = seriesIndex === 1 ? 'line' : 'bar';
            next.axis = seriesIndex === 1 ? 'secondary' : 'primary';
            next.color = '';
            next.trendline = false;
            seriesIndex += 1;
        }
        return next;
    });
    const dimension = columns[dimensionIndex];
    const firstSeries = columns.find(column => column.kind === 'series' && column.dataType === 'quantitative');
    const waterfallSeries = [...columns].reverse().find(column => (
        column.kind === 'series' && column.dataType === 'quantitative'
    )) || firstSeries;

    return {
        valid: true,
        roundTrip: true,
        tableSource: source,
        rows,
        mode: 'cartesian',
        orientation: 'vertical',
        legendPosition: 'right',
        height: 340,
        gridX: false,
        gridY: true,
        threshold: {
            visible: false,
            value: 0,
            axis: 'primary',
            color: palette[2] || '#f59e0b',
            label: 'Threshold',
        },
        pie: {
            categoryField: dimension.field,
            valueField: firstSeries.field,
            percentageLabels: true,
        },
        waterfall: {
            categoryField: dimension.field,
            valueField: waterfallSeries.field,
            startingValue: 0,
            positiveColor: '#22c55e',
            negativeColor: '#ef4444',
            showFinalTotal: true,
        },
        columns,
    };
}

export function createVegaLiteChartEditorStateFromTable(tableSource) {
    return baseStateFromTable(tableSource);
}

function safeColor(value, fallback = '') {
    const color = String(value || '').trim();
    return !color || /^#[\da-f]{6}$/iu.test(color) ? color : fallback;
}

function savedChartConfiguration(state, {
    includeLegendPosition = true,
} = {}) {
    const configuration = {
        mode: state.mode,
        orientation: state.orientation,
        height: state.height,
        gridX: Boolean(state.gridX),
        gridY: Boolean(state.gridY),
        threshold: { ...state.threshold },
        pie: { ...state.pie },
        waterfall: { ...state.waterfall },
        columns: state.columns.map(column => ({ ...column })),
    };
    if (includeLegendPosition) configuration.legendPosition = state.legendPosition;
    return configuration;
}

function mergeSavedConfiguration(base, saved = {}) {
    const fields = new Set(base.columns.map(column => column.field));
    const savedColumns = new Map((Array.isArray(saved.columns) ? saved.columns : []).map(column => (
        [String(column?.field || ''), column]
    )));
    const columns = base.columns.map(column => {
        const candidate = savedColumns.get(column.field);
        if (!candidate || candidate.kind !== column.kind || candidate.dataType !== column.dataType) return column;
        const merged = {
            ...column,
            visible: candidate.visible !== false,
        };
        if (column.kind !== 'series' || column.dataType !== 'quantitative') return merged;
        return {
            ...merged,
            mark: MARKS.has(candidate.mark) ? candidate.mark : column.mark,
            axis: AXES.has(candidate.axis) ? candidate.axis : column.axis,
            color: safeColor(candidate.color, column.color),
            trendline: Boolean(candidate.trendline),
        };
    });
    const quantitativeFields = new Set(columns.filter(column => (
        column.dataType === 'quantitative'
    )).map(column => column.field));
    const threshold = saved.threshold || {};
    const pie = saved.pie || {};
    const waterfall = saved.waterfall || {};
    return {
        ...base,
        mode: MODES.has(saved.mode) ? saved.mode : base.mode,
        orientation: ORIENTATIONS.has(saved.orientation) ? saved.orientation : base.orientation,
        legendPosition: LEGEND_POSITIONS.has(saved.legendPosition)
            ? saved.legendPosition
            : base.legendPosition,
        height: normalizeVegaLiteChartHeight(saved.height),
        gridX: saved.gridX === undefined ? base.gridX : Boolean(saved.gridX),
        gridY: saved.gridY === undefined ? base.gridY : Boolean(saved.gridY),
        threshold: {
            visible: Boolean(threshold.visible),
            value: Number.isFinite(Number(threshold.value)) ? Number(threshold.value) : base.threshold.value,
            axis: AXES.has(threshold.axis) ? threshold.axis : base.threshold.axis,
            color: safeColor(threshold.color, base.threshold.color),
            label: String(threshold.label || base.threshold.label).slice(0, 80),
        },
        pie: {
            categoryField: fields.has(pie.categoryField) ? pie.categoryField : base.pie.categoryField,
            valueField: quantitativeFields.has(pie.valueField) ? pie.valueField : base.pie.valueField,
            percentageLabels: pie.percentageLabels !== false,
        },
        waterfall: {
            categoryField: fields.has(waterfall.categoryField)
                ? waterfall.categoryField
                : base.waterfall.categoryField,
            valueField: quantitativeFields.has(waterfall.valueField)
                ? waterfall.valueField
                : base.waterfall.valueField,
            startingValue: Number.isFinite(Number(waterfall.startingValue))
                ? Number(waterfall.startingValue)
                : base.waterfall.startingValue,
            positiveColor: safeColor(waterfall.positiveColor, base.waterfall.positiveColor),
            negativeColor: safeColor(waterfall.negativeColor, base.waterfall.negativeColor),
            showFinalTotal: waterfall.showFinalTotal !== false,
        },
        columns,
        roundTrip: true,
        warning: '',
        fields,
    };
}

function resolvedColor(state, column) {
    if (column.color) return column.color;
    const series = state.columns.filter(candidate => candidate.kind === 'series');
    const index = Math.max(0, series.findIndex(candidate => candidate.field === column.field));
    return palette[index % palette.length] || '#3b82f6';
}

function axisTitle(columns) {
    return columns.map(column => column.label).join(', ');
}

function seriesLegendEncoding(state, columns, value, { includePosition = true } = {}) {
    return {
        ...value,
        type: 'nominal',
        scale: {
            domain: columns.map(column => column.field),
            range: columns.map(column => resolvedColor(state, column)),
        },
        legend: {
            title: null,
            ...(includePosition ? { orient: state.legendPosition } : {}),
        },
    };
}

function categoryEncoding(state, dimension, channel) {
    return {
        field: dimension.field,
        type: dimension.dataType,
        // Vega-Lite sorts discrete values by default. A Markdown table is an
        // authored sequence, so preserve its row order on the category axis.
        sort: null,
        axis: {
            grid: channel === 'x' ? state.gridX : state.gridY,
            title: dimension.label,
        },
    };
}

function quantitativeAxis(state, columns, axis, channel) {
    const primary = axis === 'primary';
    const vertical = state.orientation === 'vertical';
    return {
        type: 'quantitative',
        axis: {
            orient: vertical
                ? (primary ? 'left' : 'right')
                : (primary ? 'bottom' : 'top'),
            grid: primary && (channel === 'x' ? state.gridX : state.gridY),
            title: axisTitle(columns),
        },
    };
}

function groupedBarLayer(
    state,
    dimension,
    columns,
    legendColumns,
    stacked = false,
    { completeLegend = true } = {},
) {
    if (!columns.length) return null;
    const vertical = state.orientation === 'vertical';
    const categoryChannel = vertical ? 'x' : 'y';
    const valueChannel = vertical ? 'y' : 'x';
    const offsetChannel = vertical ? 'xOffset' : 'yOffset';
    const axis = columns[0].axis;
    const layer = {
        transform: [{ fold: columns.map(column => column.field), as: ['figaro_series', 'figaro_value'] }],
        mark: { type: 'bar', tooltip: true },
        encoding: {
            [categoryChannel]: categoryEncoding(state, dimension, categoryChannel),
            [valueChannel]: {
                field: 'figaro_value',
                ...quantitativeAxis(state, columns, axis, valueChannel),
                ...(stacked ? { stack: 'zero' } : {}),
            },
            color: seriesLegendEncoding(
                state,
                completeLegend ? legendColumns : columns,
                { field: 'figaro_series' },
                { includePosition: completeLegend },
            ),
            tooltip: [
                { field: dimension.field, type: dimension.dataType, title: dimension.label },
                { field: 'figaro_series', type: 'nominal', title: 'Series' },
                { field: 'figaro_value', type: 'quantitative', title: 'Value' },
            ],
        },
    };
    if (!stacked) layer.encoding[offsetChannel] = { field: 'figaro_series', type: 'nominal' };
    return layer;
}

function seriesLayer(
    state,
    dimension,
    column,
    legendColumns,
    axisColumns = [column],
    { completeLegend = true } = {},
) {
    const vertical = state.orientation === 'vertical';
    const categoryChannel = vertical ? 'x' : 'y';
    const valueChannel = vertical ? 'y' : 'x';
    const mark = column.mark === 'area'
        ? {
            type: 'area',
            opacity: 0.3,
            line: true,
            ...(!completeLegend ? { color: resolvedColor(state, column) } : {}),
        }
        : {
            type: column.mark,
            tooltip: true,
            ...(!completeLegend ? { color: resolvedColor(state, column) } : {}),
        };
    return {
        mark,
        encoding: {
            [categoryChannel]: categoryEncoding(state, dimension, categoryChannel),
            [valueChannel]: {
                field: column.field,
                ...quantitativeAxis(state, axisColumns, column.axis, valueChannel),
            },
            ...(completeLegend ? {
                color: seriesLegendEncoding(state, legendColumns, { datum: column.field }),
            } : {}),
            tooltip: [
                { field: dimension.field, type: dimension.dataType, title: dimension.label },
                { field: column.field, type: 'quantitative', title: column.label },
            ],
        },
    };
}

function trendlineLayer(state, dimension, column, { legacyCategoryPredictor = false } = {}) {
    const vertical = state.orientation === 'vertical';
    const categoryChannel = vertical ? 'x' : 'y';
    const valueChannel = vertical ? 'y' : 'x';
    const orderField = rowOrderField(state);
    const transform = legacyCategoryPredictor
        ? [{ regression: column.field, on: dimension.field }]
        : [
            {
                regression: column.field,
                on: orderField,
                extent: [1, state.rows.length],
                as: [orderField, column.field],
            },
            {
                lookup: orderField,
                from: {
                    data: {
                        values: state.rows.map((row, index) => ({
                            [orderField]: index + 1,
                            [dimension.field]: row[dimension.field],
                        })),
                    },
                    key: orderField,
                    fields: [dimension.field],
                },
            },
        ];
    return {
        transform,
        mark: {
            type: 'line',
            color: resolvedColor(state, column),
            strokeDash: [5, 4],
            opacity: 0.8,
        },
        encoding: {
            [categoryChannel]: { field: dimension.field, type: dimension.dataType, sort: null },
            [valueChannel]: { field: column.field, type: 'quantitative' },
        },
    };
}

function thresholdLayers(state, { legacyAxisSuppression = false } = {}) {
    if (!state.threshold.visible) return [];
    const vertical = state.orientation === 'vertical';
    const channel = vertical ? 'y' : 'x';
    return [
        {
            mark: {
                type: 'rule',
                color: state.threshold.color,
                strokeDash: [6, 4],
                strokeWidth: 2,
            },
            encoding: {
                [channel]: {
                    datum: state.threshold.value,
                    type: 'quantitative',
                    ...(legacyAxisSuppression ? { axis: null } : {}),
                },
            },
        },
        {
            mark: {
                type: 'text',
                color: state.threshold.color,
                align: vertical ? 'right' : 'left',
                dy: vertical ? -6 : 0,
                dx: vertical ? 0 : 6,
            },
            encoding: {
                [channel]: {
                    datum: state.threshold.value,
                    type: 'quantitative',
                    ...(legacyAxisSuppression ? { axis: null } : {}),
                },
                text: { value: state.threshold.label },
            },
        },
    ];
}

function cartesianSpec(
    state,
    base,
    {
        completeLegend = true,
        legacyAxisSuppression = false,
        legacyCategoryTrendlines = false,
    } = {},
) {
    const dimension = state.columns.find(column => column.kind === 'dimension');
    const visible = state.columns.filter(column => (
        column.kind === 'series'
        && column.visible
        && column.dataType === 'quantitative'
    ));
    if (!dimension || !visible.length) return { ...base, layer: [] };
    const groups = { primary: [], secondary: [] };
    const groupSeries = { primary: [], secondary: [] };
    for (const axis of ['primary', 'secondary']) {
        const axisSeries = visible.filter(column => column.axis === axis && column.mark !== 'stacked');
        groupSeries[axis] = axisSeries;
        const bars = axisSeries.filter(column => column.mark === 'bar');
        const barLayer = groupedBarLayer(
            state,
            dimension,
            bars,
            visible,
            false,
            { completeLegend },
        );
        if (barLayer) groups[axis].push(barLayer);
        axisSeries.filter(column => column.mark !== 'bar')
            .forEach(column => groups[axis].push(seriesLayer(
                state,
                dimension,
                column,
                visible,
                axisSeries,
                { completeLegend },
            )));
    }
    const stacked = visible.filter(column => column.mark === 'stacked').map(column => ({
        ...column,
        axis: 'primary',
    }));
    const stackLayer = groupedBarLayer(
        state,
        dimension,
        stacked,
        visible,
        true,
        { completeLegend },
    );
    if (stackLayer) {
        groupSeries.primary.push(...stacked);
        groups.primary.push(stackLayer);
    }
    if (vegaLiteChartTrendlineAvailable(state)) {
        for (const axis of ['primary', 'secondary']) {
            groupSeries[axis].filter(column => column.trendline)
                .forEach(column => groups[axis].push(trendlineLayer(state, dimension, column, {
                    legacyCategoryPredictor: legacyCategoryTrendlines,
                })));
        }
    }
    if (state.threshold.visible) {
        const requested = state.threshold.axis;
        const target = groupSeries[requested].length
            ? requested
            : groupSeries.primary.length ? 'primary' : 'secondary';
        groups[target].push(...thresholdLayers(state, { legacyAxisSuppression }));
    }
    const primaryVisible = groupSeries.primary.length > 0;
    const secondaryVisible = groupSeries.secondary.length > 0;
    if (primaryVisible && secondaryVisible) {
        return {
            ...base,
            layer: [
                { layer: groups.primary },
                { layer: groups.secondary },
            ],
            resolve: { scale: { [state.orientation === 'vertical' ? 'y' : 'x']: 'independent' } },
        };
    }
    return {
        ...base,
        layer: primaryVisible ? groups.primary : groups.secondary,
    };
}

function pieSpec(state, base, { completeLegend = true } = {}) {
    const category = state.columns.find(column => column.field === state.pie.categoryField);
    const value = state.columns.find(column => column.field === state.pie.valueField);
    if (!category || !value) return { ...base, layer: [] };
    const arcEncoding = {
        theta: { field: value.field, type: 'quantitative', stack: 'normalize' },
        color: {
            field: category.field,
            type: 'nominal',
            sort: null,
            scale: { range: palette },
            legend: {
                title: category.label,
                ...(completeLegend ? { orient: state.legendPosition } : {}),
            },
        },
        tooltip: [
            { field: category.field, type: category.dataType, title: category.label },
            { field: value.field, type: 'quantitative', title: value.label },
        ],
    };
    return {
        ...base,
        layer: [
            { mark: { type: 'arc', tooltip: true }, encoding: arcEncoding },
            ...(state.pie.percentageLabels ? [{
                transform: [
                    { joinaggregate: [{ op: 'sum', field: value.field, as: 'figaro_total' }] },
                    { calculate: `datum[${JSON.stringify(value.field)}] / datum.figaro_total`, as: 'figaro_percent' },
                ],
                mark: { type: 'text', radius: Math.max(42, Math.round(state.height * 0.24)), color: '#ffffff' },
                encoding: {
                    theta: { field: value.field, type: 'quantitative', stack: 'normalize' },
                    text: { field: 'figaro_percent', type: 'quantitative', format: '.0%' },
                },
            }] : []),
        ],
    };
}

function waterfallRows(state) {
    const categoryField = state.waterfall.categoryField;
    const valueField = state.waterfall.valueField;
    let running = Number(state.waterfall.startingValue) || 0;
    const rows = [{
        figaro_category: 'Start',
        figaro_previous: 0,
        figaro_sum: running,
        figaro_delta: running,
        figaro_kind: 'total',
    }];
    state.rows.forEach(row => {
        const previous = running;
        const delta = Number(row[valueField]) || 0;
        running += delta;
        rows.push({
            figaro_category: String(row[categoryField]),
            figaro_previous: previous,
            figaro_sum: running,
            figaro_delta: delta,
            figaro_kind: 'change',
        });
    });
    if (state.waterfall.showFinalTotal) {
        rows.push({
            figaro_category: 'Total',
            figaro_previous: 0,
            figaro_sum: running,
            figaro_delta: running,
            figaro_kind: 'total',
        });
    }
    return rows;
}

function waterfallSpec(state, base) {
    return {
        ...base,
        data: { values: waterfallRows(state) },
        layer: [
            {
                mark: { type: 'bar', tooltip: true },
                encoding: {
                    x: { field: 'figaro_category', type: 'ordinal', sort: null, axis: { title: null, grid: state.gridX } },
                    y: { field: 'figaro_previous', type: 'quantitative', axis: { title: state.waterfall.valueField, grid: state.gridY } },
                    y2: { field: 'figaro_sum' },
                    color: {
                        condition: [
                            { test: 'datum.figaro_kind === \'total\'', value: palette[2] || '#f59e0b' },
                            { test: 'datum.figaro_delta < 0', value: state.waterfall.negativeColor },
                        ],
                        value: state.waterfall.positiveColor,
                    },
                    tooltip: [
                        { field: 'figaro_category', type: 'ordinal', title: 'Step' },
                        { field: 'figaro_delta', type: 'quantitative', title: 'Change' },
                        { field: 'figaro_sum', type: 'quantitative', title: 'Total' },
                    ],
                },
            },
            {
                transform: [{ window: [{ op: 'lead', field: 'figaro_category', as: 'figaro_next' }] }],
                mark: { type: 'rule', color: '#6b7280', strokeWidth: 1 },
                encoding: {
                    x: { field: 'figaro_category', type: 'ordinal', sort: null, bandPosition: 1 },
                    x2: { field: 'figaro_next' },
                    y: { field: 'figaro_sum', type: 'quantitative' },
                },
            },
            {
                mark: { type: 'text', dy: -6 },
                encoding: {
                    x: { field: 'figaro_category', type: 'ordinal', sort: null },
                    y: { field: 'figaro_sum', type: 'quantitative' },
                    text: { field: 'figaro_delta', type: 'quantitative', format: '+.0f' },
                },
            },
        ],
    };
}

/** Describe configuration errors before asking Vega-Lite to render an empty chart. */
export function validateVegaLiteChartConfiguration(state) {
    if (!state?.valid) return { valid: false, error: state?.error || 'The chart source is invalid.' };
    if (state.mode === 'cartesian') {
        const dimension = state.columns.find(column => column.kind === 'dimension');
        if (!dimension) return { valid: false, error: 'The first table column must be the category.' };
        const series = state.columns.find(column => (
            column.kind === 'series'
            && column.dataType === 'quantitative'
            && column.visible
        ));
        if (!series) return { valid: false, error: 'Select at least one visible number column.' };
    } else if (state.mode === 'pie') {
        const category = state.columns.find(column => column.field === state.pie.categoryField);
        const value = state.columns.find(column => (
            column.field === state.pie.valueField && column.dataType === 'quantitative'
        ));
        if (!category || !value) return { valid: false, error: 'Choose a category and number column for the pie chart.' };
    } else if (state.mode === 'waterfall') {
        const category = state.columns.find(column => column.field === state.waterfall.categoryField);
        const value = state.columns.find(column => (
            column.field === state.waterfall.valueField && column.dataType === 'quantitative'
        ));
        if (!category || !value) return { valid: false, error: 'Choose a category and changes column for the waterfall chart.' };
    }
    return { valid: true, error: '' };
}

function buildVegaLiteChartSpecVersion(
    state,
    {
        completeLegend = true,
        legacyAxisSuppression = false,
        legacyCategoryTrendlines = false,
    } = {},
) {
    if (!state?.valid) return null;
    const metadata = {
        editor: 'chart',
        version: FIGARO_CHART_EDITOR_VERSION,
        tableSource: state.tableSource,
        chart: savedChartConfiguration(state, {
            includeLegendPosition: completeLegend,
        }),
    };
    const base = {
        $schema: VEGA_LITE_SCHEMA,
        usermeta: { figaro: metadata },
        data: { values: chartDataRows(state, { legacyCategoryTrendlines }) },
        width: 'container',
        height: normalizeVegaLiteChartHeight(state.height),
        autosize: { type: 'fit', contains: 'padding', resize: true },
        config: {
            view: { stroke: null },
            axis: { labelLimit: 160 },
        },
    };
    if (state.mode === 'pie') return pieSpec(state, base, { completeLegend });
    if (state.mode === 'waterfall') return waterfallSpec(state, base);
    return cartesianSpec(state, base, {
        completeLegend,
        legacyAxisSuppression,
        legacyCategoryTrendlines,
    });
}

export function buildVegaLiteChartSpec(state) {
    return buildVegaLiteChartSpecVersion(state);
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function specsEqual(left, right) {
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function createVegaLiteChartEditorStateFromSource(source) {
    let spec;
    try {
        spec = JSON.parse(String(source || ''));
    } catch {
        return { valid: false, error: 'The Vega-Lite block does not contain valid JSON.' };
    }
    const metadata = spec?.usermeta?.figaro;
    if (metadata?.editor !== 'chart'
        || metadata.version !== FIGARO_CHART_EDITOR_VERSION
        || typeof metadata.tableSource !== 'string') {
        return { valid: false, error: 'This Vega-Lite block was not created from a Figaro Markdown table.' };
    }
    const base = baseStateFromTable(metadata.tableSource);
    if (!base.valid) return base;
    const state = mergeSavedConfiguration(base, metadata.chart);
    const generated = buildVegaLiteChartSpec(state);
    const completeLegend = metadata.chart?.legendPosition !== undefined;
    const previousGenerated = [];
    for (const legacyAxisSuppression of [false, true]) {
        for (const legacyCategoryTrendlines of [false, true]) {
            previousGenerated.push(buildVegaLiteChartSpecVersion(state, {
                completeLegend,
                legacyAxisSuppression,
                legacyCategoryTrendlines,
            }));
        }
    }
    const roundTrip = specsEqual(spec, generated)
        || previousGenerated.some(candidate => specsEqual(spec, candidate));
    return {
        ...state,
        roundTrip,
        warning: roundTrip
            ? ''
            : 'This Vega-Lite JSON contains edits outside the reversible Chart Editor subset.',
    };
}

export function isFigaroVegaLiteChartSource(source) {
    try {
        const metadata = JSON.parse(String(source || ''))?.usermeta?.figaro;
        return metadata?.editor === 'chart'
            && metadata.version === FIGARO_CHART_EDITOR_VERSION
            && typeof metadata.tableSource === 'string';
    } catch {
        return false;
    }
}

export function serializeVegaLiteChartFence(state, lineBreak = '\n') {
    const spec = buildVegaLiteChartSpec(state);
    return spec ? ['```vega-lite', JSON.stringify(spec), '```'].join(lineBreak) : '';
}

export function vegaLiteChartTableSource(source) {
    const state = createVegaLiteChartEditorStateFromSource(source);
    return state.valid && state.roundTrip ? state.tableSource : null;
}

export function vegaLiteChartHeight(source) {
    const state = createVegaLiteChartEditorStateFromSource(source);
    return state.valid && state.roundTrip ? state.height : null;
}

export function setVegaLiteChartHeight(source, height) {
    const state = createVegaLiteChartEditorStateFromSource(source);
    if (!state.valid || !state.roundTrip) return null;
    return JSON.stringify(buildVegaLiteChartSpec({
        ...state,
        height: normalizeVegaLiteChartHeight(height),
    }));
}

export function vegaLiteChartTrendlineAvailable(state) {
    return Boolean(state?.valid && state.rows?.length >= 2);
}

export function vegaLiteChartResolvedColor(state, column) {
    return resolvedColor(state, column);
}

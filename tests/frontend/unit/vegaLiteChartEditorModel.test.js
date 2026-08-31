import {
    buildVegaLiteChartSpec,
    createVegaLiteChartEditorStateFromSource,
    createVegaLiteChartEditorStateFromTable,
    serializeVegaLiteChartFence,
    isFigaroVegaLiteChartSource,
    setVegaLiteChartHeight,
    validateVegaLiteChartConfiguration,
    vegaLiteChartHeight,
    vegaLiteChartResizePlan,
    vegaLiteChartTableSource,
    vegaLiteChartTrendlineAvailable,
} from '../../../frontend/js/core/vegaLiteChartEditorModel.js';

const table = [
    '| Month | Revenue | Cost | Profit Δ |',
    '| --- | ---: | ---: | ---: |',
    '| 2026-01 | 42 | 28 | 12 |',
    '| 2026-02 | 51 | 31 | -6 |',
    '| 2026-03 | 64 | 37 | 18 |',
].join('\n');

describe('Vega-Lite Chart Editor model', () => {
    test('maps a rectangular Markdown table to typed, reversible chart state', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);

        expect(state).toMatchObject({
            valid: true,
            roundTrip: true,
            mode: 'cartesian',
            orientation: 'vertical',
            legendPosition: 'right',
            height: 340,
        });
        expect(state.columns).toEqual([
            expect.objectContaining({ field: 'Month', kind: 'dimension', dataType: 'temporal', visible: true }),
            expect.objectContaining({ field: 'Revenue', mark: 'bar', axis: 'primary', color: '' }),
            expect.objectContaining({ field: 'Cost', mark: 'line', axis: 'secondary', color: '' }),
            expect.objectContaining({ field: 'Profit Δ', dataType: 'quantitative' }),
        ]);
        expect(state.rows[1]).toEqual({
            Month: '2026-02',
            Revenue: 51,
            Cost: 31,
            'Profit Δ': -6,
        });
        expect(vegaLiteChartTrendlineAvailable(state)).toBe(true);
    });

    test('reports empty chart mappings before they can become a silent blank preview', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        state.columns.filter(column => column.kind === 'series')
            .forEach(column => { column.visible = false; });

        expect(validateVegaLiteChartConfiguration(state)).toEqual({
            valid: false,
            error: 'Select at least one visible number column.',
        });
        state.columns.find(column => column.field === 'Revenue').visible = true;
        expect(validateVegaLiteChartConfiguration(state)).toEqual({ valid: true, error: '' });
    });

    test('keeps the first table column as the Cartesian category', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        const cost = state.columns.find(column => column.field === 'Cost');
        cost.mark = 'area';
        cost.axis = 'primary';
        cost.color = '#a855f7';
        cost.visible = false;

        const spec = buildVegaLiteChartSpec(state);
        const grouped = spec.layer.find(layer => layer.transform?.[0]?.fold);
        expect(grouped.transform[0].fold).toEqual(['Revenue', 'Profit Δ']);
        expect(grouped.encoding.x.field).toBe('Month');
        expect(grouped.encoding.color.scale.domain).toEqual(['Revenue', 'Profit Δ']);
        expect(cost).toMatchObject({ mark: 'area', axis: 'primary', color: '#a855f7', visible: false });

        const source = serializeVegaLiteChartFence(state).split('\n')[1];
        expect(createVegaLiteChartEditorStateFromSource(source)).toMatchObject({
            valid: true,
            roundTrip: true,
        });
        expect(JSON.parse(source).usermeta.figaro.chart).not.toHaveProperty('cartesianCategoryField');
    });

    test('defaults the Cartesian category to the first table column even when it is numeric', () => {
        const state = createVegaLiteChartEditorStateFromTable([
            '| Amount | Label | Score |',
            '| ---: | --- | ---: |',
            '| 10 | Alpha | 42 |',
            '| 20 | Beta | 51 |',
        ].join('\n'));

        expect(state.columns[0]).toMatchObject({
            field: 'Amount', kind: 'dimension', dataType: 'quantitative',
        });
        const spec = buildVegaLiteChartSpec(state);
        expect(spec.layer[0].encoding.x.field).toBe('Amount');
        expect(spec.layer[0].encoding.y.field).toBe('Score');
        expect(spec.layer[0].encoding.color.scale.domain).toEqual(['Score']);
    });

    test('regresses numeric series over hidden authored row order while retaining category labels', () => {
        const state = createVegaLiteChartEditorStateFromTable([
            '| Month | Revenue |',
            '| --- | ---: |',
            '| Jan | 42 |',
            '| Feb | 56 |',
            '| Mar | 50 |',
        ].join('\n'));
        state.columns.find(column => column.field === 'Revenue').trendline = true;

        expect(vegaLiteChartTrendlineAvailable(state)).toBe(true);
        const spec = buildVegaLiteChartSpec(state);
        const hiddenField = Object.keys(spec.data.values[0]).find(field => field.startsWith('__figaro_row_order__'));
        expect(spec.data.values.map(row => row[hiddenField])).toEqual([1, 2, 3]);
        const trendline = spec.layer.find(layer => layer.transform?.[0]?.regression);
        expect(trendline.transform[0]).toEqual({
            regression: 'Revenue',
            on: hiddenField,
            extent: [1, 3],
            as: [hiddenField, 'Revenue'],
        });
        expect(trendline.transform[1]).toMatchObject({
            lookup: hiddenField,
            from: { key: hiddenField, fields: ['Month'] },
        });
        expect(trendline.encoding.x).toEqual({ field: 'Month', type: 'nominal' });

        state.orientation = 'horizontal';
        const horizontal = buildVegaLiteChartSpec(state);
        expect(horizontal.layer.find(layer => layer.transform?.[0]?.regression).encoding.y)
            .toEqual({ field: 'Month', type: 'nominal' });
        const source = serializeVegaLiteChartFence(state).split('\n')[1];
        expect(createVegaLiteChartEditorStateFromSource(source)).toMatchObject({
            valid: true, roundTrip: true,
        });

        const oneRow = createVegaLiteChartEditorStateFromTable([
            '| Label | Value |',
            '| --- | ---: |',
            '| Only | 10 |',
        ].join('\n'));
        expect(vegaLiteChartTrendlineAvailable(oneRow)).toBe(false);
        oneRow.columns.find(column => column.field === 'Value').trendline = true;
        const oneRowSpec = buildVegaLiteChartSpec(oneRow);
        expect(oneRowSpec.data.values[0]).not.toHaveProperty('__figaro_row_order__');
        expect(oneRowSpec.layer.some(layer => layer.transform?.[0]?.regression)).toBe(false);

        const collision = createVegaLiteChartEditorStateFromTable([
            '| __figaro_row_order__ | Value |',
            '| --- | ---: |',
            '| First | 10 |',
            '| Second | 20 |',
        ].join('\n'));
        collision.columns.find(column => column.field === 'Value').trendline = true;
        const collisionSpec = buildVegaLiteChartSpec(collision);
        expect(collisionSpec.data.values[0]).toMatchObject({
            __figaro_row_order__: 'First',
            __figaro_row_order___: 1,
        });
    });

    test('upgrades category-predictor trendlines without treating them as manual JSON', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        state.columns.find(column => column.field === 'Revenue').trendline = true;
        const previous = buildVegaLiteChartSpec(state);
        previous.data.values.forEach(row => {
            delete row[Object.keys(row).find(field => field.startsWith('__figaro_row_order__'))];
        });
        const flattenLayers = layers => layers.flatMap(layer => (
            Array.isArray(layer.layer) ? flattenLayers(layer.layer) : [layer]
        ));
        const trendline = flattenLayers(previous.layer)
            .find(layer => layer.transform?.[0]?.regression === 'Revenue');
        trendline.transform = [{ regression: 'Revenue', on: 'Month' }];

        expect(createVegaLiteChartEditorStateFromSource(JSON.stringify(previous)))
            .toMatchObject({ valid: true, roundTrip: true });
    });

    test('builds per-column marks, one orientation, a shared stack, trendlines, and labelled guides', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        state.orientation = 'horizontal';
        state.columns.find(column => column.field === 'Revenue').mark = 'stacked';
        state.columns.find(column => column.field === 'Cost').mark = 'stacked';
        state.columns.find(column => column.field === 'Profit Δ').trendline = true;
        state.threshold = {
            visible: true,
            value: 60,
            axis: 'primary',
            color: '#f59e0b',
            label: 'Target',
        };

        const spec = buildVegaLiteChartSpec(state);
        const stack = spec.layer.find(layer => layer.transform?.[0]?.fold?.length === 2);
        const threshold = spec.layer.find(layer => layer.mark?.type === 'rule');
        const label = spec.layer.find(layer => layer.encoding?.text?.value === 'Target');

        expect(stack.transform[0].fold).toEqual(['Revenue', 'Cost']);
        expect(stack.encoding.x.stack).toBe('zero');
        expect(threshold.encoding.x.datum).toBe(60);
        expect(label.encoding.x.datum).toBe(60);
        expect(spec.width).toBe('container');
    });

    test('shares one scale per axis group and keeps a threshold on its selected opposite axis', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        state.threshold = {
            visible: true,
            value: 35,
            axis: 'secondary',
            color: '#f59e0b',
            label: 'Cost ceiling',
        };

        const spec = buildVegaLiteChartSpec(state);
        expect(spec.resolve).toEqual({ scale: { y: 'independent' } });
        expect(spec.layer).toHaveLength(2);
        const [primary, secondary] = spec.layer.map(group => group.layer);
        expect(primary.find(layer => layer.transform?.[0]?.fold).transform[0].fold)
            .toEqual(['Revenue', 'Profit Δ']);
        expect(primary.some(layer => layer.mark?.type === 'rule')).toBe(false);
        const threshold = secondary.find(layer => layer.mark?.type === 'rule');
        expect(threshold.encoding.y).toEqual({ datum: 35, type: 'quantitative' });
        expect(threshold.encoding.y).not.toHaveProperty('axis');
        expect(secondary.find(layer => layer.mark?.type === 'line').encoding.y.axis)
            .toMatchObject({ orient: 'right', title: 'Cost' });

        state.orientation = 'horizontal';
        const horizontal = buildVegaLiteChartSpec(state);
        const horizontalThreshold = horizontal.layer
            .flatMap(group => group.layer)
            .find(layer => layer.mark?.type === 'rule');
        expect(horizontalThreshold.encoding.x).toEqual({ datum: 35, type: 'quantitative' });
        expect(horizontalThreshold.encoding.x).not.toHaveProperty('axis');
    });

    test('builds one complete, repositionable legend for every visible Cartesian series', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        state.legendPosition = 'bottom';
        const spec = buildVegaLiteChartSpec(state);
        const flattenLayers = layers => layers.flatMap(layer => (
            Array.isArray(layer.layer) ? flattenLayers(layer.layer) : [layer]
        ));
        const colorEncodings = flattenLayers(spec.layer)
            .map(layer => layer.encoding?.color)
            .filter(Boolean);

        expect(colorEncodings).toHaveLength(2);
        colorEncodings.forEach(color => {
            expect(color.scale.domain).toEqual(['Revenue', 'Cost', 'Profit Δ']);
            expect(color.scale.range).toHaveLength(3);
            expect(color.legend).toEqual({ title: null, orient: 'bottom' });
        });
        expect(colorEncodings.find(color => color.datum === 'Cost')).toBeDefined();

        state.columns.find(column => column.field === 'Profit Δ').visible = false;
        const hiddenSpec = buildVegaLiteChartSpec(state);
        flattenLayers(hiddenSpec.layer)
            .map(layer => layer.encoding?.color)
            .filter(Boolean)
            .forEach(color => expect(color.scale.domain).toEqual(['Revenue', 'Cost']));

        const source = serializeVegaLiteChartFence(state).split('\n')[1];
        expect(createVegaLiteChartEditorStateFromSource(source).legendPosition).toBe('bottom');
    });

    test('upgrades managed charts created before complete legends without treating them as manual JSON', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        const previous = JSON.parse(JSON.stringify(buildVegaLiteChartSpec(state)));
        delete previous.usermeta.figaro.chart.legendPosition;
        const flattenLayers = layers => layers.flatMap(layer => (
            Array.isArray(layer.layer) ? flattenLayers(layer.layer) : [layer]
        ));
        const layers = flattenLayers(previous.layer);
        const groupedBars = layers.find(layer => layer.transform?.[0]?.fold);
        const previousDomain = groupedBars.transform[0].fold;
        const completeDomain = groupedBars.encoding.color.scale.domain;
        groupedBars.encoding.color.scale = {
            domain: previousDomain,
            range: previousDomain.map(field => (
                groupedBars.encoding.color.scale.range[completeDomain.indexOf(field)]
            )),
        };
        delete groupedBars.encoding.color.legend.orient;
        const line = layers.find(layer => layer.encoding?.color?.datum === 'Cost');
        line.mark.color = line.encoding.color.scale.range[
            line.encoding.color.scale.domain.indexOf('Cost')
        ];
        delete line.encoding.color;

        const reopened = createVegaLiteChartEditorStateFromSource(JSON.stringify(previous));
        expect(reopened).toMatchObject({ valid: true, roundTrip: true, legendPosition: 'right' });
        expect(JSON.parse(serializeVegaLiteChartFence(reopened).split('\n')[1])
            .usermeta.figaro.chart.legendPosition).toBe('right');
    });

    test('upgrades managed thresholds that previously suppressed their shared value axis', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        state.threshold.visible = true;
        state.threshold.value = 35;
        const previous = JSON.parse(JSON.stringify(buildVegaLiteChartSpec(state)));
        const flattenLayers = layers => layers.flatMap(layer => (
            Array.isArray(layer.layer) ? flattenLayers(layer.layer) : [layer]
        ));
        expect(createVegaLiteChartEditorStateFromSource(JSON.stringify(previous)))
            .toMatchObject({ valid: true, roundTrip: true });
        const previousThresholds = flattenLayers(previous.layer).filter(layer => (
            layer.mark?.type === 'rule'
            || (layer.mark?.type === 'text' && layer.encoding?.text?.value === 'Threshold')
        ));
        previousThresholds.forEach(layer => { layer.encoding.y.axis = null; });

        const reopened = createVegaLiteChartEditorStateFromSource(JSON.stringify(previous));
        expect(reopened).toMatchObject({ valid: true, roundTrip: true });
        const upgraded = JSON.parse(serializeVegaLiteChartFence(reopened).split('\n')[1]);
        flattenLayers(upgraded.layer).filter(layer => (
            layer.mark?.type === 'rule'
            || (layer.mark?.type === 'text' && layer.encoding?.text?.value === 'Threshold')
        )).forEach(layer => expect(layer.encoding.y).not.toHaveProperty('axis'));
    });

    test('creates focused Pie and Waterfall specs with percentages and calculated totals', () => {
        const pie = createVegaLiteChartEditorStateFromTable(table);
        pie.mode = 'pie';
        pie.pie.valueField = 'Revenue';
        pie.legendPosition = 'left';
        expect(buildVegaLiteChartSpec(pie).layer[0].encoding.color.legend.orient).toBe('left');
        expect(buildVegaLiteChartSpec(pie).layer).toEqual(expect.arrayContaining([
            expect.objectContaining({ mark: expect.objectContaining({ type: 'arc' }) }),
            expect.objectContaining({
                transform: expect.arrayContaining([expect.objectContaining({ joinaggregate: expect.any(Array) })]),
            }),
        ]));

        const waterfall = createVegaLiteChartEditorStateFromTable(table);
        waterfall.mode = 'waterfall';
        waterfall.waterfall.startingValue = 50;
        waterfall.waterfall.showFinalTotal = true;
        const spec = buildVegaLiteChartSpec(waterfall);
        expect(spec.data.values[0]).toMatchObject({ figaro_category: 'Start', figaro_sum: 50 });
        expect(spec.data.values.at(-1)).toMatchObject({ figaro_category: 'Total', figaro_kind: 'total' });
        expect(spec.layer[0].encoding.color.condition).toHaveLength(2);
        expect(spec.layer[1]).toMatchObject({
            transform: [{ window: [{ op: 'lead', field: 'figaro_category', as: 'figaro_next' }] }],
            mark: expect.objectContaining({ type: 'rule' }),
            encoding: { x2: { field: 'figaro_next' } },
        });
    });

    test('uses any table column as a reversible Pie or Waterfall category', () => {
        const source = [
            '| Region | Quarter | Revenue |',
            '| --- | --- | ---: |',
            '| North | Q1 | 42 |',
            '| South | Q2 | 51 |',
        ].join('\n');
        const state = createVegaLiteChartEditorStateFromTable(source);
        state.pie.categoryField = 'Quarter';
        state.waterfall.categoryField = 'Quarter';

        state.mode = 'pie';
        const pie = buildVegaLiteChartSpec(state);
        expect(pie.layer[0].encoding.color.field).toBe('Quarter');

        state.mode = 'waterfall';
        const waterfall = buildVegaLiteChartSpec(state);
        expect(waterfall.data.values[1].figaro_category).toBe('Q1');

        const serialized = serializeVegaLiteChartFence(state).split('\n')[1];
        expect(createVegaLiteChartEditorStateFromSource(serialized)).toMatchObject({
            valid: true,
            roundTrip: true,
            pie: { categoryField: 'Quarter' },
            waterfall: { categoryField: 'Quarter' },
        });

        const numeric = createVegaLiteChartEditorStateFromTable([
            '| Baseline | Actual |',
            '| ---: | ---: |',
            '| 10 | 12 |',
            '| 20 | 18 |',
        ].join('\n'));
        numeric.mode = 'pie';
        numeric.pie.categoryField = 'Actual';
        numeric.pie.valueField = 'Baseline';
        const numericSource = serializeVegaLiteChartFence(numeric).split('\n')[1];
        expect(createVegaLiteChartEditorStateFromSource(numericSource)).toMatchObject({
            roundTrip: true,
            pie: { categoryField: 'Actual', valueField: 'Baseline' },
        });
    });

    test('round-trips exact table source and detects unsupported JSON edits', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        const fence = serializeVegaLiteChartFence(state);
        const source = fence.split('\n')[1];

        expect(vegaLiteChartTableSource(source)).toBe(table);
        expect(createVegaLiteChartEditorStateFromSource(source)).toMatchObject({
            valid: true,
            roundTrip: true,
        });
        expect(isFigaroVegaLiteChartSource(source)).toBe(true);

        const edited = JSON.parse(source);
        edited.title = 'Manual title';
        const unsupported = createVegaLiteChartEditorStateFromSource(JSON.stringify(edited));
        expect(unsupported).toMatchObject({ valid: true, roundTrip: false });
        expect(unsupported.warning).toContain('outside the reversible');
        expect(vegaLiteChartTableSource(JSON.stringify(edited))).toBeNull();
        expect(isFigaroVegaLiteChartSource(JSON.stringify(edited))).toBe(true);
        expect(isFigaroVegaLiteChartSource('{"mark":"bar"}')).toBe(false);
    });

    test('updates managed height once and clamps direct vertical resizing', () => {
        const state = createVegaLiteChartEditorStateFromTable(table);
        const source = JSON.stringify(buildVegaLiteChartSpec(state));

        const resized = setVegaLiteChartHeight(source, 612);
        expect(vegaLiteChartHeight(resized)).toBe(612);
        expect(JSON.parse(resized).height).toBe(612);
        expect(vegaLiteChartResizePlan({ startHeight: 340, deltaY: -999 })).toBe(180);
        expect(vegaLiteChartResizePlan({ startHeight: 340, deltaY: 999 })).toBe(900);
    });

    test('rejects merged, nonnumeric, and foreign Vega-Lite sources without data loss', () => {
        const merged = `${table}\n<!-- figaro:table-merge A2:B2 -->`;
        expect(createVegaLiteChartEditorStateFromTable(merged)).toMatchObject({
            valid: false,
            error: expect.stringContaining('split'),
        });
        expect(createVegaLiteChartEditorStateFromTable('| A | B |\n| --- | --- |\n| x | y |'))
            .toMatchObject({ valid: false, error: expect.stringContaining('numeric') });
        expect(createVegaLiteChartEditorStateFromSource('{"mark":"bar"}'))
            .toMatchObject({ valid: false, error: expect.stringContaining('not created') });
    });
});

import { diagramData } from '../../../frontend/vendored/mermaid-examples/index.js';
import {
    mermaidBorderColor,
    mermaidFlowchartDirection,
    mermaidFlowchartNodeIdFromSvg,
    mermaidFlowchartNodes,
    mermaidPaletteCount,
    mermaidReadableTextColor,
    mermaidSourceWithFlowchartDirection,
    mermaidSourceWithFlowchartNodeStyle,
    mermaidSourceWithStyleConfig,
    mermaidSourceWithoutManagedNodeStyles,
    mermaidStyleConfigState,
    mermaidStyleDescriptor,
    mermaidTargetVariablePatch,
    mermaidTargetColor,
    mermaidThemePresetForState,
    mermaidThemePresetPatch,
} from '../../../frontend/js/core/mermaidStyleEditorModel.js';

describe('Mermaid style editor model', () => {
    test('provides a truthful adaptive descriptor for every bundled Mermaid diagram type', () => {
        const descriptors = diagramData.map(diagram => mermaidStyleDescriptor(diagram.id));

        expect(descriptors).toHaveLength(32);
        expect(descriptors.every(descriptor => descriptor.id !== 'generic')).toBe(true);
        expect(mermaidStyleDescriptor('graph')).toMatchObject({ id: 'flowchart-v2', kind: 'flowchart' });
        expect(mermaidStyleDescriptor('sequence')).toMatchObject({
            id: 'sequence',
            targets: expect.arrayContaining([expect.objectContaining({ label: 'Participants', variable: 'actorBkg' })]),
        });
        expect(mermaidStyleDescriptor('pie').targets).toHaveLength(8);
        expect(mermaidStyleDescriptor('pie').targets[0].variable).toBe('pie1');
        expect(mermaidStyleDescriptor('venn').targets.at(-1).variable).toBe('venn8');
        expect(mermaidStyleDescriptor('unknown-beta')).toMatchObject({ id: 'unknown-beta', targets: [] });
    });

    test('derives accessible companion colors for one visible color choice', () => {
        expect(mermaidBorderColor('#ef4444')).toBe('#ac3131');
        expect(mermaidReadableTextColor('#ef4444')).toBe('#111827');
        expect(mermaidReadableTextColor('#f59e0b')).toBe('#111827');
        expect(mermaidTargetVariablePatch({
            variable: 'actorBkg',
            borderVariable: 'actorBorder',
            textVariable: 'actorTextColor',
        }, '#f59e0b')).toEqual({
            actorBkg: '#f59e0b',
            actorBorder: '#b07208',
            actorTextColor: '#111827',
        });
    });

    test('adds native Mermaid frontmatter and preserves unrelated configuration', () => {
        const source = [
            '---',
            "title: 'Checkout'",
            'config:',
            '  sequence:',
            '    mirrorActors: false',
            '---',
            'sequenceDiagram',
            '  A->>B: Hello',
        ].join('\n');
        const result = mermaidSourceWithStyleConfig(source, {
            theme: 'base',
            variables: { actorBkg: '#ef4444', actorTextColor: '#ffffff' },
        });

        expect(result.reason).toBe('');
        expect(result.source).toContain("title: 'Checkout'");
        expect(result.source).toContain('    mirrorActors: false');
        expect(result.source).toContain("  theme: 'base'");
        expect(result.source).toContain("    actorBkg: '#ef4444'");
        expect(mermaidStyleConfigState(result.source)).toMatchObject({
            theme: 'base',
            variables: { actorBkg: '#ef4444', actorTextColor: '#ffffff' },
        });
    });

    test('removes empty managed mappings but retains document frontmatter', () => {
        const styled = mermaidSourceWithStyleConfig('flowchart LR\n  A --> B', {
            theme: 'base',
            variables: { primaryColor: '#ef4444' },
            flowchartCurve: 'basis',
        }).source;
        const reset = mermaidSourceWithStyleConfig(styled, {
            theme: null,
            variables: { primaryColor: null },
            flowchartCurve: null,
        });

        expect(styled).toContain('---\nconfig:');
        expect(reset.source).toBe('flowchart LR\n  A --> B');

        const titled = mermaidSourceWithStyleConfig("---\ntitle: 'Flow'\n---\nflowchart LR\n  A --> B", {
            theme: 'neutral',
        }).source;
        expect(mermaidSourceWithStyleConfig(titled, { theme: null }).source)
            .toBe("---\ntitle: 'Flow'\n---\nflowchart LR\n  A --> B");
    });

    test('refuses compact advanced YAML instead of overwriting it', () => {
        const source = [
            '---',
            "config: { theme: 'dark' }",
            '---',
            'flowchart LR',
            '  A --> B',
        ].join('\n');
        const result = mermaidSourceWithStyleConfig(source, { theme: 'base' });

        expect(result.changed).toBe(false);
        expect(result.source).toBe(source);
        expect(result.reason).toContain('advanced YAML');
        const directive = "%%{init: {'theme': 'dark'}}%%\nflowchart LR\n A --> B";
        expect(mermaidSourceWithStyleConfig(directive, {theme:'base'}))
            .toMatchObject({source:directive,changed:false,reason:expect.stringContaining('init directive')});
        const quotedMarker = 'flowchart LR\n A["%% Figaro node styles"] --> B["%% End Figaro node styles"]';
        expect(mermaidSourceWithoutManagedNodeStyles(quotedMarker)).toBe(quotedMarker);
    });

    test('round-trips the universal document, neutral, and accent presets', () => {
        const accent = mermaidThemePresetPatch('accent', '#3b82f6');
        expect(accent).toMatchObject({
            theme: 'base',
            variables: { primaryColor: '#3b82f6', primaryTextColor: '#111827' },
        });
        expect(mermaidThemePresetForState({ theme: 'base', variables: accent.variables })).toBe('accent');
        expect(mermaidThemePresetForState({ theme: 'neutral', variables: {} })).toBe('neutral');
        expect(mermaidThemePresetForState({ theme: '', variables: {} })).toBe('document');
        expect(Object.values(mermaidThemePresetPatch('document').variables).every(value => value === null)).toBe(true);
    });

    test('extracts flowchart nodes without treating labels or directives as ids', () => {
        const source = [
            'flowchart LR',
            '  Idea["Collect ideas"] --> Draft(Draft copy)',
            '  Draft --> Review{Approved?}',
            '  Review --> Publish',
            '  classDef urgent fill:#f00',
        ].join('\n');

        const nodes = [
            { id: 'Idea', label: 'Collect ideas' },
            { id: 'Draft', label: 'Draft copy' },
            { id: 'Review', label: 'Approved?' },
            { id: 'Publish', label: 'Publish' },
        ];
        expect(mermaidFlowchartNodes(source, { nodes: nodes.map(node => ({id: node.id, text: node.label})) }))
            .toEqual(nodes.map(node => ({...node, fill: '', sourceFill: ''})));
        expect(mermaidFlowchartNodes(source)).toEqual([]);
    });

    test('writes node colors and shapes in one native, replaceable Mermaid section', () => {
        const source = 'flowchart LR\n  A[Idea] --> B[Done]';
        const inspection = { nodes: [{ id: 'A', text: 'Idea' }, { id: 'B', text: 'Done' }] };
        const colored = mermaidSourceWithFlowchartNodeStyle(source, 'A', { fill: '#ef4444' }, inspection);
        const shaped = mermaidSourceWithFlowchartNodeStyle(colored.source, 'A', { shape: 'rounded' }, inspection);

        expect(shaped.source).toContain('style A fill:#ef4444,stroke:#ac3131,color:#111827');
        expect(shaped.source).toContain('A@{ shape: rounded }');
        expect(shaped.source.match(/%% Figaro node styles/gu)).toHaveLength(1);
        expect(mermaidFlowchartNodes(shaped.source, inspection)[0]).toMatchObject({
            id: 'A', fill: '#ef4444', shape: 'rounded',
        });

        const resetColor = mermaidSourceWithFlowchartNodeStyle(shaped.source, 'A', { fill: '' }, inspection);
        expect(resetColor.source).not.toContain('style A ');
        expect(resetColor.source).toContain('A@{ shape: rounded }');
        expect(mermaidSourceWithFlowchartNodeStyle(resetColor.source, 'A', { shape: 'original' }, inspection).source).toBe(source);
        expect(mermaidSourceWithFlowchartNodeStyle(source, 'car', { shape: 'stadium' }, inspection))
            .toMatchObject({changed: false, source, reason: expect.stringContaining('parsed flowchart node')});
    });

    test('updates only the flowchart direction and maps rendered SVG ids back to authored nodes', () => {
        const source = "---\ntitle: 'Flow'\n---\nflowchart TD\n  Draft-note --> Review";
        const changed = mermaidSourceWithFlowchartDirection(source, 'LR');
        expect(mermaidFlowchartDirection(source)).toBe('TB');

        expect(changed.source).toBe("---\ntitle: 'Flow'\n---\nflowchart LR\n  Draft-note --> Review");
        expect(mermaidFlowchartDirection(changed.source)).toBe('LR');
        expect(mermaidFlowchartNodeIdFromSvg(
            'figaro-mermaid-editor-mermaid-8-flowchart-Draft-note-0',
            ['Draft', 'Draft-note', 'Review'],
        )).toBe('Draft-note');
    });

    test('shows native and class-based fills and restores them without erasing authored statements', () => {
        const source = 'flowchart TD\n A --> B\nstyle A fill:#ef4444\nclassDef blue fill:#3b82f6\nclass B blue';
        const inspection = { nodes: [
            {id: 'A', styles: ['fill:#ef4444'], classes: []},
            {id: 'B', styles: [], classes: ['blue']},
        ], classes: {blue: {styles: ['fill:#3b82f6']}} };
        expect(mermaidFlowchartNodes(source, inspection).map(node => node.fill)).toEqual(['#ef4444', '#3b82f6']);
        const styled = mermaidSourceWithFlowchartNodeStyle(source, 'B', {fill: '#f59e0b'}, inspection);
        expect(mermaidFlowchartNodes(styled.source, inspection)[1].fill).toBe('#f59e0b');
        const reset = mermaidSourceWithFlowchartNodeStyle(styled.source, 'B', {fill: ''}, inspection);
        expect(reset.source).toBe(source);
        expect(mermaidFlowchartNodes(reset.source, inspection)[1].fill).toBe('#3b82f6');
    });

    test('distinguishes authored dark/custom themes from the exact built-in presets', () => {
        expect(mermaidThemePresetForState({theme:'dark'})).toBe('custom');
        expect(mermaidThemePresetForState({theme:'base',variables:{primaryColor:'#ff0000'}})).toBe('custom');
        expect(mermaidStyleConfigState('', {theme:'dark',themeVariables:{actorBkg:'#ff0000'}}))
            .toMatchObject({theme:'dark',variables:{actorBkg:'#ff0000'}});
        const preset = mermaidThemePresetPatch('accent');
        expect(mermaidThemePresetForState(mermaidStyleConfigState('', {
            ...preset, themeVariables: {...preset.variables, customVariable:'#ffffff'},
        }))).toBe('custom');
    });

    test('XY offers only real plots and edits the native nested palette without changing the other series or theme', () => {
        const inspection = {plots:[{type:'bar'},{type:'line'}],effectiveVariables:{xyChart:{plotColorPalette:'#111111,#222222,#333333'}}};
        const targets = mermaidStyleDescriptor('xychart', inspection).targets;
        expect(targets.map(target => target.label)).toEqual(['Bar 1','Line 2']);
        const variables = mermaidTargetVariablePatch(targets[1], '#ef4444', {}, inspection.effectiveVariables);
        const result = mermaidSourceWithStyleConfig('xychart-beta\n bar [1,2]\n line [2,3]', {variables});
        expect(result.source).toContain("      plotColorPalette: '#111111,#ef4444,#333333'");
        expect(result.source).not.toContain('theme:');
        expect(mermaidStyleConfigState(result.source).variables['xyChart.plotColorPalette']).toBe('#111111,#ef4444,#333333');
        expect(mermaidStyleDescriptor('pie', {paletteCount:2}).targets).toHaveLength(2);
        const shortPalette = {variables:{'xyChart.plotColorPalette':'#111111'}};
        expect(mermaidTargetColor(targets[1], shortPalette)).toBe('#111111');
        expect(mermaidTargetVariablePatch({...targets[1],plotCount:3}, '#ef4444', shortPalette))
            .toEqual({'xyChart.plotColorPalette':'#111111,#ef4444,#111111'});
    });

    test('limits palette controls to actual branches, groups, sections, or series', () => {
        expect(mermaidPaletteCount('timeline', {sections:[],tasks:[1,2,3]})).toBe(3);
        expect(mermaidPaletteCount('timeline', {sections:['A'],tasks:[1,2,3]})).toBe(1);
        expect(mermaidPaletteCount('treemap', [{children:[{}]}, {value:1}, {children:[{}]}])).toBe(2);
        expect(mermaidPaletteCount('radar', [{name:'A'}, {name:'B'}])).toBe(2);
        expect(mermaidPaletteCount('flowchart-v2')).toBeUndefined();
    });
});

import { expect, test } from '@playwright/test';

// Browser-only boundary: Mermaid needs real SVG text/layout measurements, and
// accepting themeVariables during parsing does not prove they affect any mark.
test('renders all Mermaid templates and verifies every offered color against painted SVG', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    const result = await page.evaluate(async () => {
        const { mermaidTemplates } = await import('/js/mermaidEditor.js');
        const { renderDiagramSVG, inspectMermaidSource } = await import('/js/diagramRenderer.js');
        const { mermaidStyleDescriptor, mermaidSourceWithStyleConfig, mermaidTargetVariablePatch,
            mermaidThemePresetPatch, mermaidStyleConfigState, mermaidFlowchartNodes,
        } = await import('/js/core/mermaidStyleEditorModel.js');
        const host = document.createElement('div');
        document.body.append(host);
        const rows = [];
        const failures = [];
        const paint = async source => {
            host.innerHTML = await renderDiagramSVG('mermaid', source, 'catalogue-contract');
            const svg = host.querySelector('svg');
            if (!svg || svg.getBBox().width <= 0 || svg.getBBox().height <= 0) throw new Error('Empty SVG');
            return [...svg.querySelectorAll('path, rect, circle, ellipse, polygon, line, text')].filter(element => {
                const style = getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && [style.fill, style.stroke].includes('rgb(18, 171, 52)');
            }).length;
        };
        for (const diagram of mermaidTemplates) {
            const row = { id: diagram.id, templates: 0, presetRenders: 0, targets: {} };
            for (const example of diagram.examples) {
                try {
                    const inspection = await inspectMermaidSource(example.code);
                    await paint(example.code);
                    row.templates++;
                    for (const preset of ['document', 'neutral', 'accent', 'dark']) {
                        const patch = preset === 'dark' ? { theme: 'dark' } : mermaidThemePresetPatch(preset);
                        const styled = mermaidSourceWithStyleConfig(example.code, patch);
                        if (styled.reason) throw new Error(styled.reason);
                        await paint(styled.source);
                        row.presetRenders++;
                    }
                    for (const target of mermaidStyleDescriptor(diagram.id, inspection).targets) {
                        const styled = mermaidSourceWithStyleConfig(example.code, {
                            variables: mermaidTargetVariablePatch(target, '#12ab34',
                                mermaidStyleConfigState(example.code), inspection.effectiveVariables),
                        });
                        if (!styled.changed || styled.reason) throw new Error(`No editable setting for ${target.id}`);
                        row.targets[target.id] = Boolean(await paint(styled.source)) || row.targets[target.id] || false;
                    }
                } catch (error) { failures.push(`${diagram.id}/${example.title}: ${error.message}`); }
            }
            for (const [target, painted] of Object.entries(row.targets)) {
                if (!painted) failures.push(`${diagram.id}/${target}: accepted color never painted a mark`);
            }
            rows.push(row);
        }
        const identities = [];
        for (const code of ['flowchart LR\n A --> B --> C',
            'flowchart TD\n A[fa:fa-car Car] --> B\n C',
            'flowchart TD\n A --> B\nstyle A fill:#ef4444\nclassDef blue fill:#3b82f6\nclass B blue']) {
            const inspection = await inspectMermaidSource(code);
            const nodes = mermaidFlowchartNodes(code, inspection);
            await paint(code);
            identities.push({ids: nodes.map(node => node.id), fills: nodes.map(node => node.fill),
                rendered: host.querySelectorAll('g.node').length});
        }
        host.remove();
        return { rows, failures, identities };
    });
    await testInfo.attach('Mermaid renderer matrix', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.failures).toEqual([]);
    expect(result.rows).toHaveLength(32);
    expect(result.rows.reduce((count, row) => count + row.templates, 0)).toBe(76);
    expect(result.rows.reduce((count, row) => count + row.presetRenders, 0)).toBe(304);
    expect(result.identities).toEqual([
        {ids:['A','B','C'], fills:['','',''], rendered:3},
        {ids:['A','B','C'], fills:['','',''], rendered:3},
        {ids:['A','B'], fills:['#ef4444','#3b82f6'], rendered:2},
    ]);
});

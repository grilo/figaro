import {
    diagramRenderCacheKey,
    rebaseDiagramSvgIds,
    vegaRenderCacheKey,
    vegaOutputCanBeReused,
    vegaRenderDimensions,
    rebaseSvgAttribute,
    vegaUsesContainerSize,
} from '../frontend/js/core/diagramRenderCacheModel.js';

describe('diagram render cache model', () => {
    test('Vega keys include effective appearance, data, fonts and normalized container geometry', () => {
        const spec = { width: 'container', data: { values: [1, 2] }, config: { color: 'red' } };
        const size = vegaRenderDimensions(720.1, 300);
        expect(size).toEqual({ width: 720, height: 380 });
        const key = vegaRenderCacheKey('vega-lite', spec, size, ['font-a']);
        expect(vegaRenderCacheKey('vega-lite', spec, vegaRenderDimensions(720.4, 300), ['font-a'])).toBe(key);
        for (const inputs of [
            ['vega', spec, size, ['font-a']],
            ['vega-lite', { ...spec, data: { values: [3] } }, size, ['font-a']],
            ['vega-lite', { ...spec, config: { color: 'blue' } }, size, ['font-a']],
            ['vega-lite', spec, { ...size, width: 800 }, ['font-a']],
            ['vega-lite', spec, size, ['font-b']],
        ]) expect(vegaRenderCacheKey(...inputs)).not.toBe(key);
    });

    test('external datasets/images and volatile expressions bypass Vega output reuse', () => {
        for (const spec of [{ data: { url: 'data.csv' } }, { layer: [{ data: { url: 'data.json' } }] },
            { signals: [{ update: 'now()' }] }, { transform: [{ calculate: 'random()' }] },
            { transform: [{ type: 'sample' }] }, { signals: [{ update: 'sampleNormal()' }] },
            { signals: [{ update: 'windowSize()[0]' }] }, { signals: [{ update: 'screen().width' }] },
            { signals: [{ on: [{ events: { type: 'timer' }, update: '1' }] }] }]) {
            expect(vegaOutputCanBeReused(spec)).toBe(false);
            expect(vegaRenderCacheKey('vega', spec, {}, [])).toBeNull();
        }
        expect(vegaOutputCanBeReused({ $schema: 'https://vega.github.io/schema/vega/v5.json', data: { values: [1] } })).toBe(true);
    });

    test('fixed-size charts reuse output across viewport changes while responsive signals require new geometry', () => {
        const spec = { width: 500, height: 300, mark: 'bar' };
        expect(vegaRenderCacheKey('vega-lite', spec, { width: 600 }, []))
            .toBe(vegaRenderCacheKey('vega-lite', spec, { width: 700 }, []));
        expect(vegaUsesContainerSize(spec)).toBe(false);
        for (const responsive of [{ ...spec, width: 'container' },
            { signals: [{ update: 'containerSize()[0]' }] }, { autosize: { type: 'fit' } }]) {
            expect(vegaUsesContainerSize(responsive)).toBe(true);
        }
    });

    test('Vega ID rebasing preserves external references and literal text', () => {
        const ids = new Map([['clip1', 'mount-clip'], ['label', 'mount-label']]);
        expect(rebaseSvgAttribute('clip-path', 'url(#clip1)', ids)).toBe('url(#mount-clip)');
        expect(rebaseSvgAttribute('style', 'fill:url("#clip1");stroke:url(#other)', ids))
            .toBe('fill:url("#mount-clip");stroke:url(#other)');
        expect(rebaseSvgAttribute('xlink:href', '#clip1', ids)).toBe('#mount-clip');
        expect(rebaseSvgAttribute('href', 'other.svg#clip1', ids)).toBe('other.svg#clip1');
        expect(rebaseSvgAttribute('aria-labelledby', 'label other', ids)).toBe('mount-label other');
        expect(rebaseSvgAttribute('aria-label', 'clip1 label', ids)).toBe('clip1 label');
        expect(rebaseSvgAttribute('aria-label', 'literal url(#clip1)', ids)).toBe('literal url(#clip1)');
        expect(rebaseSvgAttribute('data-label', 'literal url(#clip1)', ids)).toBe('literal url(#clip1)');
    });
    test('keys source content by normalized diagram language', () => {
        expect(diagramRenderCacheKey(' Mermaid ', 'flowchart TD\n  A --> B'))
            .toBe('mermaid\u0000flowchart TD\n  A --> B');
        expect(diagramRenderCacheKey('mermaid', 'flowchart TD\n  A --> B'))
            .toBe(diagramRenderCacheKey('MERMAID', 'flowchart TD\n  A --> B'));
        expect(diagramRenderCacheKey('mermaid', 'flowchart TD\n  A --> C'))
            .not.toBe(diagramRenderCacheKey('mermaid', 'flowchart TD\n  A --> B'));
    });

    test('rebases generated ids and their references without changing other content', () => {
        const svg = '<svg id="source-1"><use href="#source-1"/><text>source-1 label</text></svg>';

        expect(rebaseDiagramSvgIds(svg, 'source-1', 'target-2'))
            .toBe('<svg id="target-2"><use href="#target-2"/><text>target-2 label</text></svg>');
        expect(rebaseDiagramSvgIds(svg, '', 'target-2')).toBe(svg);
        expect(rebaseDiagramSvgIds(svg, 'source-1', 'source-1')).toBe(svg);
    });
});

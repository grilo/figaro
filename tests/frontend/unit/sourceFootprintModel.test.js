import { EditorState } from '@codemirror/state';
import {
    graphicFootprintPlan,
    normalizeSourceLineCount,
    sourceFootprintMode,
    sourceLineCount,
} from '../frontend/js/core/sourceFootprintModel.js';
import {
    fitGraphicToSourceFootprint,
    markSourceFootprint,
    requestSourceFootprintMeasure,
    sourceFootprintUpdateNeedsMeasure,
} from '../frontend/js/sourceFootprint.js';

describe('stable Markdown source footprints', () => {
    test('counts the exact logical source rows of a replacement range', () => {
        const doc = EditorState.create({ doc: 'before\n```js\nanswer()\n```\nafter' }).doc;
        expect(sourceLineCount(doc, doc.line(2).from, doc.line(4).to)).toBe(3);
        expect(sourceLineCount(doc, doc.line(2).from, doc.line(5).from)).toBe(3);
        expect(normalizeSourceLineCount(0)).toBe(1);
    });

    test('scales oversized graphics down without enlarging smaller graphics', () => {
        expect(graphicFootprintPlan({
            availableWidth: 400,
            availableHeight: 200,
            contentWidth: 800,
            contentHeight: 300,
        })).toEqual({ scale: 0.5, state: 'overflow' });
        expect(graphicFootprintPlan({
            availableWidth: 400,
            availableHeight: 200,
            contentWidth: 180,
            contentHeight: 80,
        })).toEqual({ scale: 1, state: 'underflow' });
    });

    test('limits the policy to approved block replacements', () => {
        expect(sourceFootprintMode('mermaid')).toBe('graphic');
        expect(sourceFootprintMode('vega')).toBe('graphic');
        expect(sourceFootprintMode('vega-lite')).toBe('graphic');
        expect(sourceFootprintMode('math')).toBe('graphic');
        expect(sourceFootprintMode('code')).toBe('scroll');
        expect(sourceFootprintMode('table')).toBe('scroll');

        for (const excluded of ['image', 'frontmatter', 'properties', 'link', 'checkbox', 'task']) {
            expect(sourceFootprintMode(excluded)).toBeNull();
            const element = document.createElement('div');
            markSourceFootprint(element, { kind: excluded, lineCount: 4 });
            expect(element.classList.contains('cm-source-footprint')).toBe(false);
        }
    });

    test('applies the pure graphic plan to connected editor DOM', async () => {
        const root = document.createElement('div');
        const viewport = document.createElement('div');
        const graphic = document.createElement('div');
        root.append(viewport);
        viewport.append(graphic);
        document.body.append(root);
        viewport.getBoundingClientRect = () => ({ width: 400, height: 200 });
        graphic.getBoundingClientRect = () => ({ width: 800, height: 300 });

        const stop = fitGraphicToSourceFootprint(root, viewport, graphic);
        await Promise.resolve();
        expect(root.dataset.sourceFootprintState).toBe('overflow');
        expect(graphic.style.transform).toBe('scale(0.5)');
        stop();

        graphic.getBoundingClientRect = () => ({ width: 180, height: 80 });
        fitGraphicToSourceFootprint(root, viewport, graphic);
        await Promise.resolve();
        expect(root.dataset.sourceFootprintState).toBe('underflow');
        expect(graphic.style.transform).toBe('');
    });

    test('refreshes existing slots after the editor line height changes without requiring a mounted content DOM', async () => {
        const dom = document.createElement('div');
        const block = document.createElement('div');
        block.className = 'cm-source-footprint';
        block.dataset.sourceLines = '4';
        dom.append(block);
        const view = {
            defaultLineHeight: 30,
            dom,
            requestMeasure: ({ read, write }) => write(read()),
        };

        requestSourceFootprintMeasure(view);
        expect(block.style.getPropertyValue('--cm-source-footprint-height')).toBe('120px');
        await Promise.resolve();
    });

    test('keeps a managed chart at its authored height when source lines would be shorter', async () => {
        const dom = document.createElement('div');
        const block = document.createElement('div');
        block.className = 'cm-source-footprint';
        block.dataset.sourceLines = '3';
        block.dataset.figaroChartHeight = '340';
        dom.append(block);
        const view = {
            defaultLineHeight: 20,
            dom,
            contentDOM: dom,
            requestMeasure: jest.fn(measure => {
                if (measure) measure.write(measure.read());
            }),
        };

        requestSourceFootprintMeasure(view);
        expect(block.style.getPropertyValue('--cm-source-footprint-height')).toBe('384px');
        await Promise.resolve();
        expect(block.style.getPropertyValue('--cm-source-footprint-height')).toBe('384px');
    });

    test('does not remeasure every footprint for ordinary cursor movement', () => {
        expect(sourceFootprintUpdateNeedsMeasure({
            docChanged: false,
            geometryChanged: false,
            viewportChanged: false,
            selectionSet: true,
        })).toBe(false);
        expect(sourceFootprintUpdateNeedsMeasure({ docChanged: true })).toBe(true);
        expect(sourceFootprintUpdateNeedsMeasure({ geometryChanged: true })).toBe(true);
        expect(sourceFootprintUpdateNeedsMeasure({ viewportChanged: true })).toBe(true);
    });
});

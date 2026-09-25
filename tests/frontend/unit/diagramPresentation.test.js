import { createDiagramPresentation, mermaidSizeKeys } from '../../../frontend/js/diagramPresentation.js';
import { createDiagramSizeMemory } from '../../../frontend/js/adapters/diagramSizeMemory.js';

describe('diagram presentations', () => {
    test('memoizes Mermaid size keys and ignores the height directive for the drawing', () => {
        const source = 'flowchart TD\n  A --> B';
        const keys = mermaidSizeKeys(source);
        expect(mermaidSizeKeys(source)).toBe(keys);
        const resized = mermaidSizeKeys(`${source}\n%% figaro:height 240`);
        expect(resized.natural).toBe(keys.natural);
        expect(resized.box).not.toBe(keys.box);
    });

    test('chooses geometry by diagram kind', () => {
        const sizeMemory = createDiagramSizeMemory({ storage: null });
        const mermaid = createDiagramPresentation({ lang: 'mermaid', code: 'flowchart TD\n A --> B', sizeMemory });
        expect(mermaid).toMatchObject({ resizable: true, deferDuringKeyRepeat: true, userEvent: 'diagram.resize' });
        const vega = createDiagramPresentation({ lang: 'vega', code: '{"mark":"bar"}', sizeMemory });
        expect(vega).toMatchObject({ resizable: false, appearance: 'authored', deferDuringKeyRepeat: false });
    });

    test('Mermaid reserves its drawing before render and cancels back to the authored size', () => {
        const sizeMemory = createDiagramSizeMemory({ storage: null });
        const code = 'flowchart LR\n  Keep --> Size\n%% figaro:height 240';
        sizeMemory.rememberNaturalSize(mermaidSizeKeys(code).natural, { width: 300, height: 100 });
        const presentation = createDiagramPresentation({ lang: 'mermaid', code, sizeMemory });
        const root = document.createElement('div');
        const content = document.createElement('div');
        root.append(content);
        const { target, anchor } = presentation.mount(root, content);
        expect(anchor.contains(target)).toBe(true);
        presentation.initialize(root);
        expect(root.style.getPropertyValue('--figaro-diagram-width')).toBe('720px');
        expect(root.dataset.figaroDiagramHeight).toBe('240');
        presentation.apply(root, 120);
        expect(root.style.getPropertyValue('--figaro-diagram-width')).toBe('360px');
        presentation.restore(root);
        expect(root.dataset.figaroDiagramHeight).toBe('240');
    });
});

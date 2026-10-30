import {
    authoringMacroCompletionPlan,
    authoringMacroInsertionPlan,
    basicMarkdownTable,
    emptyMermaidBlock,
} from '../../../frontend/js/core/authoringMacroModel.js';

describe('Figaro authoring macro plans', () => {
    test('matches macro prefixes only at whitespace-delimited authoring positions', () => {
        expect(authoringMacroCompletionPlan('@t').macros.map(macro => macro.name))
            .toEqual(['table', 'todo']);
        expect(authoringMacroCompletionPlan('Draft @mer').macros.map(macro => macro.name))
            .toEqual(['mermaid']);
        expect(authoringMacroCompletionPlan('Draft @da').macros.map(macro => macro.name))
            .toEqual(['date']);
        expect(authoringMacroCompletionPlan('name@date')).toBeNull();
        expect(authoringMacroCompletionPlan('@due')).toBeNull();
        expect(authoringMacroCompletionPlan('@unknown')).toBeNull();
    });

    test('@date delegates date selection instead of serializing a Markdown link itself', () => {
        expect(authoringMacroInsertionPlan('date', '@date', { from: 0, to: 5 })).toBeNull();
    });

    test('puts the task cursor immediately after the first unchecked item', () => {
        expect(authoringMacroInsertionPlan('todo', '@todo', { from: 0, to: 5 }))
            .toMatchObject({
                insert: '- [ ] ',
                cursorOffset: 6,
                targetOffset: 0,
                targetLength: 6,
            });
    });

    test('creates editor-ready table and Mermaid blocks with safe prose boundaries', () => {
        const table = authoringMacroInsertionPlan('table', 'Before @table After', { from: 7, to: 13 });
        expect(table.insert).toBe(`\n\n${basicMarkdownTable}\n\n`);
        expect({ from: table.from, to: table.to }).toEqual({ from: 6, to: 14 });
        expect(table.targetOffset).toBe(2);
        expect(table.targetLength).toBe(basicMarkdownTable.length);

        const mermaid = authoringMacroInsertionPlan('mermaid', '@mermaid', { from: 0, to: 8 });
        expect(mermaid.insert).toBe(emptyMermaidBlock);
        expect(mermaid.cursorOffset).toBe('```mermaid\n'.length);
        expect(mermaid.targetLength).toBe(emptyMermaidBlock.length);
    });

    test('inserts the sibling image reference of a named Draw.io or Excalidraw file', () => {
        expect(authoringMacroInsertionPlan('drawio', '@drawio', { from: 0, to: 7 }, {
            diagramName: 'diagram1',
        })).toMatchObject({
            insert: '![Diagram](./diagram1.drawio.svg)',
            cursorOffset: '![Diagram](./diagram1.drawio.svg)'.length,
        });
        expect(authoringMacroInsertionPlan('excalidraw', 'See @excalidraw', { from: 4, to: 15 }, {
            diagramName: 'whiteboard',
        })).toMatchObject({
            insert: '\n\n![Drawing](./whiteboard.excalidraw.svg)',
        });
        expect(authoringMacroInsertionPlan('excalidraw', '@excalidraw', { from: 0, to: 11 }, {
            diagramName: '../escape',
        })).toBeNull();
    });

    test('offers @excalidraw beside @drawio as diagram creators', () => {
        expect(authoringMacroCompletionPlan('@ex').macros).toEqual([
            expect.objectContaining({ name: 'excalidraw', action: 'diagram-create', kind: 'excalidraw' }),
        ]);
        expect(authoringMacroCompletionPlan('@dr').macros).toEqual([
            expect.objectContaining({ name: 'drawio', action: 'diagram-create', kind: 'drawio' }),
        ]);
    });
});

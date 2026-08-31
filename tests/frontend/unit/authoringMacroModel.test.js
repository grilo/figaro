import {
    authoringMacroCompletionPlan,
    authoringMacroInsertionPlan,
    basicMarkdownTable,
    defaultDrawioMacroName,
    drawioMacroFileName,
    drawioMacroMarkdown,
    drawioMacroNameError,
    emptyMermaidBlock,
} from '../../../frontend/js/core/authoringMacroModel.js';

describe('Figaro authoring macro plans', () => {
    test('matches macro prefixes only at whitespace-delimited authoring positions', () => {
        expect(authoringMacroCompletionPlan('@t').macros.map(macro => macro.name))
            .toEqual(['table', 'todo']);
        expect(authoringMacroCompletionPlan('Draft @mer').macros.map(macro => macro.name))
            .toEqual(['mermaid']);
        expect(authoringMacroCompletionPlan('name@due')).toBeNull();
        expect(authoringMacroCompletionPlan('@unknown')).toBeNull();
    });

    test('creates semantic due source and rejects invalid dates', () => {
        expect(authoringMacroInsertionPlan('due', '@due', { from: 0, to: 4 }, { date: '2026-08-30' }))
            .toMatchObject({
                insert: '[due 2026-08-30](2026-08-30.md)',
                cursorOffset: '[due 2026-08-30](2026-08-30.md)'.length,
            });
        expect(authoringMacroInsertionPlan('due', '@due', { from: 0, to: 4 }, { date: '2026-02-30' }))
            .toBeNull();
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

    test('normalizes safe Draw.io names and creates an encoded sibling image reference', () => {
        expect(defaultDrawioMacroName).toBe('diagram1');
        expect(drawioMacroFileName('system map')).toBe('system map.drawio.svg');
        expect(drawioMacroFileName('system.drawio')).toBe('system.drawio.svg');
        expect(drawioMacroFileName('system.drawio.svg')).toBe('system.drawio.svg');
        expect(drawioMacroMarkdown('system map')).toBe('![Diagram](./system%20map.drawio.svg)');
        expect(drawioMacroNameError('../system')).toMatch(/name, not a path/i);
        expect(drawioMacroNameError('.drawio.svg')).toMatch(/name before/i);
        expect(authoringMacroInsertionPlan('drawio', '@drawio', { from: 0, to: 7 }, {
            drawioName: 'diagram1',
        })).toMatchObject({
            insert: '![Diagram](./diagram1.drawio.svg)',
            cursorOffset: '![Diagram](./diagram1.drawio.svg)'.length,
        });
    });
});

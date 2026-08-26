import {
    applyMarkdownTableEditorAction,
    createMarkdownTableEditorState,
    markdownTableEditorActionState,
    markdownTableEditorSelectedCells,
    markdownTableEditorSelection,
    markdownTableMergePlans,
    markdownTableMetadataEnd,
    serializeMarkdownTableEditorState,
    stripMarkdownTableMergeMetadata,
    updateMarkdownTableEditorCell,
} from '../frontend/js/core/markdownTableEditorModel.js';

const source = [
    '| Name | Count |',
    '| :--- | ---: |',
    '| Alpha | 2 |',
    '| Beta | 10 |',
].join('\n');

describe('Markdown table editor draft model', () => {
    test('preserves untouched source and escapes a newly authored pipe', () => {
        const state = createMarkdownTableEditorState(source);
        expect(state.valid).toBe(true);
        expect(serializeMarkdownTableEditorState(state)).toBe(source);

        const changed = updateMarkdownTableEditorCell(state, 1, 0, 'Alpha | A');
        expect(serializeMarkdownTableEditorState(changed)).toBe(source.replace('Alpha', 'Alpha \\| A'));
        const multiline = updateMarkdownTableEditorCell(state, 1, 0, 'Alpha\nA');
        expect(serializeMarkdownTableEditorState(multiline)).toBe(source.replace('Alpha', 'Alpha<br>A'));
        expect(serializeMarkdownTableEditorState(state)).toBe(source);
    });

    test('keeps an ordinary focused cell out of range-selection mode', () => {
        const ordinary = markdownTableEditorSelection({ row: 1, col: 0 });
        expect(ordinary.rangeActive).toBe(false);
        expect(markdownTableEditorSelectedCells(ordinary)).toEqual([]);

        const held = markdownTableEditorSelection({ row: 1, col: 0 }, { row: 1, col: 0 }, true);
        expect(markdownTableEditorSelectedCells(held)).toEqual([{ row: 1, col: 0 }]);
    });

    test('merges content in reading order and restores exact cells when split in-session', () => {
        const state = createMarkdownTableEditorState(source);
        const selection = markdownTableEditorSelection(
            { row: 1, col: 0 },
            { row: 2, col: 1 },
            true,
        );
        const merged = applyMarkdownTableEditorAction(state, selection, 'merge');
        expect(merged).not.toBeNull();
        expect(serializeMarkdownTableEditorState(merged.state)).toContain(
            '| Alpha<br>2<br>Beta<br>10 | |',
        );
        expect(serializeMarkdownTableEditorState(merged.state)).toContain(
            '<!-- figaro:table-merge A2:B3 -->',
        );

        const split = applyMarkdownTableEditorAction(merged.state, merged.selection, 'split');
        expect(serializeMarkdownTableEditorState(split.state)).toBe(source);
    });

    test('reopened split keeps combined anchor text because the private cache is session-only', () => {
        const state = createMarkdownTableEditorState(source);
        const selection = markdownTableEditorSelection(
            { row: 1, col: 0 },
            { row: 1, col: 1 },
            true,
        );
        const mergedSource = serializeMarkdownTableEditorState(
            applyMarkdownTableEditorAction(state, selection, 'merge').state,
        );
        const reopened = createMarkdownTableEditorState(mergedSource);
        const split = applyMarkdownTableEditorAction(
            reopened,
            markdownTableEditorSelection({ row: 1, col: 0 }),
            'split',
        );
        expect(serializeMarkdownTableEditorState(split.state)).toContain('| Alpha<br>2 | |');
        expect(serializeMarkdownTableEditorState(split.state)).not.toContain('figaro:table-merge');
    });

    test('disables structural edits that cut a span and shifts spans outside it', () => {
        const merged = applyMarkdownTableEditorAction(
            createMarkdownTableEditorState(source),
            markdownTableEditorSelection({ row: 1, col: 0 }, { row: 2, col: 0 }, true),
            'merge',
        );
        const inside = markdownTableEditorSelection({ row: 1, col: 0 });
        expect(markdownTableEditorActionState(merged.state, inside, 'add-row-below')).toMatchObject({
            enabled: false,
        });
        expect(markdownTableEditorActionState(merged.state, inside, 'delete-row').reason)
            .toContain('Split');

        const before = markdownTableEditorSelection({ row: 0, col: 0 });
        const added = applyMarkdownTableEditorAction(merged.state, before, 'add-column-before');
        expect(serializeMarkdownTableEditorState(added.state)).toContain(
            '<!-- figaro:table-merge B2:B3 -->',
        );
    });

    test('adds and deletes ordinary rows and columns while retaining structural guards', () => {
        const state = createMarkdownTableEditorState(source);
        const alpha = markdownTableEditorSelection({ row: 1, col: 0 });
        const rowAdded = applyMarkdownTableEditorAction(state, alpha, 'add-row-above');
        expect(serializeMarkdownTableEditorState(rowAdded.state)).toContain('| | |\n| Alpha | 2 |');
        const rowDeleted = applyMarkdownTableEditorAction(rowAdded.state, rowAdded.selection, 'delete-row');
        expect(serializeMarkdownTableEditorState(rowDeleted.state)).toBe(source);

        const columnAdded = applyMarkdownTableEditorAction(state, alpha, 'add-column-after');
        expect(serializeMarkdownTableEditorState(columnAdded.state)).toContain('| Name | | Count |');
        const columnDeleted = applyMarkdownTableEditorAction(
            columnAdded.state,
            columnAdded.selection,
            'delete-column',
        );
        expect(serializeMarkdownTableEditorState(columnDeleted.state)).toBe(source);

        expect(markdownTableEditorActionState(
            state,
            markdownTableEditorSelection({ row: 0, col: 0 }),
            'delete-row',
        ).enabled).toBe(false);
        const oneColumn = createMarkdownTableEditorState('| Name |\n| --- |\n| Alpha |');
        expect(markdownTableEditorActionState(
            oneColumn,
            markdownTableEditorSelection({ row: 1, col: 0 }),
            'delete-column',
        ).enabled).toBe(false);
    });

    test('keeps merge metadata private to the renderer and locates adjacent source lines', () => {
        const markdown = `${source}\n<!-- figaro:table-merge A2:B3 -->\n\nAfter`;
        const tableTo = source.length;
        expect(markdownTableMetadataEnd(markdown, tableTo)).toBe(
            markdown.indexOf('\n\nAfter'),
        );
        expect(stripMarkdownTableMergeMetadata(markdown)).not.toContain('figaro:table-merge');
        expect(markdownTableMergePlans(markdown)[0]).toMatchObject([
            { fromRow: 1, fromCol: 0, toRow: 2, toCol: 1 },
        ]);

        const twoTables = `${source}\n\n${source}\n<!-- figaro:table-merge A2:B3 -->`;
        expect(markdownTableMergePlans(twoTables)).toHaveLength(2);
        expect(markdownTableMergePlans(twoTables)[0]).toEqual([]);
        expect(markdownTableMergePlans(twoTables)[1]).toHaveLength(1);
    });

    test('refuses invalid and overlapping metadata rather than overwriting it', () => {
        const invalid = `${source}\n<!-- figaro:table-merge A1:B2 -->`;
        expect(createMarkdownTableEditorState(invalid)).toMatchObject({ valid: false });

        const overlapping = [
            source,
            '<!-- figaro:table-merge A2:B3 -->',
            '<!-- figaro:table-merge B2:B3 -->',
        ].join('\n');
        expect(createMarkdownTableEditorState(overlapping)).toMatchObject({ valid: false });
    });
});

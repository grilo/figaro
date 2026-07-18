import { diffMarkdownLines, excerptMarkdownDiff, markdownLineKind, renderMarkdownDiff } from '../frontend/js/historyDiff.js';

describe('Markdown history diff', () => {
    test('preserves Markdown source structure while identifying additions and removals', () => {
        const diff = diffMarkdownLines(
            '# Current heading\n- current item\nshared line',
            '# Older heading\n- old item\nshared line'
        );

        expect(diff).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'added', kind: 'heading', text: '# Current heading' }),
            expect.objectContaining({ type: 'removed', kind: 'heading', text: '# Older heading' }),
            expect.objectContaining({ type: 'added', kind: 'list', text: '- current item' }),
            expect.objectContaining({ type: 'removed', kind: 'list', text: '- old item' }),
            expect.objectContaining({ type: 'context', text: 'shared line' }),
        ]));
    });

    test('renders escaped inline source and reports change counts', () => {
        const rendered = renderMarkdownDiff('## <new>', '## <old>');

        expect(rendered).toMatchObject({ added: 1, removed: 1 });
        expect(rendered.html).toContain('is-heading');
        expect(rendered.html).toContain('&lt;new&gt;');
        expect(markdownLineKind('```js')).toBe('code');
    });

    test('renders only changed hunks with two surrounding context lines', () => {
        const entries = diffMarkdownLines(
            'before one\nbefore two\nnew line\nafter one\nafter two\nfar current',
            'before one\nbefore two\nold line\nafter one\nafter two\nfar previous'
        );
        const excerpt = excerptMarkdownDiff(entries);

        expect(excerpt.map(entry => entry.text)).toEqual([
            'before one', 'before two', 'new line', 'old line', 'after one', 'after two', 'far current', 'far previous',
        ]);
        expect(excerpt.filter(entry => entry.type === 'added' || entry.type === 'removed')).toHaveLength(4);

        const rendered = renderMarkdownDiff(
            'first\nsecond\nthird\nfourth\nnew change\nsixth\nseventh\neighth\nninth\ntenth\neleventh\nnew tail',
            'first\nsecond\nthird\nfourth\nold change\nsixth\nseventh\neighth\nninth\ntenth\neleventh\nold tail'
        );
        expect(rendered.html).toContain('Unchanged lines omitted');
        expect(rendered.html).not.toContain('first</code>');
    });
});

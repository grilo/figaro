import docs from '../../../scripts/docs-stale.cjs';

describe('stale documentation search', () => {
    test('searches living documentation only', () => {
        expect(docs.isLivingDoc('docs/PROMPT.md')).toBe(true);
        expect(docs.isLivingDoc('README.md')).toBe(true);
        for (const path of ['CHANGELOG.md', 'docs/FEATURE_INDEX.md', 'docs/benchmarks/run.md',
            'docs/benchmarks/run.json', 'frontend/vendored/lib/README.md', 'tests/fixtures/a.md', 'src/app.js']) {
            expect(docs.isLivingDoc(path)).toBe(false);
        }
    });

    test('prints one short, located line per hit for any of the terms', () => {
        const long = `${'lead '.repeat(200)}the Old Name appears here${' tail'.repeat(200)}`;
        const hits = docs.staleDocHits([
            { path: 'docs/a.md', text: `intro\n${long}\nold name again` },
            { path: 'docs/b.md', text: 'uses the (legacy) path' },
            { path: 'CHANGELOG.md', text: 'old name in history' },
        ], ['old name', '(legacy)'], { width: 80 });
        expect(hits).toHaveLength(3);
        expect(hits[0]).toMatch(/^docs\/a\.md:2: ….*Old Name.*…$/u);
        expect(hits[0].length).toBeLessThan(110);
        expect(hits[1]).toBe('docs/a.md:3: old name again');
        expect(hits[2]).toBe('docs/b.md:1: uses the (legacy) path');
    });

    test('requires a term', () => {
        expect(() => docs.staleDocHits([], ['  '])).toThrow('at least one term');
    });
});

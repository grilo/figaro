import { analyzeWritingFull, createIncrementalWritingAnalyzer, createIncrementalWritingSource, prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';
import { createWritingParagraphChecks } from '../../../frontend/js/usecases/writingParagraphChecks.js';
import editorial from '../../fixtures/writing-editorial.json';

test('incremental writing checks exactly preserve full-scan evidence, native positions and fixes across the editorial corpus', async () => {
    const runtime = createIncrementalWritingAnalyzer();
    for (const { source } of editorial) expect(await runtime.analyze(source)).toEqual(await analyzeWritingFull(source));
});

test('a paragraph edit, prepend, move, deletion and split reuses unchanged writing checks with current source offsets', async () => {
    const runtime = createIncrementalWritingAnalyzer();
    const paragraphs = Array.from({ length: 80 }, (_, i) => `Section ${i}. We utilize text. The the example (is written in Javascript.`);
    const source = paragraphs.join('\n\n');
    expect(await runtime.analyze(source)).toEqual(await analyzeWritingFull(source));
    const cold = runtime.stats();
    const edit = source.replace('Section 40.', 'Section forty.');
    expect(await runtime.analyze(edit)).toEqual(await analyzeWritingFull(edit));
    expect(runtime.stats().retext.scans - cold.retext.scans).toBe(1);
    expect(runtime.stats().textlint.prose.scans - cold.textlint.prose.scans).toBe(1);
    const changed = runtime.stats();
    for (const next of [`A new opening.\n\n${edit}`, paragraphs.slice().reverse().join('\n\n'), paragraphs.slice(1).join('\n\n'), source.replace('We utilize text.', 'We utilize\n\ntext.')]) {
        expect(await runtime.analyze(next)).toEqual(await analyzeWritingFull(next));
    }
    expect(runtime.stats().retext.scans - changed.retext.scans).toBeLessThan(5);
});

test('incremental cache never hides changes to global conventions, acronym context, Markdown protection or reference syntax', async () => {
    const runtime = createIncrementalWritingAnalyzer();
    const sources = [
        'We use API. An email arrived.\n\nAn e-mail arrived. I can’t say.\n\n“Quoted.”\n\n"Other.”',
        'Application programming interface (API).\n\nWe use API. An email arrived.\n\nAn e-mail arrived. I can’t say.\n\n"Quoted."\n\n"Other.”',
        '---\ntitle: We utilize it\n---\n\nWe utilize **prose**.\n\n```md\nThe the text.\n```',
        '---\ntitle: We utilize it\n\nWe utilize **prose**.\n\n```md\nThe the text.\n```',
        'We utilize **prose**.\n\n```md\nThe the text.',
        'We utilize **prose**.\n\nThe the text.',
        '😀 We work in&#32;order to help.\r\n\r\nUse Javascript. [utilize][target]\n\n[target]: /destination',
        '😀 We work in order to help.\n\nUse Javascript. [utilize][target]\n\n[target]: /changed',
    ];
    for (const source of sources) expect(await runtime.analyze(source)).toEqual(await analyzeWritingFull(source));
});

test('cancelled incremental analysis retains completed paragraphs and retries without stale partial results', async () => {
    const runtime = createIncrementalWritingAnalyzer();
    let checkpoints = 0;
    const source = Array.from({ length: 150 }, (_, i) => `Paragraph ${i}. We utilize prose.`).join('\n\n');
    await expect(runtime.analyze(source, { checkpoint: async () => {
        if (++checkpoints === 3) throw new Error('cancelled');
    } })).rejects.toThrow('cancelled');
    const retained = runtime.stats().retext.scans;
    expect(retained).toBeGreaterThan(0);
    expect(await runtime.analyze(source)).toEqual(await analyzeWritingFull(source));
    expect(runtime.stats().retext.hits).toBeGreaterThanOrEqual(retained);
});

test('paragraph caches are bounded and never retain failed package work', async () => {
    const analyze = jest.fn(async text => { if (text === 'fail') throw new Error('failed'); return [text]; });
    const cache = createWritingParagraphChecks({ analyze, maximumEntries: 2, maximumWeight: 100 });
    await cache.check('one'); await cache.check('two'); await cache.check('three');
    expect(cache.stats().entries).toBe(2);
    await cache.check('one'); expect(analyze).toHaveBeenCalledTimes(4);
    await cache.check('x'.repeat(100)); expect(cache.stats().weight).toBeLessThanOrEqual(100);
    await expect(cache.check('fail')).rejects.toThrow('failed');
    await expect(cache.check('fail')).rejects.toThrow('failed');
    expect(analyze.mock.calls.filter(([text]) => text === 'fail')).toHaveLength(2);
});

test('paragraph retention covers a large note without exceeding the existing memory budget', async () => {
    const cache = createWritingParagraphChecks({ analyze: text => ({ length: text.length }) });
    const paragraphs = Array.from({ length: 4100 }, (_, index) => `Unique short paragraph ${index}.\n\n`);
    for (const paragraph of paragraphs) await cache.check(paragraph);
    const cold = cache.stats();
    for (const paragraph of paragraphs) await cache.check(paragraph);
    expect(cache.stats().scans).toBe(cold.scans);
    expect(cache.stats().entries).toBe(paragraphs.length);
    expect(cache.stats().weight).toBeLessThanOrEqual(4 * 1024 * 1024);
    const tiny = createWritingParagraphChecks({ analyze: text => ({ text }), maximumWeight: 1000 });
    for (const paragraph of paragraphs) await tiny.check(paragraph);
    expect(tiny.stats().weight).toBeLessThanOrEqual(1000);
    expect(tiny.stats().entries).toBeLessThan(paragraphs.length);
});


test('Markdown projection reuses untouched blocks and preserves exact Unicode, quote, entity and exclusion maps', () => {
    const runtime = createIncrementalWritingSource();
    const initial = '# A heading\n\n😀 Café **prose** with &amp; and \"quoted words\".\r\nA second line.\n\n- A list item.\n\n> Quoted block.\n\n```js\nconst value = 1;\n```\n\n[[Note|Visible words]] and [^marker].';
    expect(runtime.prepare(initial)).toEqual(prepareWritingSource(initial));
    const edited = initial.replace('Café', 'Cafeteria');
    expect(runtime.prepare(edited)).toEqual(prepareWritingSource(edited));
    expect(runtime.stats()).toMatchObject({ fullParses: 1, blockParses: 1, projectedBlocks: 7, reusedBlocks: 5 });
    const sourceMap = runtime.prepare(edited);
    const repeated = runtime.prepare(edited);
    expect(repeated).toEqual(sourceMap);
    expect(repeated.units[0]).toBe(sourceMap.units[0]);
    for (const source of [edited.replace('A heading', 'A useful heading'), edited.replace('second line', 'second\nsoft line'),
        edited.replace('Cafeteria', 'Cafeteria\n\nOther prose'), edited.replace('const value = 1', 'const value = 2'),
        `Inserted paragraph.\n\n${edited}`, initial]) {
        expect(runtime.prepare(source)).toEqual(prepareWritingSource(source));
    }
});

test('projection invalidates reference definitions and frontmatter while reusing exact maps through structural edits', () => {
    const runtime = createIncrementalWritingSource();
    const sources = [
        'A [label][ref] and ![photo][ref].\n\n[ref]: /one',
        'A [label][ref] and ![photo][ref].\n\n[other]: /one',
        'A [label][ref] and ![photo][ref].\n\n[ref]: /two',
        '---\ntitle: hidden\n---\n\nA paragraph.',
        '---\ntitle: hidden\n\nA paragraph.',
        'A first paragraph.\n\nA second paragraph.',
        'A first paragraph.\n\nNew paragraph.\n\nA second paragraph.',
        'A first paragraph.\n\nNew paragraph.\n\nA second paragraph.\n\n[^note]: Footnote prose.',
    ];
    for (const source of sources) expect(runtime.prepare(source)).toEqual(prepareWritingSource(source));
    expect(runtime.stats().reusedBlocks).toBeGreaterThan(1);
});

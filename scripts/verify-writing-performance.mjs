import { Worker } from 'node:worker_threads';
import { createWritingWorker } from '../frontend/js/writingWorkerClient.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TextlintKernel } from '@textlint/kernel';
import textPluginModule from '@textlint/textlint-plugin-text';
import unmatchedPair from '@textlint-rule/textlint-rule-no-unmatched-pair';
import { parse } from '@textlint/text-to-ast';
import { analyzeWritingFull as original } from '../frontend/js/writingRuntime.js';
import { analyzeWriting as bundled } from '../frontend/vendored/writing/runtime.js';
import { localParagraphRule } from '../frontend/js/writingParagraphRule.js';
import { writingSloplessCache } from '../frontend/js/writingSloplessCache.js';

// Compare the actual pinned implementations, including every field and UTF-16
// range. These checks are independent of the hand-curated editorial expectations.
const editorial = JSON.parse(await readFile(new URL('../tests/fixtures/writing-editorial.json', import.meta.url)));
const long = Array.from({ length: 650 }, (_, index) => `Section ${index}: The guide explains how to use GitHub. It might help readers.\n\n`).join('');
const probes = [...editorial.map(item => item.source),
    `${long}😀 We work in order to help. A example (has no closing mark.`,
    `${long}API means application programming interface. "Curly” and 'curly’.\n\nThe the team calls an application programming interface (API).`,
    '---\ntitle: (skip\n---\n\n# 😀 Example\n\nWe **utilize** this.\r\n\r\nA (broken\r\nparagraph.\n\n`(skip` [[(skip]] $x$\n\n> (skip\n\n```js\n(skip\n```',
];
for (const source of probes) assert.deepEqual(await bundled(source), await original(source));
const kernel = new TextlintKernel();
const options = rule => ({ ext: '.txt', plugins: [{ pluginId: 'text', plugin: textPluginModule.default ?? textPluginModule }], rules: [{ ruleId: 'pairs', rule }] });
const pairProbes = ['Simple (open.', '😀 A “quoted phrase”.\r\n\r\nA [broken bracket.', 'A (pair. Across sentences). Another (open.', 'A nested ([pair]).\n\nAn open (pair.\n\nA closed one.', `${long}Last (paragraph.`];
for (const source of pairProbes) {
    const upstream = await kernel.lintText(source, options(unmatchedPair));
    const local = await kernel.lintText(source, options(localParagraphRule(unmatchedPair)));
    assert.deepEqual(local.messages, upstream.messages);
}
// Assert the optimization's structural boundary, rather than a flaky stopwatch.
const paragraph = parse(`${long}Last (paragraph.`).children.filter(node => node.type === 'Paragraph').at(-1);
let observed;
const fake = context => ({ Paragraph(node) { observed = node; context.report(node, { index: 5 }); } });
let reported;
localParagraphRule(fake)({ Syntax: { Paragraph: 'Paragraph' }, RuleError: Error, report: (node, error) => { reported = { node, error }; } }).Paragraph(paragraph);
assert.equal(observed.range[0], 0); assert.equal(observed.loc.start.line, 1);
assert.equal(reported.node, paragraph); assert.equal(reported.error.index, 5);
// Production text remains confined to one analysis, including exceptional paths.
writingSloplessCache.clear();
// Execute the production worker entry through a minimal Node message adapter.
// This measures foreground event-loop availability, not browser input-to-paint.
const boot = `import { parentPort } from 'node:worker_threads';
    globalThis.self = { postMessage: value => parentPort.postMessage(value), addEventListener: (_, listener) => parentPort.on('message', data => listener({data})) };
    await import(${JSON.stringify(new URL('../frontend/js/writingWorker.js', import.meta.url).href)});`;
let workersCreated = 0;
const client = createWritingWorker({ cooperative: true, createWorker() {
    workersCreated++;
    const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(boot)));
    const adapter = { postMessage: value => worker.postMessage(value), terminate: () => void worker.terminate() };
    worker.on('message', data => adapter.onmessage?.({ data })); worker.on('error', error => adapter.onerror?.(error));
    return adapter;
} });
let ticks = 0, maximumGapMs = 0, previous = performance.now();
let interval;
try {
    await client.ready;
    interval = setInterval(() => { const now = performance.now(); maximumGapMs = Math.max(maximumGapMs, now - previous); previous = now; ticks++; }, 20);
    previous = performance.now();
    const result = await client.analyze(long.repeat(3) + 'Last paragraph.');
    assert.ok(result.projection.text.trimEnd().endsWith('Last paragraph.'));
    assert.ok(ticks > 1, 'foreground timers must continue during whole-note worker analysis');
    const cancelled = client.analyze(long.repeat(6));
    const rejection = assert.rejects(cancelled, /cancelled/);
    await new Promise(resolve => setTimeout(resolve, 50)); client.cancel(); await rejection;
    assert.ok((await client.analyze('Fresh note.')).projection.text.includes('Fresh note.'));
    assert.equal(workersCreated, 1, 'ordinary cancellation must retain the initialized prose worker');
} finally { clearInterval(interval); client.destroy(); }
console.log(JSON.stringify({ foregroundTimers: ticks, maximumForegroundGapMs: maximumGapMs, realWorkerCancellationAndRecovery: true, equivalentWritingProbes: probes.length, equivalentPunctuationProbes: pairProbes.length, paragraphOrigin: observed.range[0], pass: true }, null, 2));

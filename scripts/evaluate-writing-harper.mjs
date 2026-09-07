// Optional, isolated evaluation: pass an unpacked harper.js@2.7.0 directory.
// This package is deliberately separate from Figaro's production dependencies.
import { readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import assert from 'node:assert/strict';
import { prepareWritingSource } from '../frontend/vendored/writing/runtime.js';
import { mapWritingRange } from '../frontend/js/core/writingAnalysisModel.js';

if (!process.argv[2]) throw new Error('Pass the path to an isolated harper.js@2.7.0 installation.');
const directory = resolve(process.argv[2]);
const pkg = JSON.parse(readFileSync(join(directory, 'package.json')));
if (pkg.name !== 'harper.js' || pkg.version !== '2.7.0') throw new Error('Expected harper.js@2.7.0');
const started = performance.now();
const { LocalLinter, Dialect } = await import(pathToFileURL(join(directory, 'dist/index.js')));
const { binary } = await import(pathToFileURL(join(directory, 'dist/binary.js')));
const linter = new LocalLinter({ binary, dialect: Dialect.American });
try {
    await linter.setup();
    const setupMs = performance.now() - started;
    const config = await linter.getDefaultLintConfig();
    async function analyze(source) {
        const projection = prepareWritingSource(source);
        const start = performance.now();
        const grouped = await linter.organizedLints(projection.text, { language: 'plaintext', dedup: false });
        const lintMs = performance.now() - start;
        const findings = Object.entries(grouped).flatMap(([rule, lints]) => lints.map(lint => {
            const span = lint.span();
            // 2.7.0's JS span() exposes UTF-16, unlike the inner Rust span in
            // to_json(). The emoji probe verifies this boundary explicitly.
            const from = span.start, to = span.end;
            const actual = lint.get_problem_text();
            assert.equal(projection.text.slice(from, to), actual, `Harper range disagrees for ${rule}`);
            const range = mapWritingRange(projection, from, to);
            const suggestions = lint.suggestions().map(suggestion => {
                const result = { kind: suggestion.kind(), replacement: suggestion.get_replacement_text() };
                suggestion.free(); return result;
            });
            const result = { rule, actual, message: lint.message(), suggestions, projectedSpan: { from, to }, range,
                matchesProjection: projection.text.slice(from, to) === actual };
            span.free(); lint.free(); return result;
        }));
        return { lintMs, findings };
    }
    const fixtures = JSON.parse(readFileSync(new URL('../tests/fixtures/writing-editorial.json', import.meta.url)));
    const editorial = [];
    for (const fixture of fixtures.filter(item => !item.language || item.language.startsWith('en-'))) {
        editorial.push({ name: fixture.name, expectedFigaro: fixture.expected, ...await analyze(fixture.source) });
    }
    const probes = [];
    for (const source of [
        'She go to school every day.', 'She goes to school every day.',
        'These is useful examples.', 'These are useful examples.',
        '😀 This are wrong.', '😀 This is right.',
        '😀 She go to school every day.',
        'The work they had had was useful.', 'Use a "safe" example.',
        'We can resume work at the cafe.', 'The API returns a JSON response.',
        '---\ntext: She go to school.\n---\n> These is useful.\n\n`This are wrong` and $This are wrong$\n\n"She go to school."',
    ]) probes.push({ source, ...await analyze(source) });
    const measurements = [];
    const sentence = 'The report was written in order to help the team utilize ordinary words for readers.';
    for (const words of [1000, 10000]) {
        const source = Array(Math.ceil(words / sentence.split(' ').length)).fill(sentence).join('\n\n');
        const runs = [];
        for (let i = 0; i < 3; i++) {
            const result = await analyze(source);
            runs.push({ lintMs: result.lintMs, findings: result.findings.length });
        }
        measurements.push({ words, runs });
    }
    console.log(JSON.stringify({ package: pkg.name, version: pkg.version, license: pkg.license,
        node: process.version, cpu: cpus()[0]?.model, setupMs, ruleCount: Object.keys(config).length,
        binaryBytes: Object.fromEntries(['harper_wasm_bg.wasm', 'harper_wasm_slim_bg.wasm'].map(name => [name, statSync(join(directory, 'dist', name)).size])),
        editorial, probes, measurements }, null, 2));
} finally { await linter.dispose(); }

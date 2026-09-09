import { openNativeWritingProfile } from './writing-native-profile.mjs';
// Reproducible real-adapter editorial/latency report; no latency pass/fail threshold.
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { analyzeWriting } from '../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings, valeWritingObservations } from '../frontend/js/core/writingAnalysisModel.js';

const preferences = { lenses: ['plain', 'direct', 'repetition'], language: 'en-US' };
const samples = JSON.parse(readFileSync(new URL('../tests/fixtures/writing-editorial.json', import.meta.url)));
const engine = await openNativeWritingProfile();
try {
    const coldValeMs = engine.initializationMs;
    async function analyze(source) {
        const start = performance.now(), data = await analyzeWriting(source), parsed = performance.now();
        const raw = await engine.analyze(data.projection.text);
        const native = performance.now(), vale = valeWritingObservations(raw, data.projection);
        return { ...data, observations: [...data.observations, ...vale], workerRaw: data.observations.length, valeRaw: vale.length,
            times: { workerMs: parsed - start, valeMs: native - parsed } };
    }
    const editorial = [];
    for (const { name, source, lenses, language = 'en-US', expected } of samples) {
        const data = language.startsWith('en-') ? await analyze(source) : { observations: [], workerRaw: 0, valeRaw: 0 };
        const result = resolveWritingFindings({ source, ...data, preferences: { ...preferences, lenses } });
        const actual = result.groups.flatMap(group => group.findings.map(item => item.kind)).sort();
        editorial.push({ name, expected, actual, workerRaw: data.workerRaw, valeRaw: data.valeRaw, unified: result.count,
            suppressed: result.findings.filter(item => item.suppressed).length, pass: JSON.stringify(actual) === JSON.stringify(expected.slice().sort()) });
    }
    const measurements = [];
    const workloads = [
        { name: 'ordinary prose', sentence: 'The report was written in order to help the team utilize ordinary words for readers.' },
        { name: 'technical names and punctuation', sentence: 'The JavaScript guide (including examples) explains how to use GitHub with ordinary words for readers.' },
    ];
    for (const { name, sentence } of workloads) {
        for (const words of [1000, 10000]) {
            const source = Array.from({ length: Math.ceil(words / sentence.split(' ').length) }, () => sentence).join('\n\n');
            const runs = [];
            for (let i = 0; i < 3; i++) {
                const data = await analyze(source), start = performance.now();
                const result = resolveWritingFindings({ source, ...data, preferences });
                runs.push({ ...data.times, resolveMs: performance.now() - start, findings: result.count, workerRaw: data.workerRaw, valeRaw: data.valeRaw });
            }
            measurements.push({ workload: name, words, runs });
        }
    }
    if (process.argv.includes('--long')) {
        for (const words of [25000, 50000]) {
            const sentenceWords = 17;
            const source = Array.from({ length: Math.ceil(words / sentenceWords) }, (_, index) => `Section ${index}: The JavaScript guide (including examples) explains how to use GitHub with ordinary words for readers.`).join('\n\n');
            const runs = [];
            for (let i = 0; i < 3; i++) {
                const data = await analyze(source);
                runs.push({ ...data.times, workerRaw: data.workerRaw, valeRaw: data.valeRaw });
            }
            measurements.push({ workload: 'unique numbered technical paragraphs', words: source.split(/\s+/).length, sourceLength: source.length, runs });
        }
    }
    console.log(JSON.stringify({ node: process.version, cpu: cpus()[0]?.model, coldValeMs, editorial, measurements }, null, 2));
    if (editorial.some(item => !item.pass)) process.exitCode = 1;
} finally { await engine.close(); }

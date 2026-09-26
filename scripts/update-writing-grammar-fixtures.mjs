// Explicit maintenance tool: review the resulting fixture diff before accepting it.
import { readFile, writeFile } from 'node:fs/promises';
import { openNativeWritingProfile } from './writing-native-profile.mjs';
import { analyzeWriting } from '../frontend/vendored/writing/runtime.js';
const fixtures = JSON.parse(await readFile(new URL('../tests/fixtures/writing-grammar.json', import.meta.url), 'utf8'));
const target = new URL('../tests/fixtures/writing-grammar-native.json', import.meta.url);
const { probes } = JSON.parse(await readFile(target, 'utf8'));
const engine = await openNativeWritingProfile();
try {
    for (const sample of [...fixtures, ...probes]) {
        sample.projectionText = (await analyzeWriting(sample.source)).projection.text;
        sample.native = JSON.parse(await engine.analyze(sample.projectionText));
    }
    await writeFile(target, JSON.stringify({ generator: 'Production writing engine via scripts/writing-native-profile.mjs; curated Harper 0.1.0 + Figaro grammar 9', fixtures, probes }, null, 2) + '\n');
} finally { await engine.close(); }

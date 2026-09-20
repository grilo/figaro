// Whole-document inspection through the production JS, dictionary, Go and
// review adapters. Labels in the manifest are expectations, not engine output.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const sourceRoot = resolve(option('--source-root', repository));
const manifestPath = resolve(option('--manifest', `${repository}/tests/fixtures/writing-documents/manifest.json`));
const output = option('--output', '');
const moduleAt = path => import(pathToFileURL(`${sourceRoot}/${path}`));
const { analyzeWriting } = await moduleAt('frontend/vendored/writing/runtime.js');
const { writingSpellingObservations } = await moduleAt('frontend/js/spellcheck.js');
const { default: nspell } = await moduleAt('frontend/vendored/spellcheck/nspell.js');
const { resolveWritingReview } = await moduleAt('frontend/js/core/writingReviewWork.js');
const { writingEngineConfiguration, validateWritingFix } = await moduleAt('frontend/js/core/writingAnalysisModel.js');
const { writingChecks } = await moduleAt('frontend/js/core/writingLensesModel.js');
const { writingBulkAvailable, planWritingBulkFix } = await moduleAt('frontend/js/core/writingReviewModel.js');
const { openNativeWritingProfile } = await moduleAt('scripts/writing-native-profile.mjs');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const checkers = new Map();
async function checker(language) {
    if (!checkers.has(language)) {
        const [aff, dic] = await Promise.all(['aff', 'dic'].map(extension => readFile(`${sourceRoot}/frontend/vendored/spellcheck/${language}.${extension}`, 'utf8')));
        checkers.set(language, nspell({ aff, dic }));
    }
    return checkers.get(language);
}

function summarizeDocument({ document, source, projection, observations, spelling, valeOutput, job, result, elapsedMs }) {
    const visible = result.groups.flatMap(group => group.findings);
    const findings = visible.map((item, index) => ({ index, kind: item.kind, lens: item.lens, actual: item.actual, from: item.from, to: item.to,
        message: item.message, context: source.slice(Math.max(0, item.from - 90), Math.min(source.length, item.to + 90)),
        sources: item.sources, fixes: item.fixes.map(fix => ({ ...fix, valid: validateWritingFix(job, job, fix),
            contextAfter: source.slice(Math.max(0, fix.from - 90), fix.from) + fix.replacement + source.slice(fix.to, Math.min(source.length, fix.to + 90)) })) }));
    const errors = document.errors.map(expected => ({ ...expected,
        findings: findings.filter(item => item.from < expected.toUTF16 && item.to > expected.fromUTF16).map(item => item.index) }));
    const duplicateRanges = findings.filter((item, index) => findings.slice(0, index).some(other => other.from === item.from && other.to === item.to))
        .map(item => item.index);
    const bulk = result.cards.filter(writingBulkAvailable).map(card => ({ occurrences: card.findings.length,
        fixes: planWritingBulkFix({ groups: result.groups, analyzed: job }, card.findings[0].id, job) }));
    return { id: document.id, sha256: document.sha256, language: document.language,
        proseWords: projection.text.trim().split(/\s+/u).filter(word => /\p{L}/u.test(word)).length,
        elapsedMs, counts: { jsRaw: observations.length, spellingRaw: spelling.length,
            nativeRaw: Object.values(JSON.parse(valeOutput)).flat().length, visible: findings.length, cards: result.cards.length,
            suppressed: result.findings.filter(item => item.suppressed).length }, errors, duplicateRanges, bulk,
        controls: document.controls.map(context => ({ context, findings: findings.filter(item => {
            const from = source.indexOf(context); return item.from < from + context.length && item.to > from;
        }).map(item => item.index) })), findings };
}

const engine = await openNativeWritingProfile();
const documents = [];
try {
    for (const document of manifest.documents) {
        const source = await readFile(resolve(dirname(manifestPath), document.path), 'utf8');
        if (sha256(source) !== document.sha256) throw new Error(`Changed frozen document: ${document.id}`);
        if (document.licensePath && sha256(await readFile(resolve(dirname(manifestPath), document.licensePath))) !== document.licenseSHA256) {
            throw new Error(`Changed source license: ${document.id}`);
        }
        for (const expected of document.errors) {
            if (source.slice(expected.fromUTF16, expected.toUTF16) !== expected.actual) throw new Error(`Invalid annotation: ${document.id}/${expected.actual}`);
        }
        const started = performance.now();
        const { projection, observations } = await analyzeWriting(source);
        const spelling = await writingSpellingObservations(source, document.language, checker);
        const valeOutput = await engine.analyze(projection.text);
        const job = { id: document.id, source, language: document.language, preferences: { language: document.language, lenses: writingChecks.map(item => item.id) },
            spelling: { words: [], language: document.language }, decisions: [] };
        const { result } = resolveWritingReview({ job, projection, observations, spelling, valeOutput });
        documents.push(summarizeDocument({ document, source, projection, observations, spelling, valeOutput, job, result, elapsedMs: performance.now() - started }));
    }
} finally { await engine.close(); }
const report = JSON.stringify({ generated: new Date().toISOString(), sourceRoot, manifestSHA256: sha256(await readFile(manifestPath)),
    configuration: writingEngineConfiguration, annotationStatus: manifest.annotationStatus, documents }, null, 2) + '\n';
if (output) await writeFile(resolve(output), report);
else process.stdout.write(report);

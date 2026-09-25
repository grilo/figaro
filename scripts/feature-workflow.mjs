import { readFileSync, writeFileSync, statSync, mkdirSync, mkdtempSync, openSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import workflow from './feature-workflow.cjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, 'docs/FEATURE_INDEX.md');
const features = workflow.validateFeatureMap(JSON.parse(readFileSync(resolve(root, 'docs/feature-map.json'), 'utf8')));

function checkReferences(selected = features) {
    for (const feature of selected) {
        for (const ref of [...feature.sources, ...feature.docs, ...feature.tests, ...(feature.history || [])]) {
            const [file, anchor] = ref.split('#');
            if (!statSync(resolve(root, file)).isFile()) throw new Error(`Not a file: ${ref}`);
            if (anchor) {
                const headings = [...readFileSync(resolve(root, file), 'utf8').matchAll(/^#{1,6} (.+)$/gm)]
                    .map(match => match[1].toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-'));
                if (!headings.includes(anchor)) throw new Error(`Missing heading: ${ref}`);
            }
        }
        for (const [file, names] of Object.entries(feature.symbols || {})) {
            const declared = workflow.declaredSymbols(readFileSync(resolve(root, file), 'utf8'));
            for (const name of names) if (!declared.has(name)) throw new Error(`Missing source symbol: ${file} :: ${name}`);
        }
    }
}

function runFocused(selected) {
    if (readFileSync(indexPath, 'utf8') !== workflow.renderFeatureIndex(features)) {
        throw new Error('Feature index is stale. Run npm run context:generate.');
    }
    const logRoot = resolve(root, 'test-logs/focused');
    mkdirSync(logRoot, { recursive: true });
    const directory = mkdtempSync(resolve(logRoot, 'run-'));
    const logPath = resolve(directory, 'checks.log');
    const reportPath = resolve(directory, 'jest.json');
    const fd = openSync(logPath, 'w');
    let status = 0;
    try {
        for (const args of [
            ['scripts/test-integrity.mjs'],
            ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', ...workflow.focusedTests(selected), '--json', '--outputFile', reportPath],
        ]) {
            const result = spawnSync(process.execPath, args, { cwd: root, stdio: ['ignore', fd, fd] });
            status = result.status ?? 1;
            if (result.error) console.error(result.error.message);
            if (status) break;
        }
    } finally { closeSync(fd); }
    console.log(`${status ? 'FAIL' : 'PASS'}: ${selected.map(feature => feature.id).join(', ')}\nFull log: ${logPath}`);
    if (status) {
        let summary = '';
        try { summary = workflow.focusedFailureSummary(JSON.parse(readFileSync(reportPath, 'utf8'))); }
        catch { /* Integrity/setup failures may not produce a Jest report. */ }
        console.error(summary || readFileSync(logPath, 'utf8').slice(-6000));
    }
    else {
        const report = JSON.parse(readFileSync(reportPath, 'utf8'));
        console.log(`${report.numPassedTestSuites} suites, ${report.numPassedTests} tests passed; ${report.numPendingTests} skipped.`);
    }
    console.log(`Additional boundaries to assess:\n${selected.flatMap(feature => feature.extraChecks).map(check => `- ${check}`).join('\n')}`);
    process.exitCode = status;
}

try {
    const [command, ...args] = process.argv.slice(2);
    const history = args.includes('--history');
    const ids = args.filter(arg => arg !== '--history');
    if (command === 'generate' || command === 'check') {
        if (ids.length) throw new Error(`${command} takes no feature arguments`);
        checkReferences();
        const expected = workflow.renderFeatureIndex(features);
        if (command === 'generate') writeFileSync(indexPath, expected);
        else if (readFileSync(indexPath, 'utf8') !== expected) throw new Error('Feature index is stale. Run npm run context:generate.');
        console.log(`Feature index ${command === 'generate' ? 'generated' : 'verified'} (${features.length} routes).`);
    } else if (command === 'context') {
        if (!ids.length) console.log(workflow.renderContextList(features));
        else {
            const selected = workflow.selectFeatures(features, ids);
            checkReferences(selected);
            console.log(workflow.renderContext(selected, { history }));
        }
    } else if (command === 'test') {
        const selected = workflow.selectFeatures(features, ids);
        checkReferences();
        runFocused(selected);
    } else throw new Error('Expected context, generate, check, or test');
} catch (error) { console.error(error.message); process.exitCode = 1; }

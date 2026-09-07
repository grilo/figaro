import fs from 'node:fs';
import path from 'node:path';
import { BACKEND_METHODS } from '../../../frontend/js/backendContract.js';

const JS_ROOT = path.resolve('frontend/js');

function sourceFiles(directory, extension = '.js') {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const resolved = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(resolved, extension);
        return entry.isFile() && entry.name.endsWith(extension) ? [resolved] : [];
    });
}

function importsIn(source) {
    const specifiers = [];
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
        specifiers.push(match[1]);
    }
    for (const match of source.matchAll(/\bnew\s+Worker\(\s*['"]([^'"]+)['"]/g)) {
        specifiers.push(match[1]);
    }
    return specifiers;
}

function firstPartyImportGraph() {
    const files = sourceFiles(JS_ROOT).map(file => path.resolve(file));
    const fileSet = new Set(files);
    return new Map(files.map(file => {
        const imports = importsIn(fs.readFileSync(file, 'utf8'))
            .filter(specifier => specifier.startsWith('.') || specifier.startsWith('/js/'))
            .map(specifier => specifier.startsWith('/js/')
                ? path.join(JS_ROOT, specifier.slice('/js/'.length))
                : path.resolve(path.dirname(file), specifier))
            .map(imported => path.extname(imported) ? imported : `${imported}.js`)
            .filter(imported => fileSet.has(imported));
        return [file, imports];
    }));
}

function circularImportPaths(graph) {
    const visited = new Set();
    const visiting = new Set();
    const stack = [];
    const cycles = new Set();

    const visit = file => {
        if (visited.has(file)) return;
        visiting.add(file);
        stack.push(file);
        for (const imported of graph.get(file) || []) {
            if (visiting.has(imported)) {
                const cycleStart = stack.indexOf(imported);
                cycles.add([...stack.slice(cycleStart), imported]
                    .map(entry => path.relative(JS_ROOT, entry))
                    .join(' -> '));
            } else {
                visit(imported);
            }
        }
        stack.pop();
        visiting.delete(file);
        visited.add(file);
    };

    graph.keys().forEach(visit);
    return [...cycles].sort();
}

describe('frontend architecture policy', () => {
    test('pure core modules depend only on other core modules or pure packages', () => {
        const violations = [];
        for (const file of sourceFiles(path.join(JS_ROOT, 'core'))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const specifier of importsIn(source)) {
                if (specifier.startsWith('.') && !specifier.startsWith('./')) {
                    violations.push(`${path.relative(JS_ROOT, file)} -> ${specifier}`);
                }
            }
            for (const forbidden of [/\bwindow\./, /\bdocument\./, /\blocalStorage[.(]/, /\bsetTimeout\(/, /\bbackend\(/]) {
                if (forbidden.test(source)) {
                    violations.push(`${path.relative(JS_ROOT, file)} contains ${forbidden}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    test('application use cases import only sibling use cases, pure core policy, or packages', () => {
        const violations = [];
        for (const file of sourceFiles(path.join(JS_ROOT, 'usecases'))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const specifier of importsIn(source)) {
                if (specifier.startsWith('.')
                    && !specifier.startsWith('./')
                    && !specifier.startsWith('../core/')) {
                    violations.push(`${path.relative(JS_ROOT, file)} -> ${specifier}`);
                }
            }
            for (const forbidden of [/\bwindow\./, /\bdocument\./, /\blocalStorage[.(]/]) {
                if (forbidden.test(source)) {
                    violations.push(`${path.relative(JS_ROOT, file)} contains ${forbidden}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    test('workspace adapters do not mutate tab records owned by the tab manager', () => {
        const violations = sourceFiles(JS_ROOT)
            .filter(file => !file.endsWith(`${path.sep}tabManager.js`))
            .filter(file => !file.includes(`${path.sep}core${path.sep}`))
            .flatMap(file => {
                const source = fs.readFileSync(file, 'utf8');
                return [
                    ...source.matchAll(/\b(?:tab|activeTab|t|candidate)\.(?:_content|_editGeneration|_saveGeneration|_editorTextScale|cursorState|dirty|mtime|path|title)\s*=(?!=)/g),
                    ...source.matchAll(/delete\s+(?:tab|activeTab|t|candidate)\.(?:_content|_editGeneration|_saveGeneration|_editorTextScale|cursorState|dirty|mtime|path|title)\b/g),
                ]
                    .map(match => `${path.relative(JS_ROOT, file)}:${source.slice(0, match.index).split('\n').length}`);
            });
        expect(violations).toEqual([]);
    });

    test('browser dialogs and right-pane ownership are injected or coordinated centrally', () => {
        const violations = [];
        for (const file of sourceFiles(JS_ROOT)) {
            const source = fs.readFileSync(file, 'utf8');
            if (/window\.(?:confirmDialog|promptDialog)/.test(source)) {
                violations.push(`${path.relative(JS_ROOT, file)} uses a dialog global`);
            }
            if (/['"]close-(?:outline|history|pdf-preview|raw-text-preview)['"]/.test(source)) {
                violations.push(`${path.relative(JS_ROOT, file)} uses a peer-close event`);
            }
            if (/close-\$\{/.test(source)) {
                violations.push(`${path.relative(JS_ROOT, file)} uses a dynamic peer-close event`);
            }
        }
        expect(violations).toEqual([]);
    });

    test('the frontend backend contract matches every exported Go App method', () => {
        const desktopRoot = path.resolve('internal/desktop');
        const methodPattern = /^func\s+\(a\s+\*App\)\s+([A-Z][A-Za-z0-9_]*)\s*\(/gm;
        const exported = sourceFiles(desktopRoot, '.go')
            .flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(methodPattern)].map(match => match[1]))
            .filter((name, index, names) => names.indexOf(name) === index)
            .sort();

        expect([...BACKEND_METHODS].sort()).toEqual(exported);
    });

    test('bundled application code is never deferred behind a dynamic import', () => {
        const violations = sourceFiles(JS_ROOT)
            .filter(file => /\bimport\s*\(/.test(fs.readFileSync(file, 'utf8')))
            .map(file => path.relative(JS_ROOT, file));

        expect(violations).toEqual([]);
    });

    test('first-party modules form an acyclic dependency graph', () => {
        expect(circularImportPaths(firstPartyImportGraph())).toEqual([]);
    });

    test('the application composition root exclusively owns workspace assembly', () => {
        const graph = firstPartyImportGraph();
        const ownership = new Map([
            ['app.js', new Set(['bootstrap.js'])],
            ['tabManager.js', new Set(['app.js'])],
        ]);
        const violations = [];

        for (const [importer, imports] of graph) {
            const importerName = path.relative(JS_ROOT, importer);
            for (const imported of imports) {
                const importedName = path.relative(JS_ROOT, imported);
                const allowedImporters = ownership.get(importedName);
                if (allowedImporters && !allowedImporters.has(importerName)) {
                    violations.push(`${importerName} -> ${importedName}`);
                }
            }
        }

        expect(violations.sort()).toEqual([]);
    });

    test('first-party modules do not retain unused default-export wrapper objects', () => {
        const violations = sourceFiles(JS_ROOT)
            .filter(file => /\bexport\s+default\s*\{/.test(fs.readFileSync(file, 'utf8')))
            .map(file => path.relative(JS_ROOT, file));

        expect(violations).toEqual([]);
    });

    test('every first-party module is reachable from an application or renderer-build entry point', () => {
        const graph = firstPartyImportGraph();
        const files = [...graph.keys()];
        const reachable = new Set();
        const entries = [
            'bootstrap.js',
            'printMarkdownRenderer.js',
            'writingRuntime.js', // Eager worker runtime build entry (scripts/vendor-writing.mjs).
            'writingWorker.js', 'writingSpellingWorker.js', 'writingDecisionWorker.js', 'activityWorker.js', // Eager standalone worker build entries (scripts/build-app-bundle.mjs).
            'markdownItRuntime.js',
            'katexRuntime.js',
        ].map(file => path.join(JS_ROOT, file));

        const visit = file => {
            const resolvedFile = path.resolve(file);
            if (reachable.has(resolvedFile)) return;
            reachable.add(resolvedFile);
            for (const imported of graph.get(resolvedFile) || []) visit(imported);
        };

        entries.forEach(visit);
        expect(files
            .filter(file => !reachable.has(file))
            .map(file => path.relative(JS_ROOT, file))
            .sort())
            .toEqual([]);
    });
});

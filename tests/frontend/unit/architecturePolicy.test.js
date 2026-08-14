import fs from 'node:fs';
import path from 'node:path';

const JS_ROOT = path.resolve('frontend/js');

function sourceFiles(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const resolved = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(resolved);
        return entry.isFile() && entry.name.endsWith('.js') ? [resolved] : [];
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

describe('frontend architecture policy', () => {
    test('pure core modules depend only on other core modules or pure packages', () => {
        const violations = [];
        for (const file of sourceFiles(path.join(JS_ROOT, 'core'))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const specifier of importsIn(source)) {
                if (specifier.startsWith('../')) {
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

    test('application use cases do not import concrete frontend effects', () => {
        const violations = [];
        for (const file of sourceFiles(path.join(JS_ROOT, 'usecases'))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const specifier of importsIn(source)) {
                if (
                    specifier.includes('backend.js')
                    || specifier.includes('state.js')
                    || specifier.includes('app.js')
                    || specifier.includes('editor.js')
                ) {
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

    test('bundled application code is never deferred behind a dynamic import', () => {
        const violations = sourceFiles(JS_ROOT)
            .filter(file => /\bimport\s*\(/.test(fs.readFileSync(file, 'utf8')))
            .map(file => path.relative(JS_ROOT, file));

        expect(violations).toEqual([]);
    });

    test('every first-party module is reachable from an application or renderer-build entry point', () => {
        const files = sourceFiles(JS_ROOT).map(file => path.resolve(file));
        const fileSet = new Set(files);
        const reachable = new Set();
        const entries = [
            'bootstrap.js',
            'printMarkdownRenderer.js',
            'markdownItRuntime.js',
            'katexRuntime.js',
        ].map(file => path.join(JS_ROOT, file));

        const visit = file => {
            const resolvedFile = path.resolve(file);
            if (reachable.has(resolvedFile)) return;
            reachable.add(resolvedFile);
            const source = fs.readFileSync(resolvedFile, 'utf8');
            for (const specifier of importsIn(source)) {
                if (!specifier.startsWith('.') && !specifier.startsWith('/js/')) continue;
                const imported = specifier.startsWith('/js/')
                    ? path.join(JS_ROOT, specifier.slice('/js/'.length))
                    : path.resolve(path.dirname(resolvedFile), specifier);
                const candidate = path.extname(imported) ? imported : `${imported}.js`;
                if (fileSet.has(candidate)) visit(candidate);
            }
        };

        entries.forEach(visit);
        expect(files
            .filter(file => !reachable.has(file))
            .map(file => path.relative(JS_ROOT, file))
            .sort())
            .toEqual([]);
    });
});

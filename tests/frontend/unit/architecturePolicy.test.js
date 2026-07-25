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
});

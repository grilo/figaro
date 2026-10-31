import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    MAX_MERMAID_SOURCE_LENGTH,
    planMermaidSourceRender,
} from '../frontend/js/core/diagramSecurityModel.js';

function versionAtLeast(version, minimum) {
    const current = String(version || '').split('.').map(Number);
    const required = String(minimum || '').split('.').map(Number);
    for (let index = 0; index < Math.max(current.length, required.length); index += 1) {
        const left = current[index] || 0;
        const right = required[index] || 0;
        if (left !== right) return left > right;
    }
    return true;
}

function javascriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return javascriptFiles(target);
        return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
    });
}

describe('vendored browser security policy', () => {
    test('keeps a vulnerable embedded Mermaid YAML parser behind the pre-parse guard', () => {
        const bundle = fs.readFileSync(
            path.resolve('frontend/vendored/mermaid/mermaid.min.js'),
            'utf8'
        );
        const embeddedVersion = bundle.match(/js-yaml ([0-9]+\.[0-9]+\.[0-9]+)/)?.[1];
        expect(embeddedVersion).toBeTruthy();

        if (!versionAtLeast(embeddedVersion, '4.3.1')) {
            expect(MAX_MERMAID_SOURCE_LENGTH).toBeLessThanOrEqual(50_000);
            expect(planMermaidSourceRender('a'.repeat(50_001)).action).toBe('preserve-source');
            expect(planMermaidSourceRender('---\nconfig: !!omap\n---\ngraph TD').action)
                .toBe('preserve-source');
        }

        const mermaidRenderCallers = javascriptFiles(path.resolve('frontend/js'))
            .filter(file => /window\.mermaid\.render\s*\(/.test(fs.readFileSync(file, 'utf8')))
            .map(file => path.relative(path.resolve('frontend/js'), file));
        expect(mermaidRenderCallers).toEqual(['diagramRenderer.js']);
    });

    test('keeps the vendored Excalidraw editor offline and free of runtime imports', () => {
        const directory = path.resolve('frontend/vendored/excalidraw');
        const bundle = fs.readFileSync(path.join(directory, 'excalidraw.min.js'), 'utf8');
        // Excalidraw would otherwise retry missing fonts from esm.sh.
        expect(bundle).not.toMatch(/\.push\(new URL\(\w+,\w+\.ASSETS_FALLBACK_URL\)\)/);
        expect(bundle).not.toMatch(/\bimport\(/);
        // The bundle must be rebuilt (npm run vendor:excalidraw) whenever its entry changes.
        const entryHash = crypto.createHash('sha256')
            .update(fs.readFileSync(path.resolve('scripts/vendor/excalidraw-entry.js')))
            .digest('hex');
        expect(bundle.slice(0, 200)).toContain(`figaro-excalidraw-entry sha256:${entryHash}`);
        expect(fs.existsSync(path.join(directory, 'fonts/Excalifont'))).toBe(true);
        expect(fs.existsSync(path.join(directory, 'fonts/Xiaolai'))).toBe(false);
        expect(fs.readFileSync(path.join(directory, 'LICENSES.txt'), 'utf8')).toMatch(/^## @excalidraw\/excalidraw 0\.18\.1 \(MIT\)$/m);

        const index = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
        expect(index).toContain('window.EXCALIDRAW_ASSET_PATH = "/vendored/excalidraw/";');
        expect(index.indexOf('/vendored/excalidraw/excalidraw.min.js')).toBeLessThan(index.indexOf('/app.bundle.js'));
    });

    test('maps every CodeMirror and Lezer package the vendored modules import', () => {
        // Upstream splits packages (for example @codemirror/streamparser in
        // @codemirror/language 6.13); an unmapped import breaks the build.
        const index = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
        const maps = {
            source: JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports,
            production: JSON.parse(fs.readFileSync(path.resolve('frontend/vendored/importmap.json'), 'utf8')).imports,
        };
        const files = ['codemirror', 'lezer']
            .flatMap(directory => fs.readdirSync(path.resolve('frontend/vendored', directory), { recursive: true })
                .filter(file => file.endsWith('.js'))
                .map(file => path.resolve('frontend/vendored', directory, file)));
        const specifiers = new Set(files.flatMap(file => [...fs.readFileSync(file, 'utf8')
            .matchAll(/\bfrom\s*['"]((?:@codemirror|@lezer)\/[^'"]+)['"]/g)].map(match => match[1])));
        expect(specifiers.has('@codemirror/state')).toBe(true);
        const mapped = imports => specifier => specifier in imports
            || Object.keys(imports).some(prefix => prefix.endsWith('/') && specifier.startsWith(prefix));
        for (const [name, imports] of Object.entries(maps)) {
            expect([name, [...specifiers].filter(specifier => !mapped(imports)(specifier))]).toEqual([name, []]);
        }
    });

    test('maps every @replit package the vendored @replit modules import', () => {
        // @replit/codemirror-vim 6.4 moved its engine into @replit/codemirror-vim-core.
        // The production bundle maps @replit packages in build-app-bundle.mjs, and
        // Jest needs a mapping for any package without dist/index.js.
        const index = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
        const source = JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
        const bundleScript = fs.readFileSync(path.resolve('scripts/build-app-bundle.mjs'), 'utf8');
        const jestMapper = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).jest.moduleNameMapper;
        const root = path.resolve('frontend/vendored/@replit');
        const specifiers = new Set(fs.readdirSync(root, { recursive: true })
            .filter(file => file.endsWith('.js'))
            .flatMap(file => [...fs.readFileSync(path.join(root, file), 'utf8')
                .matchAll(/\bfrom\s*['"](@replit\/[^'"]+)['"]/g)].map(match => match[1])));
        expect(specifiers.has('@replit/codemirror-vim-core')).toBe(true);
        const resolvesInJest = specifier => Object.entries(jestMapper).some(([pattern, target]) => {
            const match = specifier.match(new RegExp(pattern));
            return match && fs.existsSync(target
                .replace('<rootDir>', process.cwd())
                .replace(/\$(\d)/g, (_, group) => match[Number(group)]));
        });
        for (const specifier of specifiers) {
            expect([specifier, 'source', specifier in source]).toEqual([specifier, 'source', true]);
            expect([specifier, 'production', bundleScript.includes(`'${specifier}':`)])
                .toEqual([specifier, 'production', true]);
            expect([specifier, 'jest', resolvesInJest(specifier)]).toEqual([specifier, 'jest', true]);
        }
    });
});

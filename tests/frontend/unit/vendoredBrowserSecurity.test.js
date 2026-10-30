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
});

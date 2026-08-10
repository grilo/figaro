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
});

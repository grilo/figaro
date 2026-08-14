import fs from 'node:fs';

const readPackageGraph = () => ({
    manifest: JSON.parse(fs.readFileSync('package.json', 'utf8')),
    lock: JSON.parse(fs.readFileSync('package-lock.json', 'utf8')),
});

describe('locked npm dependency policy', () => {
    test('contains no npm-deprecated packages and uses maintained userland punycode', () => {
        const { lock } = readPackageGraph();
        const packages = Object.entries(lock.packages || {});
        const deprecated = packages
            .filter(([, manifest]) => Boolean(manifest.deprecated))
            .map(([path, manifest]) => `${path}: ${manifest.deprecated}`);
        const punycode = packages
            .filter(([path]) => /(^|\/)node_modules\/punycode$/.test(path))
            .map(([, manifest]) => manifest.version);

        expect(deprecated).toEqual([]);
        expect(punycode.length).toBeGreaterThan(0);
        expect(punycode.every(version => Number.parseInt(version, 10) >= 2)).toBe(true);
    });

    test('locks the reviewed footnote and KaTeX renderer upgrades', () => {
        const { manifest, lock } = readPackageGraph();

        expect(manifest.dependencies['@mdit/plugin-footnote']).toBe('1.0.2');
        expect(lock.packages['node_modules/@mdit/plugin-footnote'].version).toBe('1.0.2');
        expect(manifest.dependencies.katex).toBe('^0.18.4');
        expect(lock.packages['node_modules/katex'].version).toBe('0.18.4');
    });

    test('keeps test-only browser tooling out of production dependencies and omits unused Babel helpers', () => {
        const { manifest, lock } = readPackageGraph();
        const colorVendorScript = fs.readFileSync('scripts/vendor-codemirror-color.mjs', 'utf8');

        expect(manifest.dependencies['@babel/runtime']).toBeUndefined();
        expect(lock.packages['node_modules/@babel/runtime']).toBeUndefined();
        expect(colorVendorScript).toContain('inlineColorExtensionBabelHelper');
        expect(manifest.dependencies.playwright).toBeUndefined();
        expect(manifest.devDependencies['@playwright/test']).toBeDefined();
        expect(lock.packages['node_modules/@playwright/test'].dependencies.playwright).toBe(
            lock.packages['node_modules/playwright'].version,
        );
    });

    test('inlines the color extension helper and rejects an unknown upstream artifact', async () => {
        const { inlineColorExtensionBabelHelper } = await import(
            '../../../scripts/vendor-codemirror-color-transform.js'
        );
        const source = [
            'import _objectWithoutPropertiesLoose from "@babel/runtime/helpers/objectWithoutPropertiesLoose";',
            'const value = _objectWithoutPropertiesLoose(source, ["hidden"]);',
        ].join('\n');

        const transformed = inlineColorExtensionBabelHelper(source);
        expect(transformed).not.toContain('@babel/runtime');
        expect(transformed).toContain('function _objectWithoutPropertiesLoose');
        expect(() => inlineColorExtensionBabelHelper('export const changed = true;'))
            .toThrow('expected one upstream match, found 0');
    });

    test('keeps Markdown-It within every bundled renderer package peer contract', () => {
        const { manifest, lock } = readPackageGraph();
        const rendererPackages = [
            '@mdit/helper',
            '@mdit/plugin-anchor',
            '@mdit/plugin-footnote',
            '@mdit/plugin-inline-rule',
            '@mdit/plugin-katex',
            '@mdit/plugin-mark',
            '@mdit/plugin-sub',
            '@mdit/plugin-sup',
            '@mdit/plugin-tasklist',
            '@mdit/plugin-tex',
        ];

        expect(manifest.dependencies['markdown-it']).toBe('^14.3.0');
        expect(lock.packages['node_modules/markdown-it'].version).toBe('14.3.0');
        expect(rendererPackages.map(name => lock.packages[`node_modules/${name}`].peerDependencies['markdown-it']))
            .toEqual(rendererPackages.map(() => '^14.2.0'));
    });
});

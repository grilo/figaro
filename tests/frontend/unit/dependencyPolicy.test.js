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

    test('locks the reviewed Markdown-It 15 footnote and KaTeX renderer upgrades', () => {
        const { manifest, lock } = readPackageGraph();

        expect(manifest.dependencies['@mdit/plugin-footnote']).toBe('1.1.0');
        expect(lock.packages['node_modules/@mdit/plugin-footnote'].version).toBe('1.1.0');
        expect(manifest.dependencies.katex).toBe('^0.18.4');
        expect(lock.packages['node_modules/katex'].version).toBe('0.18.4');
    });

    test('locks Babel 8 and matches its exact Node prerequisite', () => {
        const { manifest, lock } = readPackageGraph();
        const babelCore = lock.packages['node_modules/@babel/core'];
        const babelPresetEnv = lock.packages['node_modules/@babel/preset-env'];
        const jestSyntaxPreset = lock.packages['node_modules/babel-preset-current-node-syntax'];

        expect(manifest.engines.node).toBe('^22.18.0 || >=24.11.0');
        expect(lock.packages[''].engines.node).toBe(manifest.engines.node);
        expect(manifest.devDependencies['@babel/core']).toBe('^8.0.1');
        expect(manifest.devDependencies['@babel/preset-env']).toBe('^8.0.2');
        expect(manifest.devDependencies['babel-preset-current-node-syntax'])
            .toBe('file:tools/babel-preset-current-node-syntax');
        expect(babelCore.version).toBe('8.0.1');
        expect(babelPresetEnv.version).toBe('8.0.2');
        expect(babelCore.engines.node).toBe(manifest.engines.node);
        expect(babelPresetEnv.engines.node).toBe(manifest.engines.node);
        expect(babelPresetEnv.peerDependencies['@babel/core']).toBe('^8.0.0');
        expect(fs.readFileSync('.npmrc', 'utf8').trim()).toBe('install-links=true');
        expect(fs.readFileSync('scripts/prepare-frontend.sh', 'utf8'))
            .toContain('cksum .npmrc package.json package-lock.json');
        expect(jestSyntaxPreset.version).toBe('1.2.0');
        expect(jestSyntaxPreset.resolved).toBe('file:tools/babel-preset-current-node-syntax');
        expect(jestSyntaxPreset.dependencies['@babel/core']).toBe('7.29.7');
        expect(lock.packages['node_modules/babel-preset-current-node-syntax/node_modules/@babel/core'].version)
            .toBe('7.29.7');
        expect(fs.readFileSync('tools/babel-preset-current-node-syntax/LICENSE', 'utf8'))
            .toContain('MIT License');
    });

    test('keeps the Jest syntax compatibility preset inert when Babel 8 loads it', async () => {
        const { default: currentNodeSyntax } = await import('babel-preset-current-node-syntax');

        expect(currentNodeSyntax({ version: '8.0.1' })).toEqual({ plugins: [] });
        expect(currentNodeSyntax({ version: '7.29.7' }).plugins.length).toBeGreaterThan(0);
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
        const browserRuntime = fs.readFileSync('frontend/vendored/markdown-it/index.js', 'utf8');
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

        expect(manifest.dependencies['markdown-it']).toBe('^15.0.0');
        expect(lock.packages['node_modules/markdown-it'].version).toBe('15.0.0');
        expect(browserRuntime).toContain('Figaro vendored markdown-it 15.0.0 browser runtime');
        expect(browserRuntime).not.toContain('markdown-it 14.3.0');
        expect(rendererPackages.map(name => lock.packages[`node_modules/${name}`].peerDependencies['markdown-it']))
            .toEqual(rendererPackages.map(() => '^15.0.0'));
    });

    test('locks and vendors the reviewed browser-only rich-paste converter', () => {
        const { manifest, lock } = readPackageGraph();
        const vendored = fs.readFileSync('frontend/vendored/turndown/index.js', 'utf8');

        expect(manifest.dependencies.turndown).toBe('7.2.4');
        expect(lock.packages['node_modules/turndown'].version).toBe('7.2.4');
        expect(vendored).toContain('export { TurndownService as default }');
        expect(vendored).not.toContain('@mixmark-io/domino');
        expect(Buffer.byteLength(vendored)).toBeLessThan(35_000);
        expect(fs.readFileSync('frontend/vendored/turndown/LICENSE', 'utf8')).toContain('MIT License');
    });
});

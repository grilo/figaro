/**
 * Bundle Figaro's selected Markdown-It plugins into a local browser module.
 *
 * The generated artifact is ignored under frontend/vendored. Desktop builds
 * embed it after local preparation, so production never fetches renderer code
 * from a CDN. Licenses and exact package versions are emitted beside it.
 */
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(root, 'frontend/vendored/markdown-it-plugins');
const packageLock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const packages = [
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

async function packageMetadata(name) {
    const packageDirectory = resolve(root, 'node_modules', name);
    const metadata = JSON.parse(await readFile(resolve(packageDirectory, 'package.json'), 'utf8'));
    return {
        name,
        version: metadata.version,
        license: metadata.license || 'See package license file',
        homepage: metadata.homepage || '',
        integrity: packageLock.packages?.[`node_modules/${name}`]?.integrity || null,
        packageDirectory,
    };
}

async function syncKatexRuntime(katex) {
    const sourceDirectory = katex.packageDirectory;
    const sourceDist = resolve(sourceDirectory, 'dist');
    const targetDirectory = resolve(root, 'frontend/vendored/katex');
    const targetDist = resolve(targetDirectory, 'dist');

    // Figaro loads KaTeX as a browser global. Keep only the runtime JS, CSS,
    // and every font referenced by the upstream CSS; source, tests, CLI, and
    // upstream build tooling (including Python helpers) do not ship.
    await rm(targetDirectory, { recursive: true, force: true });
    await mkdir(targetDist, { recursive: true });
    await Promise.all([
        copyFile(resolve(sourceDirectory, 'LICENSE'), resolve(targetDirectory, 'LICENSE')),
        copyFile(resolve(sourceDist, 'katex.min.js'), resolve(targetDist, 'katex.min.js')),
        copyFile(resolve(sourceDist, 'katex.min.css'), resolve(targetDist, 'katex.min.css')),
        cp(resolve(sourceDist, 'fonts'), resolve(targetDist, 'fonts'), { recursive: true }),
    ]);

    const manifest = {
        generatedBy: 'scripts/vendor-markdown-renderer.mjs',
        source: {
            name: katex.name,
            version: katex.version,
            license: katex.license,
            homepage: katex.homepage,
            integrity: katex.integrity,
        },
        runtimeAssets: [
            'LICENSE',
            'dist/katex.min.js',
            'dist/katex.min.css',
            'dist/fonts/*',
        ],
    };
    await writeFile(resolve(targetDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

await mkdir(outputDirectory, { recursive: true });
const [metadata, katexMetadata] = await Promise.all([
    Promise.all(packages.map(packageMetadata)),
    packageMetadata('katex'),
]);
await syncKatexRuntime(katexMetadata);

await build({
    entryPoints: [resolve(root, 'frontend/js/printMarkdownRenderer.js')],
    outfile: resolve(outputDirectory, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    legalComments: 'linked',
    banner: {
        js: '/* Figaro vendored Markdown-It plugin bundle. See manifest.json and LICENSES.md. */',
    },
    alias: {
        'markdown-it': resolve(root, 'frontend/js/markdownItRuntime.js'),
        'katex': resolve(root, 'frontend/js/katexRuntime.js'),
    },
});

const manifest = {
    generatedBy: 'scripts/vendor-markdown-renderer.mjs',
    runtimeDependencies: {
        'markdown-it': 'frontend/vendored/markdown-it/index.js',
        katex: 'frontend/vendored/katex/dist/katex.min.js',
    },
    packages: metadata.map(({ packageDirectory, ...entry }) => entry),
};
await writeFile(resolve(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const licenseText = ['# Vendored Markdown-It plugin licenses', ''];
for (const entry of metadata) {
    const outputName = entry.name.replaceAll('/', '__') + '.LICENSE';
    const source = resolve(entry.packageDirectory, 'LICENSE');
    await copyFile(source, resolve(outputDirectory, outputName));
    licenseText.push(`- [${entry.name} ${entry.version}](./${outputName}) — ${entry.license}`);
}
await writeFile(resolve(outputDirectory, 'LICENSES.md'), licenseText.join('\n') + '\n');

console.log(`Vendored ${metadata.length} Markdown-It plugin packages to ${outputDirectory}`);
console.log(`Vendored KaTeX ${katexMetadata.version} browser runtime assets`);

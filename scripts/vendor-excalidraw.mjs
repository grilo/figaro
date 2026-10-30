// Builds frontend/vendored/excalidraw from pinned npm packages.
//
//   npm run vendor:excalidraw
//
// Installs the pinned packages into node_modules/.cache (on disk, ignored by
// Git), or uses EXCALIDRAW_NODE_MODULES when set. The output is one
// self-contained IIFE exposing window.FigaroExcalidraw (no code splitting, so
// no runtime import() of chunks), the package stylesheet, the self-hosted
// Latin fonts, and the licences of everything bundled.
//
// Non-English locales and Mermaid-to-Excalidraw are stubbed out: Figaro is
// English-only and renders Mermaid itself. The Chinese/Japanese/Korean
// handwriting font (Xiaolai, 13 MB) is not shipped, and Excalidraw's esm.sh
// font fallback is removed so a missing font never becomes a network request.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const versions = {
    '@excalidraw/excalidraw': '0.18.1',
    react: '19.1.1',
    'react-dom': '19.1.1',
};
const skippedFonts = new Set(['Xiaolai']);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'scripts/vendor/excalidraw-entry.js');
// Recorded in the bundle so a unit test catches an entry edited without rebuilding.
const entryHash = createHash('sha256').update(readFileSync(entry)).digest('hex');
const out = resolve(root, 'frontend/vendored/excalidraw');
const nodeModules = process.env.EXCALIDRAW_NODE_MODULES || installPinnedPackages();
const packageDist = join(nodeModules, '@excalidraw/excalidraw/dist/prod');

function installPinnedPackages() {
    const dir = resolve(root, 'node_modules/.cache/figaro-excalidraw-vendor');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name: 'figaro-excalidraw-vendor',
        private: true,
        dependencies: versions,
        // tslib@2.9.1 was briefly unavailable from the registry; 2.8.1 satisfies every range.
        overrides: { tslib: '2.8.1' },
    }, null, 2));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--omit=dev'], { cwd: dir, stdio: 'inherit' });
    return join(dir, 'node_modules');
}

for (const [name, version] of Object.entries(versions)) {
    const installed = JSON.parse(readFileSync(join(nodeModules, name, 'package.json'), 'utf8')).version;
    if (installed !== version) throw new Error(`${name} ${installed} is installed; expected ${version}`);
}

// Excalidraw tries each font URL in turn and finally esm.sh. Drop that last
// entry; fail the build if upstream changes shape so it cannot slip back in.
const remoteFontFallback = /return (\w+)\.push\(new URL\((\w+),(\w+)\.ASSETS_FALLBACK_URL\)\),\1\}/;
let removedRemoteFallbacks = 0;

const figaroPlugin = {
    name: 'figaro-excalidraw',
    setup(builder) {
        builder.onResolve({ filter: /^@excalidraw\/mermaid-to-excalidraw$/ }, () => ({ path: 'mermaid', namespace: 'stub' }));
        builder.onResolve({ filter: /^\.\/locales\// }, args => (
            /\/en-[A-Z0-9]+\.js$/.test(args.path) ? null : { path: 'locale', namespace: 'stub' }
        ));
        builder.onLoad({ filter: /^mermaid$/, namespace: 'stub' }, () => ({
            contents: 'export async function parseMermaidToExcalidraw() { throw new Error("Mermaid conversion is not available in Figaro"); }',
        }));
        builder.onLoad({ filter: /^locale$/, namespace: 'stub' }, () => ({ contents: 'export default {};' }));
        builder.onLoad({ filter: /@excalidraw[\\/]excalidraw[\\/]dist[\\/]prod[\\/]chunk-[^\\/]+\.js$/ }, args => {
            const source = readFileSync(args.path, 'utf8');
            if (!source.includes('ASSETS_FALLBACK_URL)')) return null;
            removedRemoteFallbacks += 1;
            return { contents: source.replace(remoteFontFallback, 'return $1}'), loader: 'js' };
        });
    },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await build({
    entryPoints: [entry],
    outfile: join(out, 'excalidraw.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'FigaroExcalidraw',
    platform: 'browser',
    target: 'es2020',
    nodePaths: [nodeModules],
    conditions: ['production'],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    legalComments: 'none',
    banner: { js: `/* figaro-excalidraw-entry sha256:${entryHash} */` },
    logLevel: 'warning',
    metafile: true,
    plugins: [figaroPlugin],
});

const bundle = readFileSync(join(out, 'excalidraw.min.js'), 'utf8');
if (removedRemoteFallbacks !== 1 || bundle.includes('ASSETS_FALLBACK_URL)),')) {
    throw new Error('Could not remove Excalidraw\'s remote font fallback; review vendor-excalidraw.mjs for this version');
}
if (/\bimport\(/.test(bundle)) throw new Error('The Excalidraw bundle still contains a runtime import()');

cpSync(join(packageDist, 'index.css'), join(out, 'excalidraw.css'));
for (const font of readdirSync(join(packageDist, 'fonts'))) {
    if (skippedFonts.has(font)) continue;
    cpSync(join(packageDist, 'fonts', font), join(out, 'fonts', font), { recursive: true });
}

writeFileSync(join(out, 'LICENSES.txt'), bundledLicences(result.metafile));

function bundledLicences(metafile) {
    const packages = new Map();
    for (const input of Object.keys(metafile.inputs)) {
        const match = resolve(root, input).match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/g);
        if (!match) continue;
        const name = match.at(-1).replace(/^node_modules[\\/]/, '').replaceAll('\\', '/');
        const dir = resolve(root, input).slice(0, resolve(root, input).lastIndexOf(match.at(-1)) + match.at(-1).length);
        packages.set(name, dir);
    }
    const sections = [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => {
        const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        const licenceFile = readdirSync(dir).find(file => /^(licen[cs]e|copying)(\.|$)/i.test(file));
        const text = licenceFile ? readFileSync(join(dir, licenceFile), 'utf8').trim() : `License: ${meta.license}`;
        return `## ${name} ${meta.version} (${meta.license})\n\n${text}\n`;
    });
    return [
        'Licences of the packages bundled into excalidraw.min.js and excalidraw.css.',
        'The fonts under fonts/ are distributed with @excalidraw/excalidraw: Excalifont,',
        'Virgil, Nunito, Lilita One, Assistant, Liberation Sans and Cascadia Code under',
        'the SIL Open Font License 1.1, and Comic Shanns under the MIT License.',
        '',
        ...sections,
    ].join('\n');
}

function size(path) {
    const stat = statSync(path);
    if (!stat.isDirectory()) return stat.size;
    return readdirSync(path).reduce((total, entry) => total + size(join(path, entry)), 0);
}
const kib = bytes => `${(bytes / 1024).toFixed(0)} KiB`;
console.log(`${relative(root, out)}: excalidraw.min.js ${kib(size(join(out, 'excalidraw.min.js')))}, `
    + `excalidraw.css ${kib(size(join(out, 'excalidraw.css')))}, fonts ${kib(size(join(out, 'fonts')))}`);
if (!existsSync(join(out, 'fonts/Excalifont'))) throw new Error('Excalifont was not copied');

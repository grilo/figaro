// Builds frontend/vendored/excalidraw from an installed @excalidraw/excalidraw.
//
//   EXCALIDRAW_NODE_MODULES=/path/to/node_modules node scripts/vendor-excalidraw.mjs [--with-cjk]
//
// The output is one self-contained IIFE (no code splitting, so no runtime
// import() of chunks), the package stylesheet, and the self-hosted fonts.
// Non-English locales and Mermaid-to-Excalidraw are stubbed out: Figaro is
// English-only and already renders Mermaid itself.
import { cpSync, mkdirSync, rmSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = process.env.EXCALIDRAW_NODE_MODULES;
if (!nodeModules) throw new Error('Set EXCALIDRAW_NODE_MODULES to a node_modules with @excalidraw/excalidraw, react and react-dom');
const withCJK = process.argv.includes('--with-cjk');
const packageDist = join(nodeModules, '@excalidraw/excalidraw/dist/prod');
const out = resolve(root, 'frontend/vendored/excalidraw');

const stubPlugin = {
    name: 'figaro-excalidraw-stubs',
    setup(builder) {
        builder.onResolve({ filter: /^@excalidraw\/mermaid-to-excalidraw$/ }, () => ({ path: 'mermaid', namespace: 'stub' }));
        builder.onResolve({ filter: /^\.\/locales\// }, args => (
            /\/en-[A-Z0-9]+\.js$/.test(args.path) ? null : { path: 'locale', namespace: 'stub' }
        ));
        builder.onLoad({ filter: /^mermaid$/, namespace: 'stub' }, () => ({
            contents: 'export async function parseMermaidToExcalidraw() { throw new Error("Mermaid conversion is not available in Figaro"); }',
        }));
        builder.onLoad({ filter: /^locale$/, namespace: 'stub' }, () => ({ contents: 'export default {};' }));
    },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
    entryPoints: [resolve(root, 'scripts/vendor/excalidraw-entry.js')],
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
    logLevel: 'warning',
    plugins: [stubPlugin],
});

cpSync(join(packageDist, 'index.css'), join(out, 'excalidraw.css'));
for (const font of readdirSync(join(packageDist, 'fonts'))) {
    if (font === 'Xiaolai' && !withCJK) continue;
    cpSync(join(packageDist, 'fonts', font), join(out, 'fonts', font), { recursive: true });
}

function size(path) {
    const stat = statSync(path);
    if (!stat.isDirectory()) return stat.size;
    return readdirSync(path).reduce((total, entry) => total + size(join(path, entry)), 0);
}
const kib = bytes => `${(bytes / 1024).toFixed(0)} KiB`;
console.log(`excalidraw.min.js ${kib(size(join(out, 'excalidraw.min.js')))}`);
console.log(`excalidraw.css    ${kib(size(join(out, 'excalidraw.css')))}`);
console.log(`fonts/            ${kib(size(join(out, 'fonts')))}${withCJK ? ' (with CJK)' : ''}`);

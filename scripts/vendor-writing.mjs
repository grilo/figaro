import { build } from 'esbuild';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('frontend/vendored/writing', { recursive: true });
// Reuse the bundled English dictionary's lowercase headwords for ordinary
// capitals; uppercase acronym/name entries must not exempt unknown acronyms.
const words = [...new Set((await readFile('node_modules/dictionary-en/index.dic', 'utf8')).split('\n')
    .map(line => line.split('/')[0]).filter(word => /^[a-z]{3,5}$/.test(word)))].sort();
await writeFile('frontend/vendored/writing/words.js', `export const ordinaryWritingWords = new Set(${JSON.stringify(words)});\n`);
// Terminology accepts explicit arrays, but also imports Node-only file loaders.
// Disable those optional effects in the browser; accidental file/default loading
// must fail loudly. Restrict disabled filesystem effects to this dependency.
// Keep the upstream tokenizer byte-for-byte; memoize its result through a
// bounded Figaro adapter. Fail closed if an upgrade changes this seam.
const sloplessTokenCache = {
    name: 'slopless-token-cache',
    setup(builder) {
        builder.onLoad({ filter: /slopless[\\/]dist[\\/]shared[\\/]text[\\/]tokens\.js$/ }, async args => {
            const source = await readFile(args.path, 'utf8');
            const signature = 'export function wordTokens(text) {';
            if (source.split(signature).length !== 2) throw new Error('Review the Slopless tokenizer adapter after upgrading.');
            return { contents: `import { writingSloplessCache } from ${JSON.stringify(resolve('frontend/js/writingSloplessCache.js'))};\n`
                + source.replace(signature, 'function uncachedWordTokens(text) {')
                + '\nexport function wordTokens(text) { return writingSloplessCache.tokens(text, uncachedWordTokens); }', loader: 'js' };
        });
    },
};
const terminologyFilesDisabled = {
    name: 'terminology-files-disabled',
    setup(builder) {
        builder.onResolve({ filter: /^node:(fs|module)$/ }, args => {
            if (args.importer !== resolve('node_modules/textlint-rule-terminology/out/index.js')) return null;
            return { path: args.path, namespace: 'terminology-files-disabled' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'terminology-files-disabled' }, () => ({
            contents: 'function unavailable() { throw new Error("Terminology file loading is disabled; use the bundled reviewed terms."); } export const createRequire = unavailable; export default { readFileSync: unavailable };',
            loader: 'js',
        }));
    },
};
await build({ entryPoints: ['frontend/js/writingRuntime.js'], outfile: 'frontend/vendored/writing/runtime.js', bundle: true, alias: {
    'decode-named-character-reference': resolve('node_modules/decode-named-character-reference/index.js'),
    'node:assert': resolve('node_modules/assert/build/assert.js'),
}, inject: ['scripts/writing-process-shim.js'], define: { 'import.meta.url': '"figaro:bundled-writing"' },
// The only import.meta URL belongs to the disabled terminology file loader;
// use an inert URL so the identical browser artifact also runs in adapter tests.
format: 'esm', platform: 'browser', target: 'es2020', legalComments: 'eof', plugins: [terminologyFilesDisabled, sloplessTokenCache] });
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [];
for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || entry.dev) continue;
    for (const name of ['license', 'LICENSE', 'LICENSE.md', 'license.md', 'LICENSE-MIT']) {
        try { notices.push(`${path} ${entry.version}\n${await readFile(`${path}/${name}`, 'utf8')}`); break; } catch { /* Other conventional license spelling. */ }
    }
}
await writeFile('frontend/vendored/writing/NOTICES.txt', notices.join('\n\n'));

import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { inlineColorExtensionBabelHelper } from './vendor-codemirror-color-transform.js';

const root = process.cwd();
const entry = path.join(
    root,
    'node_modules/@uiw/codemirror-extensions-color/esm/index.js',
);
const outfile = path.join(
    root,
    'frontend/vendored/@uiw/codemirror-extensions-color/index.js',
);

await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    external: ['@codemirror/*', '@lezer/*'],
    outfile,
    plugins: [{
        name: 'figaro-color-extension-runtime-removal',
        setup(buildContext) {
            buildContext.onLoad({
                filter: /codemirror-extensions-color[\\/]esm[\\/]index\.js$/,
            }, async args => ({
                contents: inlineColorExtensionBabelHelper(await fs.readFile(args.path, 'utf8')),
                loader: 'js',
                resolveDir: path.dirname(args.path),
            }));
        },
    }],
});

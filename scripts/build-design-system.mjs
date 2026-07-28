import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
    designSystemBundleOptions,
    designSystemBundlePath,
} from './designSystemBundle.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = designSystemBundlePath(root);
const checkOnly = process.argv.includes('--check');

const result = await build(designSystemBundleOptions(root));
const generated = result.outputFiles[0].text;

if (checkOnly) {
    const current = await readFile(outputPath, 'utf8').catch(() => '');
    if (current !== generated) {
        throw new Error('frontend/design-system/catalog.bundle.js is out of date; run npm run build:design-system');
    }
} else {
    await writeFile(outputPath, generated);
    console.log(`Built ${outputPath}`);
}

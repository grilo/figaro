import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'frontend/vendored/turndown');

mkdirSync(output, { recursive: true });
copyFileSync(
    resolve(root, 'node_modules/turndown/lib/turndown.browser.es.js'),
    resolve(output, 'index.js'),
);
copyFileSync(
    resolve(root, 'node_modules/turndown/LICENSE'),
    resolve(output, 'LICENSE'),
);

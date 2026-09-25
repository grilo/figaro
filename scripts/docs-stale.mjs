import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import docs from './docs-stale.cjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'], { cwd: root, encoding: 'utf8' });
if (listed.status !== 0) {
    console.error(listed.stderr || 'git ls-files failed');
    process.exit(1);
}
try {
    const files = listed.stdout.split('\n').filter(docs.isLivingDoc)
        .map(path => ({ path, text: readFileSync(resolve(root, path), 'utf8') }));
    const hits = docs.staleDocHits(files, process.argv.slice(2));
    console.log(hits.length ? hits.join('\n') : 'No matches in living documentation.');
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

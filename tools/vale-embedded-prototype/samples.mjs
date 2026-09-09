// Send the same production prose projection to both engines, never whole Markdown.
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeWriting } from '../../frontend/vendored/writing/runtime.js';
const root = new URL('../../', import.meta.url);
const samples = [];
for (const file of ['tests/fixtures/writing-editorial.json', 'tests/fixtures/writing-package-review.json']) {
    for (const [index, sample] of JSON.parse(readFileSync(new URL(file, root))).entries()) {
        samples.push({ name: `${file}:${index}:${sample.name || sample.rule}`, source: sample.source });
    }
}
for (const file of ['README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/PROMPT.md']) {
    samples.push({ name: file, source: readFileSync(new URL(file, root), 'utf8') });
}
for (const words of [1000, 10000, 50000]) {
    samples.push({ name: `synthetic/${words}-words`, source: Array.from({ length: Math.ceil(words/18) }, (_, i) => `Section ${i}: The report was written in order to help the team utilize clear language for their readers.`).join('\n\n') });
}
samples.push({ name: 'unicode-crlf', source: 'Café 😀: “The report was written in order to help.”\r\n\r\nThe advisor met the adviser. API.' });
for (const sample of samples) {
    const data = await analyzeWriting(sample.source);
    sample.source = data.projection.text;
}
writeFileSync(process.argv[2], JSON.stringify(samples));
console.error(`Prepared ${samples.length} projected documents and fixtures.`);

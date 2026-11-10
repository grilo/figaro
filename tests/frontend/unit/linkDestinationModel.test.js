import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isExternalLinkDestination, OPAQUE_URL_SCHEMES } from '../../../frontend/js/core/linkDestinationModel.js';

describe('isExternalLinkDestination', () => {
    test.each([
        'https://example.com', 'HTTP://example.com', 'obsidian://open?vault=x', '//cdn.example.com/a.png',
        '#heading', 'mailto:me@example.com', 'MAILTO:me@example.com', 'tel:+351', 'data:image/png;base64,AA',
        'javascript:alert(1)', 'blob:abc', 'file:/etc/passwd',
    ])('%s leaves the vault', value => {
        expect(isExternalLinkDestination(value)).toBe(true);
    });

    test.each([
        'Re: plan.md', 'Re:%20plan.md', 'v1.2:notes.md', 'a: note.md', 'Meeting: Q3.md', '1:1 Alice.md',
        'notes/plan.md', '/Archive/x.md', './sibling.md', '../other.md', '', 'chart.png',
    ])('%s is a vault path', value => {
        expect(isExternalLinkDestination(value)).toBe(false);
    });

    test('lists the same authority-less schemes as the Go link rewriter', () => {
        const source = readFileSync(path.join(process.cwd(), 'internal/links/rewrite.go'), 'utf8');
        const block = source.slice(source.indexOf('var opaqueURLSchemes'));
        const goSchemes = [...block.slice(0, block.indexOf('\n}')).matchAll(/"([^"]+)":\s*\{\}/g)].map(match => match[1]);
        expect(goSchemes.length).toBeGreaterThan(10);
        expect([...OPAQUE_URL_SCHEMES].sort()).toEqual(goSchemes.sort());
    });
});

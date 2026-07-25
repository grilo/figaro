import fs from 'node:fs';
import path from 'node:path';

describe('Markdown cheatsheet', () => {
    test('lists every supported admonition marker and its quoted body syntax', () => {
        const source = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
        const template = document.createElement('template');
        template.innerHTML = source;

        const popup = template.content.querySelector('#md-cheatsheet-popup');
        const admonitionRow = popup.querySelector('.md-cheatsheet-admonition-row');
        const blockquoteRow = Array.from(popup.querySelectorAll('tr'))
            .find(row => row.cells[1]?.textContent.trim() === 'Blockquote');

        expect(blockquoteRow.cells[0].textContent.trim()).toBe('> quote');
        expect(Array.from(admonitionRow.querySelectorAll('code'), code => code.textContent.trim()))
            .toEqual([
                '> [!note]',
                '> [!warning]',
                '> [!info]',
                '> [!tip]',
                '> [!danger]',
                '> [!example]',
                '> Body text',
            ]);
        expect(admonitionRow.cells[1].textContent.trim()).toBe('Admonitions / Callouts');
    });
});

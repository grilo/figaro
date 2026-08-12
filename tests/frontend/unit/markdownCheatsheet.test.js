import fs from 'node:fs';
import path from 'node:path';

describe('Markdown cheatsheet', () => {
    function loadDocument() {
        const source = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
        const template = document.createElement('template');
        template.innerHTML = source;
        return template.content;
    }

    function loadPopup() {
        return loadDocument().querySelector('#md-cheatsheet-popup');
    }

    test('lives immediately before Settings and starts outside the keyboard order', () => {
        const content = loadDocument();
        const trigger = content.querySelector('#md-cheatsheet-trigger');
        const popup = content.querySelector('#md-cheatsheet-popup');
        const settings = content.querySelector('#topbar-settings');

        expect(trigger.tagName).toBe('BUTTON');
        expect(trigger.textContent.trim()).toBe('?');
        expect(trigger.closest('.top-bar-right')).not.toBeNull();
        expect(trigger.closest('.md-cheatsheet-wrapper').nextElementSibling).toBe(settings);
        expect(popup.hidden).toBe(true);
    });

    test('lists every supported admonition marker and its quoted body syntax', () => {
        const popup = loadPopup();
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

    test('shows the portable task due-date Markdown immediately after task syntax', () => {
        const popup = loadPopup();
        const rows = Array.from(popup.querySelectorAll('tr'));
        const taskIndex = rows.findIndex(row => row.cells[1]?.textContent.trim() === 'Task / Checkbox');
        const dueRow = popup.querySelector('.md-cheatsheet-task-due-row');

        expect(rows.indexOf(dueRow)).toBe(taskIndex + 1);
        expect(dueRow.querySelector('code').textContent.trim())
            .toBe('- [ ] task #todo [due 2026-08-14](2026-08-14.md)');
        expect(dueRow.cells[1].textContent.trim()).toBe('Task due date');
    });
});

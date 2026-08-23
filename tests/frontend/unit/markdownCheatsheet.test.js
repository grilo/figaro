import fs from 'node:fs';
import path from 'node:path';
import { dateShortcuts } from '../frontend/js/dateShortcutCompletions.js';
import { initHelpPopup } from '../frontend/js/helpPopup.js';
import { normalizedKanbanColumns } from '../frontend/js/core/taskDueDateCompletionModel.js';

describe('Markdown and macros help', () => {
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
        expect(trigger.title).toBe('Markdown and macros');
        expect(trigger.getAttribute('aria-label')).toBe('Open Markdown and macros help');
        expect(trigger.closest('.top-bar-right')).not.toBeNull();
        expect(trigger.closest('.md-cheatsheet-wrapper').nextElementSibling).toBe(settings);
        expect(popup.hidden).toBe(true);
    });

    test('starts on a labelled Markdown pseudo-tab with Macros out of the tab order', () => {
        const popup = loadPopup();
        const tabs = [...popup.querySelectorAll('[role="tab"]')];
        const panels = [...popup.querySelectorAll('[role="tabpanel"]')];

        expect(popup.getAttribute('aria-label')).toBe('Markdown and macros help');
        expect(tabs.map(tab => tab.textContent.trim())).toEqual(['Markdown', 'Macros']);
        expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
        expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1]);
        expect(panels.map(panel => panel.hidden)).toEqual([false, true]);
        expect(panels.map(panel => panel.tabIndex)).toEqual([-1, -1]);
        expect(tabs.every(tab => tab.classList.contains('ui-button'))).toBe(true);
        expect(tabs[0].classList.contains('ui-button--accent')).toBe(true);
    });

    test('uses one spacious, scroll-contained viewport for both help topics', () => {
        const styles = fs.readFileSync(path.resolve('frontend/styles/status-tools.css'), 'utf8');

        expect(styles).toMatch(/\.md-cheatsheet-popup\s*\{[^}]*width:\s*min\(620px, calc\(100vw - 24px\)\)/s);
        expect(styles).toMatch(/\.md-cheatsheet-popup\s*\{[^}]*height:\s*min\(540px, calc\(100vh - 56px\)\)/s);
        expect(styles).toMatch(/\.md-cheatsheet-popup\.open\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
        expect(styles).toMatch(/\.md-cheatsheet-panel\s*\{[^}]*flex:\s*1 1 auto[^}]*overflow-y:\s*auto[^}]*scrollbar-gutter:\s*stable/s);
    });

    test('lists every supported admonition marker and its quoted body syntax', () => {
        const markdown = loadPopup().querySelector('#md-help-markdown-panel');
        const admonitionRow = markdown.querySelector('.md-cheatsheet-admonition-row');
        const blockquoteRow = Array.from(markdown.querySelectorAll('tr'))
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

    test('keeps Markdown syntax separate from every supported Figaro macro family', () => {
        const popup = loadPopup();
        const markdown = popup.querySelector('#md-help-markdown-panel');
        const macros = popup.querySelector('#md-help-macros-panel');

        expect(markdown.textContent).not.toContain('@today');
        expect(markdown.textContent).not.toContain('#todo');
        expect(markdown.textContent).not.toContain('[due ');
        expect([...macros.querySelectorAll('.md-macro-date-shortcuts-row code')]
            .map(code => code.textContent.trim()))
            .toEqual(dateShortcuts.map(shortcut => `@${shortcut.label}`));
        expect(macros.querySelector('.md-macro-date-link-row code').textContent.trim())
            .toBe('[YYYY-MM-DD](YYYY-MM-DD.md)');
        expect([...macros.querySelectorAll('.md-macro-kanban-row code')]
            .map(code => code.textContent.trim()))
            .toEqual(normalizedKanbanColumns(['custom-column']).map(column => `#${column}`));
        expect(macros.querySelector('.md-macro-due-row code').textContent.trim())
            .toBe('Text #tag [due YYYY-MM-DD](YYYY-MM-DD.md)');
        expect(macros.querySelector('.md-macro-due-actions-row').textContent)
            .toMatch(/#tag.*Press Space.*Add due date….*Due today.*Due tomorrow/);
    });

    test('switches topics by click and arrow key while preserving popup focus behavior', async () => {
        const wrapper = loadDocument().querySelector('.md-cheatsheet-wrapper');
        document.body.innerHTML = wrapper.outerHTML;
        initHelpPopup();

        const trigger = document.getElementById('md-cheatsheet-trigger');
        const popup = document.getElementById('md-cheatsheet-popup');
        const markdownTab = document.getElementById('md-help-markdown-tab');
        const macrosTab = document.getElementById('md-help-macros-tab');
        const markdownPanel = document.getElementById('md-help-markdown-panel');
        const macrosPanel = document.getElementById('md-help-macros-panel');

        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.activeElement).toBe(markdownTab);
        macrosTab.click();
        expect(macrosTab.getAttribute('aria-selected')).toBe('true');
        expect(macrosTab.tabIndex).toBe(0);
        expect(macrosTab.classList.contains('ui-button--accent')).toBe(true);
        expect(markdownPanel.hidden).toBe(true);
        expect(macrosPanel.hidden).toBe(false);

        macrosTab.focus();
        macrosTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowLeft', bubbles: true, cancelable: true,
        }));
        expect(document.activeElement).toBe(markdownTab);
        expect(markdownTab.getAttribute('aria-selected')).toBe('true');
        expect(markdownPanel.hidden).toBe(false);
        expect(macrosPanel.hidden).toBe(true);

        markdownTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'End', bubbles: true, cancelable: true,
        }));
        expect(document.activeElement).toBe(macrosTab);
        macrosTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Home', bubbles: true, cancelable: true,
        }));
        expect(document.activeElement).toBe(markdownTab);

        markdownTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'End', bubbles: true, cancelable: true,
        }));
        macrosTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true, cancelable: true,
        }));
        expect(popup.hidden).toBe(true);
        expect(document.activeElement).toBe(trigger);

        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.activeElement).toBe(macrosTab);
        expect(macrosPanel.hidden).toBe(false);
    });
});

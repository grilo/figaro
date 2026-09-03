import fs from 'node:fs';
import path from 'node:path';
import { dateShortcuts } from '../frontend/js/dateShortcutCompletions.js';
import { authoringMacros } from '../frontend/js/core/authoringMacroModel.js';
import { initHelpPopup } from '../frontend/js/helpPopup.js';
import { normalizedKanbanColumns } from '../frontend/js/core/taskDueDateCompletionModel.js';

describe('Figaro help', () => {
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
        expect(trigger.title).toBe('Figaro help (F1)');
        expect(trigger.getAttribute('aria-label')).toBe('Open Figaro help');
        expect(trigger.closest('.top-bar-right')).not.toBeNull();
        expect(trigger.closest('.md-cheatsheet-wrapper').nextElementSibling).toBe(settings);
        expect(popup.hidden).toBe(true);
    });

    test('starts on Markdown with Macros and Shortcuts out of the tab order', () => {
        const popup = loadPopup();
        const tabs = [...popup.querySelectorAll('[role="tab"]')];
        const panels = [...popup.querySelectorAll('[role="tabpanel"]')];

        expect(popup.getAttribute('aria-label')).toBe('Figaro help');
        expect(tabs.map(tab => tab.textContent.trim())).toEqual(['Markdown', 'Macros', 'Shortcuts']);
        expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
        expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1, -1]);
        expect(panels.map(panel => panel.hidden)).toEqual([false, true, true]);
        expect(panels.map(panel => panel.tabIndex)).toEqual([-1, -1, -1]);
        expect(tabs.every(tab => tab.classList.contains('ui-button'))).toBe(true);
        expect(tabs[0].classList.contains('ui-button--accent')).toBe(true);
        const search = popup.querySelector('#md-help-search');
        expect(search.getAttribute('role')).toBe('combobox');
        expect(search.getAttribute('aria-controls')).toBe('md-help-search-results');
        expect(search.getAttribute('aria-label')).toBe('Search help and settings');
    });

    test('uses one spacious, scroll-contained viewport for every help topic', () => {
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
        expect([...macros.querySelectorAll('.md-macro-authoring-row code')]
            .map(code => code.textContent.trim()))
            .toEqual(authoringMacros.map(macro => `@${macro.name}`));
        expect(macros.querySelector('.md-macro-authoring-row').textContent)
            .toMatch(/@date.*private metadata/);
        expect([...macros.querySelectorAll('.md-macro-authoring-row')].map(row => row.textContent))
            .toEqual(expect.arrayContaining([
                expect.stringMatching(/@table.*Table Editor/),
                expect.stringMatching(/@todo.*unchecked task-list item/),
                expect.stringMatching(/@mermaid.*Mermaid Editor/),
                expect.stringMatching(/@drawio.*sibling diagram.*Draw.io Editor/),
            ]));
        expect([...macros.querySelectorAll('.md-macro-kanban-row code')]
            .map(code => code.textContent.trim()))
            .toEqual(normalizedKanbanColumns(['custom-column']).map(column => `#${column}`));
        expect(macros.querySelector('.md-macro-due-row code').textContent.trim())
            .toBe('Task #todo @date');
        expect(macros.querySelector('.md-macro-due-actions-row').textContent)
            .toMatch(/D.*focused Kanban card.*due date.*Escape cancels/);
        expect(macros.querySelector('.md-macro-task-actions-row').textContent)
            .toMatch(/- \[ \] Task.*left Kanban and Calendar actions.*column tag or due-date link.*single tag\/date/i);
    });

    test('lists the global and editor shortcuts, including the F1 toggle', () => {
        const shortcuts = loadPopup().querySelector('#md-help-shortcuts-panel');
        const rows = [...shortcuts.querySelectorAll('tr')].map(row => [
            row.cells[0].textContent.replace(/\s+/g, ' ').trim(),
            row.cells[1].textContent.trim(),
        ]);

        expect(rows).toEqual(expect.arrayContaining([
            ['F1', 'Toggle Figaro help'],
            ['Ctrl/Cmd+N', 'Quick note in Inbox'],
            ['Ctrl/Cmd+Shift+N', 'New daily note'],
            ['Ctrl/Cmd+Shift+F', 'Focus global search'],
            ['Ctrl/Cmd+Shift+B', 'Toggle sidebar'],
            ['Ctrl+PageUp Ctrl+PageDown', 'Previous / next open buffer'],
            ['Ctrl/Cmd+F', 'Find and replace in current file'],
            ['Ctrl/Cmd+S', 'Save current file'],
            ['Ctrl/Cmd+W', 'Close current buffer'],
            ['Escape then Tab / Shift+Tab', 'Move focus out of the editor'],
            ['Ctrl/Cmd+B', 'Bold'],
            ['Ctrl/Cmd+I', 'Italic'],
            ['Ctrl/Cmd+K', 'Link'],
            ['Ctrl/Cmd+Shift+X', 'Strikethrough'],
            ['Ctrl/Cmd+`', 'Inline code'],
        ]));
    });

    test('switches topics by click and arrow key while preserving popup focus behavior', async () => {
        const wrapper = loadDocument().querySelector('.md-cheatsheet-wrapper');
        document.body.innerHTML = wrapper.outerHTML;
        initHelpPopup();

        const trigger = document.getElementById('md-cheatsheet-trigger');
        const popup = document.getElementById('md-cheatsheet-popup');
        const markdownTab = document.getElementById('md-help-markdown-tab');
        const macrosTab = document.getElementById('md-help-macros-tab');
        const shortcutsTab = document.getElementById('md-help-shortcuts-tab');
        const markdownPanel = document.getElementById('md-help-markdown-panel');
        const macrosPanel = document.getElementById('md-help-macros-panel');
        const shortcutsPanel = document.getElementById('md-help-shortcuts-panel');

        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const search = document.getElementById('md-help-search');
        expect(document.activeElement).toBe(search);
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
        expect(document.activeElement).toBe(shortcutsTab);
        shortcutsTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Home', bubbles: true, cancelable: true,
        }));
        expect(document.activeElement).toBe(markdownTab);

        markdownTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'End', bubbles: true, cancelable: true,
        }));
        expect(shortcutsPanel.hidden).toBe(false);
        shortcutsTab.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true, cancelable: true,
        }));
        expect(popup.hidden).toBe(true);
        expect(document.activeElement).toBe(trigger);

        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.activeElement).toBe(search);
        expect(shortcutsPanel.hidden).toBe(false);

        const invoker = document.createElement('button');
        invoker.textContent = 'Editor surrogate';
        document.body.appendChild(invoker);
        invoker.focus();
        expect(popup.hidden).toBe(true);
        expect(document.activeElement).toBe(invoker);

        invoker.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'F1', bubbles: true, cancelable: true,
        }));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(popup.hidden).toBe(false);
        expect(document.activeElement).toBe(search);
        search.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'F1', bubbles: true, cancelable: true,
        }));
        expect(popup.hidden).toBe(true);
        expect(document.activeElement).toBe(invoker);
    });

    test('keeps pointer-selected Help results open and deep-links Settings without executing commands', async () => {
        const wrapper = loadDocument().querySelector('.md-cheatsheet-wrapper');
        document.body.innerHTML = wrapper.outerHTML;
        initHelpPopup();
        const requestedSettings = jest.fn();
        document.addEventListener('figaro:open-settings-target', requestedSettings, { once: true });

        document.getElementById('md-cheatsheet-trigger').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const search = document.getElementById('md-help-search');
        const results = document.getElementById('md-help-search-results');

        search.value = 'bold';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(results.hidden).toBe(false);
        expect(results.textContent).toContain('Emphasis');
        expect(results.textContent).toContain('Help · Markdown');
        const helpResult = results.querySelector('[data-result-index="0"]');
        const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
        helpResult.dispatchEvent(pointerDown);
        expect(pointerDown.defaultPrevented).toBe(true);
        helpResult.click();
        expect(document.getElementById('md-cheatsheet-popup').hidden).toBe(false);
        expect(document.getElementById('md-help-markdown-panel').hidden).toBe(false);
        expect(document.querySelector('.md-help-search-target').textContent).toContain('bold');

        search.focus();
        search.value = 'vim';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(results.textContent).toContain('Settings · Editor');
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

        expect(requestedSettings).toHaveBeenCalledTimes(1);
        expect(requestedSettings.mock.calls[0][0].detail).toEqual({ selector: '#vim-toggle' });
        expect(document.getElementById('md-cheatsheet-popup').hidden).toBe(true);
    });
});

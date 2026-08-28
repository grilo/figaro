import fs from 'node:fs';
import path from 'node:path';
import { pureEditingChromeModel } from '../frontend/js/core/pureEditingChromeModel.js';
import {
    initPureEditingChrome,
    initPureWritingSettings,
    renderPureEditingChrome,
} from '../frontend/js/pureEditingChrome.js';
import { initState, state } from '../frontend/js/state.js';

function fileTabs() {
    return [{ id: 'Welcome.md', type: 'file', path: 'Welcome.md', title: 'Welcome.md' }];
}

describe('Pure mode shell', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="app">
                <header class="top-bar">
                    <div class="top-bar-left"><button id="toggle-sidebar">Toggle</button></div>
                    <div class="top-bar-center"><div class="tab-bar"></div></div>
                    <div class="top-bar-right"><button>Settings</button></div>
                </header>
                <div class="main-container">
                    <aside id="sidebar" class="sidebar collapsed"><nav class="sidebar-tools"></nav></aside>
                    <main id="main-content"></main>
                    <aside id="right-sidebar" class="right-sidebar" aria-hidden="true" inert>
                        <div class="right-sidebar-header"></div>
                        <div class="right-sidebar-content"></div>
                    </aside>
                </div>
                <footer id="status-bar" class="status-bar" data-writing-rest="true"></footer>
            </div>
            <input type="checkbox" id="pure-typewriter-toggle" data-pure-setting>
            <select id="pure-focus-scope" data-pure-setting>
                <option value="off">Off</option><option value="phrase">Phrase</option><option value="paragraph">Paragraph</option>
            </select>
            <input type="checkbox" id="pure-adaptive-typography-toggle" data-pure-setting>
        `;
        state.sidebarCollapsed = false;
        state.activeTabId = null;
        state.openTabs = [];
        state.pureTypewriterEnabled = true;
        state.pureFocusScope = 'off';
        state.pureAdaptiveTypographyEnabled = false;
        localStorage.clear();
    });

    test('activates for every file editor with the left rail collapsed', () => {
        const eligible = {
            sidebarCollapsed: true,
            activeTabId: 'Welcome.md',
            openTabs: fileTabs(),
        };

        expect(pureEditingChromeModel(eligible)).toEqual({
            active: true,
            activeTabType: 'file',
        });
        expect(pureEditingChromeModel({ ...eligible, sidebarCollapsed: false }).active).toBe(false);
        expect(pureEditingChromeModel({
            ...eligible,
            activeTabId: 'settings',
            openTabs: [{ id: 'settings', type: 'settings' }],
        }).active).toBe(false);
    });

    test('ignores the retired Pure opt-out when a collapsed file session returns', () => {
        localStorage.setItem('pureEditingChromeEnabled', 'false');
        localStorage.setItem('sidebarCollapsed', 'true');
        initState();
        state.sidebarCollapsed = true;
        state.activeTabId = 'Welcome.md';
        state.openTabs = fileTabs();

        expect(renderPureEditingChrome()).toBe(true);
        expect(localStorage.getItem('pureEditingChromeEnabled')).toBeNull();
    });

    test('applies and removes the shell state as eligibility changes', () => {
        state.sidebarCollapsed = true;
        state.activeTabId = 'Welcome.md';
        state.openTabs = fileTabs();

        expect(renderPureEditingChrome()).toBe(true);
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(true);
        expect(document.getElementById('app').dataset.pureEditingChrome).toBe('true');

        const rightSidebar = document.getElementById('right-sidebar');
        rightSidebar.classList.add('open');
        expect(renderPureEditingChrome()).toBe(true);
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(true);
        expect(rightSidebar.classList.contains('open')).toBe(true);
        expect(rightSidebar.dataset.pureSuppressed).toBe('true');
        expect(rightSidebar.getAttribute('aria-hidden')).toBe('true');
        expect(rightSidebar.hasAttribute('inert')).toBe(true);

        state.sidebarCollapsed = false;
        expect(renderPureEditingChrome()).toBe(false);
        expect(rightSidebar.classList.contains('open')).toBe(true);
        expect(rightSidebar.dataset.pureSuppressed).toBe('false');
        expect(rightSidebar.getAttribute('aria-hidden')).toBe('false');
        expect(rightSidebar.hasAttribute('inert')).toBe(false);
    });

    test('preserves an open right pane while the reactive Pure shell suppresses it', () => {
        state.sidebarCollapsed = true;
        state.activeTabId = 'Welcome.md';
        state.openTabs = fileTabs();
        const rightSidebar = document.getElementById('right-sidebar');
        rightSidebar.classList.add('open');

        expect(initPureEditingChrome()).toBe(true);
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(true);
        expect(rightSidebar.classList.contains('open')).toBe(true);
        expect(rightSidebar.dataset.pureSuppressed).toBe('true');

        state.sidebarCollapsed = false;
        renderPureEditingChrome();
        expect(rightSidebar.classList.contains('open')).toBe(true);
        expect(rightSidebar.getAttribute('aria-hidden')).toBe('false');
    });

    test('binds the compact Pure behavior settings and persists their values', () => {
        state.pureTypewriterEnabled = true;
        state.pureFocusScope = 'phrase';
        state.pureAdaptiveTypographyEnabled = false;
        expect(initPureWritingSettings()).toBe(true);

        const typewriter = document.getElementById('pure-typewriter-toggle');
        const focus = document.getElementById('pure-focus-scope');
        const adaptive = document.getElementById('pure-adaptive-typography-toggle');
        expect(typewriter.checked).toBe(true);
        expect(focus.value).toBe('phrase');
        expect(adaptive.checked).toBe(false);

        typewriter.checked = false;
        typewriter.dispatchEvent(new Event('change', { bubbles: true }));
        focus.value = 'paragraph';
        focus.dispatchEvent(new Event('change', { bubbles: true }));
        adaptive.checked = true;
        adaptive.dispatchEvent(new Event('change', { bubbles: true }));

        expect(localStorage.getItem('pureTypewriterEnabled')).toBe('false');
        expect(localStorage.getItem('pureFocusScope')).toBe('paragraph');
        expect(localStorage.getItem('pureAdaptiveTypographyEnabled')).toBe('true');
    });

    test('re-forms the saved writing view when its active file session returns', () => {
        localStorage.setItem('sidebarCollapsed', 'true');
        initState();
        state.activeTabId = 'Welcome.md';
        state.openTabs = fileTabs();

        expect(renderPureEditingChrome()).toBe(true);
        expect(state.sidebarCollapsed).toBe(true);
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(true);
    });

    test('keeps top chrome edge-revealed while Pure footer exposes only the word count', () => {
        const shell = fs.readFileSync(path.resolve('frontend/styles/shell.css'), 'utf8');
        const status = fs.readFileSync(path.resolve('frontend/styles/status-tools.css'), 'utf8');
        const surfaces = fs.readFileSync(path.resolve('frontend/design-system/theme-surfaces.css'), 'utf8');
        const workspace = fs.readFileSync(path.resolve('frontend/styles/workspace.css'), 'utf8');
        const rightSidebar = fs.readFileSync(path.resolve('frontend/styles/features/right-sidebar.css'), 'utf8');

        expect(shell).toMatch(/#app\.pure-editing-chrome \.top-bar \{[\s\S]*position: absolute;/);
        expect(shell).toMatch(/\.top-bar:hover:not\(:has\(\.top-bar-left:hover\)\) \.top-bar-center/);
        expect(shell).toMatch(/\.top-bar:has\(\.top-bar-center:focus-within\) \.top-bar-center/);
        const editor = fs.readFileSync(path.resolve('frontend/styles/editor.css'), 'utf8');
        expect(editor).toMatch(/#app\.pure-editing-chrome \.editor-outline-launcher \{[\s\S]*display: none !important;/);
        expect(editor).toMatch(/#app\.pure-editing-chrome \.sticky-heading-stack \{[\s\S]*display: none !important;/);
        expect(editor).toMatch(/#app\.pure-editing-chrome \.cm-add-properties \{[\s\S]*opacity: 0;/);
        expect(editor).toMatch(/\.cm-editor\.cm-pure-typewriter \.cm-content \{/);
        expect(workspace).toMatch(/#app\.pure-editing-chrome \.editor-breadcrumb \{[\s\S]*display: none !important;/);
        expect(rightSidebar).toMatch(/#app\.pure-editing-chrome \.right-sidebar\[data-pure-suppressed="true"\] \{[\s\S]*width: 0 !important;/);
        expect(status).toMatch(/#app\.pure-editing-chrome \.status-bar \{[\s\S]*pointer-events: none;/);
        expect(status).toMatch(/#app\.pure-editing-chrome \.status-buffer-right > \* \{[\s\S]*display: none !important;/);
        expect(status).toMatch(/#app\.pure-editing-chrome \.status-buffer-right > #word-count \{[\s\S]*display: inline !important;/);
        expect(status).not.toMatch(/#app\.pure-editing-chrome \.status-bar\[data-application-idle/);
        expect(surfaces).toMatch(/#app\.pure-editing-chrome \.top-bar \{[\s\S]*background: transparent !important;/);
        expect(surfaces).toMatch(/#app\.pure-editing-chrome \.status-bar,[\s\S]*background: transparent !important;/);
        expect(surfaces).toMatch(/var\(--editor-surface\)/);
    });
});

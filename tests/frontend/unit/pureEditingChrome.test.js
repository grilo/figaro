import fs from 'node:fs';
import path from 'node:path';
import { pureEditingChromeModel } from '../frontend/js/core/pureEditingChromeModel.js';
import {
    initPureEditingChrome,
    initPureEditingChromeSetting,
    renderPureEditingChrome,
} from '../frontend/js/pureEditingChrome.js';
import { getState, initState, state } from '../frontend/js/state.js';

function fileTabs() {
    return [{ id: 'Welcome.md', type: 'file', path: 'Welcome.md', title: 'Welcome.md' }];
}

describe('pure editing chrome', () => {
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
                    <aside id="right-sidebar" class="right-sidebar"></aside>
                </div>
                <footer id="status-bar" class="status-bar" data-writing-rest="true"></footer>
            </div>
            <input type="checkbox" id="pure-editing-chrome-toggle">
        `;
        state.pureEditingChromeEnabled = false;
        state.sidebarCollapsed = false;
        state.activeTabId = null;
        state.openTabs = [];
        localStorage.clear();
    });

    test('activates only for an opted-in file editor with the left rail collapsed', () => {
        const eligible = {
            enabled: true,
            sidebarCollapsed: true,
            activeTabId: 'Welcome.md',
            openTabs: fileTabs(),
        };

        expect(pureEditingChromeModel(eligible)).toEqual({
            active: true,
            activeTabType: 'file',
        });
        expect(pureEditingChromeModel({ ...eligible, enabled: false }).active).toBe(false);
        expect(pureEditingChromeModel({ ...eligible, sidebarCollapsed: false }).active).toBe(false);
        expect(pureEditingChromeModel({
            ...eligible,
            activeTabId: 'settings',
            openTabs: [{ id: 'settings', type: 'settings' }],
        }).active).toBe(false);
        expect(pureEditingChromeModel({ ...eligible, detailsPaneOpen: true }).active).toBe(false);
    });

    test('treats a profile without a saved override as pure-enabled', () => {
        state.pureEditingChromeEnabled = true;
        state.sidebarCollapsed = true;
        state.activeTabId = 'Welcome.md';
        state.openTabs = fileTabs();

        expect(renderPureEditingChrome()).toBe(true);
    });

    test('applies and removes the shell state as eligibility changes', () => {
        state.pureEditingChromeEnabled = true;
        state.sidebarCollapsed = true;
        state.activeTabId = 'Welcome.md';
        state.openTabs = fileTabs();

        expect(renderPureEditingChrome()).toBe(true);
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(true);
        expect(document.getElementById('app').dataset.pureEditingChrome).toBe('true');

        document.getElementById('right-sidebar').classList.add('open');
        expect(renderPureEditingChrome()).toBe(false);
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(false);
    });

    test('reacts to the existing right-pane class boundary', async () => {
        state.pureEditingChromeEnabled = true;
        state.sidebarCollapsed = true;
        state.activeTabId = 'Welcome.md';
        state.openTabs = fileTabs();
        const rightSidebar = document.getElementById('right-sidebar');

        expect(initPureEditingChrome()).toBe(true);
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(true);

        rightSidebar.classList.add('open');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(false);

        rightSidebar.classList.remove('open');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.getElementById('app').classList.contains('pure-editing-chrome')).toBe(true);
    });

    test('binds the enabled-by-default control to an explicit persisted opt-out', () => {
        state.pureEditingChromeEnabled = true;
        expect(initPureEditingChromeSetting()).toBe(true);
        const toggle = document.getElementById('pure-editing-chrome-toggle');
        expect(toggle.checked).toBe(true);

        toggle.checked = false;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));

        expect(getState('pureEditingChromeEnabled')).toBe(false);
        expect(localStorage.getItem('pureEditingChromeEnabled')).toBe('false');
    });

    test('re-forms the saved writing view when its active file session returns', () => {
        localStorage.setItem('pureEditingChromeEnabled', 'true');
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

        expect(shell).toMatch(/#app\.pure-editing-chrome \.top-bar \{[\s\S]*position: absolute;/);
        expect(shell).toMatch(/\.top-bar:hover:not\(:has\(\.top-bar-left:hover\)\) \.top-bar-center/);
        expect(shell).toMatch(/\.top-bar:has\(\.top-bar-center:focus-within\) \.top-bar-center/);
        const editor = fs.readFileSync(path.resolve('frontend/styles/editor.css'), 'utf8');
        expect(editor).toMatch(/#app\.pure-editing-chrome \.editor-outline-launcher \{[\s\S]*display: none !important;/);
        expect(status).toMatch(/#app\.pure-editing-chrome \.status-bar \{[\s\S]*pointer-events: none;/);
        expect(status).toMatch(/#app\.pure-editing-chrome \.status-buffer-right > \* \{[\s\S]*display: none !important;/);
        expect(status).toMatch(/#app\.pure-editing-chrome \.status-buffer-right > #word-count \{[\s\S]*display: inline !important;/);
        expect(status).not.toMatch(/#app\.pure-editing-chrome \.status-bar\[data-application-idle/);
        expect(surfaces).toMatch(/#app\.pure-editing-chrome \.top-bar \{[\s\S]*background: transparent !important;/);
        expect(surfaces).toMatch(/#app\.pure-editing-chrome \.status-bar,[\s\S]*background: transparent !important;/);
        expect(surfaces).toMatch(/var\(--editor-surface\)/);
    });
});

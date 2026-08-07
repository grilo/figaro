import { editorBreadcrumbModel } from '../frontend/js/core/editorBreadcrumbModel.js';
import {
    initEditorBreadcrumbSetting,
    renderEditorBreadcrumb,
} from '../frontend/js/editorBreadcrumb.js';
import { getState, setState, state } from '../frontend/js/state.js';

describe('editor breadcrumbs', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <nav id="editor-breadcrumb" aria-label="Current document path" hidden></nav>
            <input type="checkbox" id="editor-breadcrumbs-toggle" aria-label="Show editor breadcrumbs">
        `;
        state.showEditorBreadcrumbs = false;
        state.activeTabId = null;
        state.openTabs = [];
        localStorage.clear();
    });

    test('is disabled by default and does not expose a breadcrumb', () => {
        expect(editorBreadcrumbModel({
            enabled: false,
            activeTabId: 'Projects/Product Roadmap.md',
            openTabs: [{
                id: 'Projects/Product Roadmap.md',
                type: 'file',
                path: 'Projects/Product Roadmap.md',
            }],
        })).toEqual({ visible: false, segments: [] });

        expect(renderEditorBreadcrumb()).toBe(false);
        expect(document.getElementById('editor-breadcrumb').hidden).toBe(true);
    });

    test('renders the active vault-relative file path and updates after a move', () => {
        state.showEditorBreadcrumbs = true;
        state.activeTabId = 'Projects/Product Roadmap.md';
        state.openTabs = [{
            id: 'Projects/Product Roadmap.md',
            type: 'file',
            path: 'Projects/Product Roadmap.md',
        }];

        expect(renderEditorBreadcrumb()).toBe(true);
        expect([...document.querySelectorAll('.editor-breadcrumb-item')].map(item => item.textContent))
            .toEqual(['Projects', 'Product Roadmap.md']);
        expect(document.querySelector('.editor-breadcrumb-item.current').getAttribute('aria-current'))
            .toBe('page');

        state.openTabs[0].path = 'Plans/Next/Product Roadmap.md';
        renderEditorBreadcrumb();
        expect([...document.querySelectorAll('.editor-breadcrumb-item')].map(item => item.textContent))
            .toEqual(['Plans', 'Next', 'Product Roadmap.md']);
    });

    test('hides for workspace tabs and external launch documents', () => {
        expect(editorBreadcrumbModel({
            enabled: true,
            activeTabId: 'settings',
            openTabs: [{ id: 'settings', type: 'settings', title: 'Settings' }],
        }).visible).toBe(false);

        expect(editorBreadcrumbModel({
            enabled: true,
            activeTabId: 'external:launch-1',
            openTabs: [{
                id: 'external:launch-1',
                type: 'file',
                path: '/home/user/outside.md',
                externalFileId: 'launch-1',
            }],
        }).visible).toBe(false);
    });

    test('binds the setting to reactive state and local persistence', () => {
        expect(initEditorBreadcrumbSetting()).toBe(true);
        const toggle = document.getElementById('editor-breadcrumbs-toggle');
        expect(toggle.checked).toBe(false);

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));

        expect(getState('showEditorBreadcrumbs')).toBe(true);
        expect(localStorage.getItem('showEditorBreadcrumbs')).toBe('true');
    });
});

import { testUtils } from './test_setup.js';

let mockSource;
let mockView;
let mockTab;
jest.mock('../frontend/js/editor.js', () => ({
    getEditorContent: () => mockSource,
    getEditorDocumentTabId: () => mockTab.id,
    getEditorView: () => mockView,
}));
jest.mock('../frontend/js/state.js', () => ({
    getState: key => key === 'activeTabId' ? mockTab.id : key === 'openTabs' ? [mockTab] : null,
}));

describe('outline focus and unavailable launcher', () => {
    let outline;
    let listeners;
    let listenSpy;
    beforeEach(() => {
        testUtils.createMockDOM();
        mockSource = '# First\nText\n## Second\nMore';
        mockTab = { id: 'note', type: 'file', path: 'note.md' };
        mockView = {
            state: { selection: { main: { head: 20 } } },
            requestMeasure: jest.fn(), focus: jest.fn(),
            dispatch: jest.fn(), dom: document.createElement('div'),
            scrollDOM: document.createElement('div'),
        };
        listeners = [];
        const original = document.addEventListener.bind(document);
        listenSpy = jest.spyOn(document, 'addEventListener').mockImplementation((...args) => {
            listeners.push(args);
            original(...args);
        });
        jest.isolateModules(() => { outline = require('../frontend/js/outline.js'); });
        outline.initOutlinePanel();
    });
    afterEach(() => {
        mockView.isDestroyed = true;
        for (const args of listeners) document.removeEventListener(...args);
        listenSpy.mockRestore();
    });

    test('explicit outline open focuses the current heading and close restores its launcher', () => {
        const toggle = document.getElementById('outline-toggle');
        toggle.focus();
        toggle.click();
        expect(document.activeElement.textContent).toContain('Second');
        expect(toggle.hidden).toBe(false);
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        document.getElementById('right-sidebar-close').focus();
        outline.closeOutlinePanel();
        expect(document.activeElement).toBe(toggle);
        expect(toggle.hidden).toBe(false);
    });

    test('outline refresh preserves a focused heading but does not take outside focus or steal pane replacements', () => {
        const outside = document.getElementById('raw-text-preview-toggle');
        outside.focus();
        outline.openOutlinePanel();
        expect(document.activeElement).toBe(outside);
        mockSource += '\nMore text';
        document.dispatchEvent(new CustomEvent('editor-view-updated', { detail: { docChanged: true } }));
        expect(document.activeElement).toBe(outside);
        document.querySelector('.outline-item').focus();
        mockSource += '\n## Third';
        document.dispatchEvent(new CustomEvent('editor-view-updated', { detail: { docChanged: true } }));
        expect(document.activeElement.textContent).toContain('First');
        outside.focus();
        outline.closeOutlinePanel({ keepSidebarOpen: true });
        expect(document.activeElement).toBe(outside);
    });

    test('outline heading activation requests top alignment and editor focus without editing source', () => {
        outline.openOutlinePanel();
        document.querySelectorAll('.outline-item')[1].click();
        expect(mockView.dispatch).toHaveBeenCalledTimes(1);
        const transaction = mockView.dispatch.mock.calls[0][0];
        expect(transaction.selection).toEqual({ anchor: mockSource.indexOf('## Second') });
        expect(transaction.effects.value).toMatchObject({ y: 'start', range: { anchor: mockSource.indexOf('## Second') } });
        expect(transaction.changes).toBeUndefined();
        expect(mockView.focus).toHaveBeenCalledTimes(1);
    });

    test.each(['settle', 'wheel', 'touchstart', 'pointerdown', 'keydown', 'source change', 'cursor change', 'destroy'])('outline top alignment respects sticky height and stops on %s', action => {
        jest.useFakeTimers();
        let resized;
        const disconnect = jest.fn();
        const resizeSpy = jest.spyOn(global, 'ResizeObserver').mockImplementation(callback => {
            resized = callback;
            return { observe() {}, disconnect };
        });
        try {
            outline.openOutlinePanel();
            const sticky = document.getElementById('sticky-heading-stack');
            let height = 30;
            sticky.hidden = false;
            jest.spyOn(sticky, 'getBoundingClientRect').mockImplementation(() => ({ height }));
            mockView.state.doc = {};
            mockView.state.selection.main.head = mockSource.indexOf('## Second');
            document.querySelectorAll('.outline-item')[1].click();
            // Slow layout may arrive long after several unchanged animation
            // frames. It must still align, without polling while it waits.
            jest.advanceTimersByTime(500);
            expect(mockView.dispatch).toHaveBeenCalledTimes(1);
            height = 60;
            if (action === 'source change') mockView.state.doc = {};
            else if (action === 'cursor change') mockView.state.selection.main.head++;
            else if (action === 'destroy') mockView.isDestroyed = true;
            else if (action !== 'settle') document.dispatchEvent(new Event(action));
            resized();
            jest.advanceTimersByTime(200);
            expect(mockView.dispatch).toHaveBeenCalledTimes(action === 'settle' ? 2 : 1);
            if (action === 'settle') {
                const followup = mockView.dispatch.mock.calls[1][0];
                expect(followup.effects.value.y).toBe('start');
                expect(followup.selection).toBeUndefined();
                expect(followup.changes).toBeUndefined();
            }
            document.dispatchEvent(new Event('keydown'));
            expect(disconnect).toHaveBeenCalled();
        } finally { resizeSpy.mockRestore(); jest.clearAllTimers(); jest.useRealTimers(); }
    });

    test('unavailable outline stays focusable and explained without accepting activation', () => {
        mockSource = 'No headings';
        document.dispatchEvent(new CustomEvent('editor-view-updated', { detail: { docChanged: true } }));
        const toggle = document.getElementById('outline-toggle');
        expect(toggle.hidden).toBe(false);
        expect(toggle.disabled).toBe(false);
        expect(toggle.getAttribute('aria-disabled')).toBe('true');
        expect(toggle.getAttribute('aria-description')).toContain('no headings');
        expect(toggle.dataset.uiTooltip).toContain('no headings');
        toggle.focus();
        expect(document.activeElement).toBe(toggle);
        toggle.click();
        expect(document.querySelector('.outline-panel')).toBeNull();
        expect(outline.openOutlinePanel()).toBe(false);
        mockSource = '# Available';
        document.dispatchEvent(new CustomEvent('editor-view-updated', { detail: { docChanged: true } }));
        expect(toggle.getAttribute('aria-disabled')).toBe('false');
        toggle.click();
        expect(document.activeElement.textContent).toContain('Available');
    });
});

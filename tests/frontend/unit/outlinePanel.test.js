import { testUtils } from './test_setup.js';

let mockSource;
let mockContentReads = 0;
let mockView;
let mockTab;
jest.mock('../frontend/js/editor.js', () => ({
    getEditorContent: () => { mockContentReads++; return mockSource; },
    getEditorDocumentTabId: () => mockTab.id,
    getEditorView: () => mockView,
}));
jest.mock('../frontend/js/state.js', () => ({
    getState: key => key === 'activeTabId' ? mockTab.id : key === 'openTabs' ? [mockTab] : null,
}));

describe('outline focus and unavailable launcher', () => {
    let outline, publishEditorUpdate;
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
        jest.isolateModules(() => {
            outline = require('../frontend/js/outline.js');
            ({ publishEditorUpdate } = require('../frontend/js/editorUpdates.js'));
        });
        outline.initOutlinePanel();
    });
    afterEach(() => {
        mockView.isDestroyed = true;
        for (const args of listeners) document.removeEventListener(...args);
        listenSpy.mockRestore();
    });

    test('mouse-opened Outline preserves editor focus and selection instead of focusing a heading', () => {
        const typing = document.body.appendChild(document.createElement('textarea'));
        typing.focus(); mockView.hasFocus = true;
        const button = document.getElementById('outline-toggle');
        button.dispatchEvent(new MouseEvent('mousedown', { button: 0, cancelable: true }));
        button.dispatchEvent(new MouseEvent('click', { detail: 1 }));
        expect(document.querySelector('.outline-item')).not.toBeNull();
        expect(document.activeElement).toBe(typing);
        expect(mockView.dispatch).not.toHaveBeenCalled();
        outline.closeOutlinePanel({ restoreFocus: false });
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
        publishEditorUpdate({ docChanged: true });
        expect(document.activeElement).toBe(outside);
        document.querySelector('.outline-item').focus();
        mockSource += '\n## Third';
        publishEditorUpdate({ docChanged: true });
        expect(document.activeElement.textContent).toContain('First');
        outside.focus();
        outline.closeOutlinePanel({ keepSidebarOpen: true });
        expect(document.activeElement).toBe(outside);
    });

    test('cursor and viewport changes reuse the immutable document while active headings and edited headings refresh', () => {
        const { EditorState } = require('@codemirror/state');
        mockView.state.doc = EditorState.create({ doc: mockSource }).doc;
        publishEditorUpdate({ docChanged: true });
        outline.openOutlinePanel();
        mockContentReads = 0;
        for (let index = 0; index < 100; index++) {
            mockView.state.selection.main.head = index % 2 ? 1 : 20;
            publishEditorUpdate({ selectionSet: true, viewportChanged: index % 3 === 0 });
        }
        expect(mockContentReads).toBe(0);
        expect(document.querySelector('.outline-item[aria-current="location"]').textContent).toContain('First');
        mockView.state.selection.main.head = 20;
        publishEditorUpdate({ selectionSet: true });
        expect(document.querySelector('.outline-item[aria-current="location"]').textContent).toContain('Second');
        mockSource = '# Changed\nText\n## Second\nMore';
        mockView.state.doc = EditorState.create({ doc: mockSource }).doc;
        publishEditorUpdate({ docChanged: true });
        expect(mockContentReads).toBe(1);
        expect(document.querySelector('.outline-item').textContent).toContain('Changed');
    });

    test('a thousand-heading Outline touches only the old and new active rows and resets on remount', () => {
        const { EditorState } = require('@codemirror/state');
        mockSource = 'Intro\n\n' + Array.from({ length: 1000 }, (_, i) => `## Section ${i}\nParagraph text here\n\n`).join('');
        mockView.state = EditorState.create({ doc: mockSource, selection: { anchor: mockSource.indexOf('Paragraph') } });
        publishEditorUpdate({ docChanged: true });
        outline.openOutlinePanel();
        const rows = [...document.querySelectorAll('.outline-item')];
        const observer = new MutationObserver(() => {});
        observer.observe(document.getElementById('right-sidebar-content'), { subtree: true, attributes: true,
            attributeFilter: ['class', 'aria-current'] });
        const move = anchor => {
            mockView.state = mockView.state.update({ selection: { anchor } }).state;
            publishEditorUpdate({ selectionSet: true });
        };
        try {
            for (let i = 0; i < 100; i++) move(mockSource.indexOf('Paragraph') + i % 5);
            expect(observer.takeRecords()).toEqual([]);
            move(mockSource.lastIndexOf('Paragraph'));
            const mutations = observer.takeRecords();
            expect(new Set(mutations.map(record => record.target))).toEqual(new Set([rows[0], rows[999]]));
            expect(mutations).toHaveLength(4);
            expect(rows[999].getAttribute('aria-current')).toBe('location');
            move(0);
            expect(new Set(observer.takeRecords().map(record => record.target))).toEqual(new Set([rows[999]]));
            expect(document.querySelector('.outline-item[aria-current]')).toBeNull();
            move(mockSource.indexOf('Paragraph'));
            outline.closeOutlinePanel({ restoreFocus: false });
            outline.openOutlinePanel();
            expect(document.querySelector('.outline-item[aria-current]')).not.toBe(rows[0]);
            expect(document.querySelector('.outline-item[aria-current]').textContent).toContain('Section 0');
        } finally { observer.disconnect(); }
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

    test('typing prose maps headings without full reads or replacing rows and navigation uses the mapped offset', () => {
        const { EditorState } = require('@codemirror/state');
        let state = EditorState.create({ doc: mockSource });
        mockView.state = state;
        publishEditorUpdate({ docChanged: true });
        outline.openOutlinePanel();
        const row = document.querySelectorAll('.outline-item')[1];
        // The assembled tooltip adapter consumes native title attributes.
        // Row reuse must compare the visible heading, not that mutable hint.
        document.querySelectorAll('.outline-item').forEach(item => item.removeAttribute('title'));
        row.focus();
        const mutations = new MutationObserver(() => {});
        mutations.observe(document.querySelector('.outline-panel'), { subtree: true, attributes: true, childList: true });
        const query = jest.spyOn(row, 'querySelector');
        mockContentReads = 0;
        for (let i = 0; i < 20; i++) {
            const previousDocument = state.doc;
            const transaction = state.update({ changes: { from: state.doc.line(2).to, insert: 'x' } });
            state = transaction.state;
            mockView.state = state;
            mockSource = state.doc.toString();
            publishEditorUpdate({
                docChanged: true, previousDocument, changes: transaction.changes,
            });
        }
        expect(mockContentReads).toBe(0);
        expect(mutations.takeRecords()).toEqual([]); mutations.disconnect();
        expect(query).not.toHaveBeenCalled(); query.mockRestore();
        expect(document.querySelectorAll('.outline-item')[1]).toBe(row);
        expect(document.activeElement).toBe(row);
        row.click();
        expect(mockView.dispatch.mock.calls.at(-1)[0].selection.anchor).toBe(mockSource.indexOf('## Second'));
        const previousDocument = state.doc;
        const transaction = state.update({ changes: { from: state.doc.line(2).from, insert: '# ' } });
        mockView.state = transaction.state; mockSource = transaction.state.doc.toString();
        publishEditorUpdate({
            docChanged: true, previousDocument, changes: transaction.changes,
        });
        expect(mockContentReads).toBe(1);
        expect(document.querySelectorAll('.outline-item')).toHaveLength(3);
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
        publishEditorUpdate({ docChanged: true });
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
        publishEditorUpdate({ docChanged: true });
        expect(toggle.getAttribute('aria-disabled')).toBe('false');
        toggle.click();
        expect(document.activeElement.textContent).toContain('Available');
    });
});

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() },
}));

jest.mock('../frontend/js/clipboardImage.js', () => ({
    clipboardImageFile: jest.fn(() => null),
    handleClipboardImagePaste: jest.fn(() => true),
    pasteClipboardImage: jest.fn(async () => true),
    shouldReadClipboardImageAsync: jest.fn(() => false),
}));

import {
    FIGARO_MARKDOWN_CLIPBOARD_TYPE,
    handleClipboardPaste,
    handleMarkdownClipboardCopy,
    handlePlainPasteBypass,
    handlePlainPasteKeydown,
    pasteClipboardPayload,
    pasteClipboardTablePayload,
} from '../frontend/js/clipboardPaste.js';
import {
    clipboardImageFile,
    handleClipboardImagePaste,
} from '../frontend/js/clipboardImage.js';

function testView(text = 'Before selected after', range = { from: 7, to: 15 }) {
    return {
        state: {
            doc: { toString: () => text },
            selection: { ranges: [{ ...range, empty: range.from === range.to }], main: range },
            sliceDoc: (from, to) => text.slice(from, to),
        },
        dispatch: jest.fn(),
    };
}

function clipboard(values = {}) {
    const data = new Map(Object.entries(values));
    return {
        get types() { return [...data.keys()]; },
        getData: type => data.get(type) || '',
        setData: (type, value) => data.set(type, value),
        value: type => data.get(type),
    };
}

function pasteEvent(values) {
    return {
        clipboardData: clipboard(values),
        preventDefault: jest.fn(),
    };
}

describe('central clipboard paste coordinator', () => {
    beforeEach(() => jest.clearAllMocks());

    test('marks copied Figaro Markdown and lets internal paste remain exact', () => {
        const view = testView();
        const event = pasteEvent({});
        expect(handleMarkdownClipboardCopy(event, view)).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(event.clipboardData.value('text/plain')).toBe('selected');
        expect(event.clipboardData.value(FIGARO_MARKDOWN_CLIPBOARD_TYPE)).toBe('1');

        const restrictedEvent = {
            clipboardData: {
                setData: jest.fn((type) => {
                    if (type === FIGARO_MARKDOWN_CLIPBOARD_TYPE) throw new Error('unsupported MIME');
                }),
            },
            preventDefault: jest.fn(),
        };
        expect(handleMarkdownClipboardCopy(restrictedEvent, view)).toBe(true);
        expect(restrictedEvent.clipboardData.setData).toHaveBeenCalledWith('text/plain', 'selected');
        expect(restrictedEvent.preventDefault).toHaveBeenCalledTimes(1);

        const paste = pasteEvent({
            'text/html': '<strong>Selected</strong>',
            'text/plain': '**Selected**',
            [FIGARO_MARKDOWN_CLIPBOARD_TYPE]: '1',
        });
        const parser = globalThis.DOMParser;
        globalThis.DOMParser = jest.fn(() => { throw new Error('must not parse internal source'); });
        try {
            expect(handleClipboardPaste(paste, view, { markdown: true })).toBe(false);
            expect(globalThis.DOMParser).not.toHaveBeenCalled();
        } finally {
            globalThis.DOMParser = parser;
        }
        expect(paste.preventDefault).not.toHaveBeenCalled();
        expect(view.dispatch).not.toHaveBeenCalled();
    });

    test('converts semantic HTML in one undoable paste transaction', () => {
        const view = testView();
        const event = pasteEvent({
            'text/html': '<h2>Heading</h2><p><strong>Body</strong></p>',
            'text/plain': 'Heading\nBody',
        });
        expect(handleClipboardPaste(event, view, { markdown: true })).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(view.dispatch).toHaveBeenCalledTimes(1);
        expect(view.dispatch.mock.calls[0][0]).toMatchObject({
            changes: {
                from: 7,
                to: 15,
                insert: '\n\n## Heading\n\n**Body**\n\n',
            },
            userEvent: 'input.paste',
            scrollIntoView: true,
        });
    });

    test('uses exact plaintext in protected Markdown and explicit bypass contexts', () => {
        const protectedView = testView();
        const protectedPaste = pasteEvent({
            'text/html': '<strong>literal</strong>',
            'text/plain': 'literal',
        });
        expect(handleClipboardPaste(protectedPaste, protectedView, {
            markdown: true,
            protectedContext: true,
        })).toBe(true);
        expect(protectedView.dispatch.mock.calls[0][0].changes.insert).toBe('literal');

        const bypassView = testView();
        handlePlainPasteKeydown({ ctrlKey: true, shiftKey: true, key: 'v' }, bypassView);
        const bypassPaste = pasteEvent({
            'text/html': '<strong>literal</strong>',
            'text/plain': 'literal',
        });
        expect(handlePlainPasteBypass(bypassPaste, bypassView)).toBe(true);
        expect(bypassView.dispatch.mock.calls[0][0].changes.insert).toBe('literal');

        const macView = testView();
        handlePlainPasteKeydown({ metaKey: true, shiftKey: true, key: 'V' }, macView);
        const macPaste = pasteEvent({
            'text/html': '<em>macOS literal</em>',
            'text/plain': 'macOS literal',
        });
        expect(handlePlainPasteBypass(macPaste, macView)).toBe(true);
        expect(macView.dispatch.mock.calls[0][0].changes.insert).toBe('macOS literal');

        const unavailableView = testView();
        handlePlainPasteKeydown({ ctrlKey: true, shiftKey: true, key: 'v' }, unavailableView);
        const unavailablePaste = pasteEvent({ 'text/html': '<strong>No plain representation</strong>' });
        expect(handlePlainPasteBypass(unavailablePaste, unavailableView)).toBe(false);
        expect(handleClipboardPaste(unavailablePaste, unavailableView, { markdown: true })).toBe(false);
        expect(unavailableView.dispatch).not.toHaveBeenCalled();
    });

    test('prefers a validated spreadsheet table over its accompanying image representation', () => {
        clipboardImageFile.mockReturnValueOnce(new Blob(['image'], { type: 'image/png' }));
        const tableView = testView();
        const tablePaste = pasteEvent({
            'image/png': '',
            'text/html': '<table><tr><th>Name</th><th>State</th></tr><tr><td>Alpha</td><td>Ready</td></tr></table>',
            'text/plain': 'Name\tState\nAlpha\tReady',
        });
        expect(handleClipboardPaste(tablePaste, tableView, { markdown: true })).toBe(true);
        expect(tableView.dispatch.mock.calls[0][0].changes.insert).toContain('| Name | State |');
        expect(handleClipboardImagePaste).not.toHaveBeenCalled();
    });

    test('keeps ordinary image paste ahead of general rich conversion', () => {
        clipboardImageFile.mockReturnValueOnce(new Blob(['image'], { type: 'image/png' }));
        const imageView = testView();
        const imagePaste = pasteEvent({
            'image/png': '',
            'text/html': '<strong>caption</strong>',
            'text/plain': 'caption',
        });
        expect(handleClipboardPaste(imagePaste, imageView, { markdown: true })).toBe(true);
        expect(handleClipboardImagePaste).toHaveBeenCalledWith(imagePaste, imageView);
        expect(imageView.dispatch).not.toHaveBeenCalled();
    });

    test('lets plain and non-Markdown native pastes fall through unchanged', () => {
        const proseView = testView();
        const prose = pasteEvent({
            'text/html': '<div><span>Ordinary prose.</span></div>',
            'text/plain': 'Ordinary prose.',
        });
        expect(handleClipboardPaste(prose, proseView, { markdown: true })).toBe(false);
        expect(prose.preventDefault).not.toHaveBeenCalled();

        const codeView = testView();
        const rich = pasteEvent({
            'text/html': '<strong>const value = 1;</strong>',
            'text/plain': 'const value = 1;',
        });
        expect(handleClipboardPaste(rich, codeView, { markdown: false })).toBe(false);
        expect(codeView.dispatch).not.toHaveBeenCalled();
    });

    test('context-menu rich paste shares conversion and falls back to exact plaintext', () => {
        const tableView = testView();
        expect(pasteClipboardTablePayload(tableView, {
            html: '<table><tr><th>Name</th><th>State</th></tr><tr><td>Alpha</td><td>Ready</td></tr></table>',
            text: 'Name\tState\nAlpha\tReady',
        }, { markdown: true })).toBe(true);
        expect(tableView.dispatch.mock.calls[0][0].changes.insert).toContain('| Name | State |');

        const richView = testView();
        expect(pasteClipboardPayload(richView, {
            html: '<strong>Rich</strong>',
            text: 'Rich',
        }, { markdown: true })).toBe(true);
        expect(richView.dispatch.mock.calls[0][0].changes.insert).toBe('**Rich**');

        const plainView = testView();
        expect(pasteClipboardPayload(plainView, {
            html: '<span>Plain</span>',
            text: 'Plain',
        }, { markdown: true })).toBe(true);
        expect(plainView.dispatch.mock.calls[0][0].changes.insert).toBe('Plain');

        const internalView = testView();
        expect(pasteClipboardPayload(internalView, {
            html: '<strong>Internal</strong>',
            text: 'Internal',
            internal: true,
        }, { markdown: true })).toBe(true);
        expect(internalView.dispatch.mock.calls[0][0].changes.insert).toBe('Internal');

        const unavailableView = testView();
        expect(pasteClipboardPayload(unavailableView, {
            html: '<strong>No plain representation</strong>',
            text: '',
        }, { markdown: true, protectedContext: true })).toBe(false);
        expect(unavailableView.dispatch).not.toHaveBeenCalled();
    });
});
